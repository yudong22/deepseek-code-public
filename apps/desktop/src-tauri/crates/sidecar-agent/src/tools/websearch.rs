//! WebSearch tool: delegates search to the LLM provider's native web search
//! capability (same pattern as Claude Code's web_search_20250305 server-side tool).
//!
//! The tool makes a lightweight API call to the provider with a search-oriented
//! system prompt + the query as a user message. The provider's built-in web search
//! (e.g., DeepSeek's `enable_search`, or OpenAI/Anthropic equivalents) handles
//! the actual search and returns cited results.
//!
//! Falls back to DuckDuckGo Lite scraping only when the provider has no search support.

use super::{Tool, ToolContext, ToolResult};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;

pub struct WebSearchTool;

/// Minimal date helper — returns "2026年6月" for the system prompt.
/// Public so agent.rs can inject the date into the websearch citation prompt.
/// Avoids pulling in chrono just for one string.
pub fn current_month_year() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    let days = secs / 86400;
    let mut year = 1970i64;
    let mut remaining = days;
    loop {
        let days_in_year = if (year % 4 == 0 && year % 100 != 0) || year % 400 == 0 { 366 } else { 365 };
        if remaining < days_in_year { break; }
        remaining -= days_in_year;
        year += 1;
    }
    let month_days: &[i64] = if (year % 4 == 0 && year % 100 != 0) || year % 400 == 0 {
        &[31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    } else {
        &[31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    };
    let months = ["1月", "2月", "3月", "4月", "5月", "6月",
                   "7月", "8月", "9月", "10月", "11月", "12月"];
    let mut month_idx = 0usize;
    for (i, &md) in month_days.iter().enumerate() {
        if remaining < md { month_idx = i; break; }
        remaining -= md;
    }
    format!("{}年{}", year, months[month_idx.min(11)])
}

/// Parse search results from the provider's response.
/// Supports multiple formats used by different LLM providers.
fn extract_search_results(text: &str) -> Vec<Value> {
    let mut results = Vec::new();
    let mut seen_urls = std::collections::HashSet::new();

    // Pattern 1: Markdown link style  `[title](url)`
    let re_md_link = regex::Regex::new(r"\[([^\]]+)\]\((https?://[^\)]+)\)").unwrap();
    for cap in re_md_link.captures_iter(text) {
        let title = cap.get(1).map(|m| m.as_str()).unwrap_or("").trim().to_string();
        let url = cap.get(2).map(|m| m.as_str()).unwrap_or("").trim().to_string();
        if title.is_empty() || url.is_empty() || !seen_urls.insert(url.clone()) { continue; }
        if title.len() <= 3 && title.chars().all(|c| c.is_ascii_digit()) { continue; }
        results.push(serde_json::json!({ "title": title, "url": url, "snippet": "" }));
    }

    // Pattern 2: Bullet-list style (DeepSeek, others)
    //   "- Title text https://example.com"
    //   "1. Title text https://example.com"
    //   "- [Title](https://example.com)"
    // Captures title text BEFORE the URL on the same line.
    if results.is_empty() {
        let re_bullet = regex::Regex::new(
            r"(?m)^[-\d]+[.)]?\s+(.+?)\s+(https?://[^\s]+)$"
        ).unwrap();
        for cap in re_bullet.captures_iter(text) {
            let title = cap.get(1).map(|m| m.as_str()).unwrap_or("").trim().to_string();
            let url = cap.get(2).map(|m| m.as_str()).unwrap_or("").trim().to_string();
            // Strip trailing period/punctuation that got included in the title
            let title = title.trim_end_matches('.').trim_end_matches('>').trim().to_string();
            if title.is_empty() || url.is_empty() || !seen_urls.insert(url.clone()) { continue; }
            results.push(serde_json::json!({ "title": title, "url": url, "snippet": "" }));
        }
    }

    // Pattern 3: JSON-style search_results block (structured API responses)
    if results.is_empty() {
        let re_json_block = regex::Regex::new(r#""results"\s*:\s*\[([\s\S]*?)\]"#).unwrap();
        if let Some(cap) = re_json_block.captures(text) {
            let inner = &cap[1];
            let re_entry = regex::Regex::new(r#"\{"title"\s*:\s*"([^"]+)"\s*,\s*"url"\s*:\s*"([^"]+)"[^}]*\}"#).unwrap();
            for entry_cap in re_entry.captures_iter(inner) {
                let title = entry_cap.get(1).map(|m| m.as_str()).unwrap_or("");
                let url = entry_cap.get(2).map(|m| m.as_str()).unwrap_or("");
                if seen_urls.insert(url.to_string()) {
                    results.push(serde_json::json!({ "title": title, "url": url, "snippet": "" }));
                }
            }
        }
    }

    // Pattern 4: Last resort — extract any http(s):// URL with surrounding context
    if results.is_empty() {
        let re_url = regex::Regex::new(r"(.{0,80}?)\s*(https?://[^\s<>]+)").unwrap();
        for cap in re_url.captures_iter(text) {
            let prefix = cap.get(1).map(|m| m.as_str()).unwrap_or("").trim().to_string();
            let url = cap.get(2).map(|m| m.as_str()).unwrap_or("").trim().to_string();
            if url.is_empty() || !seen_urls.insert(url.clone()) { continue; }
            // Use preceding text as title, clean up bullet/number markers
            let title = prefix
                .trim_start_matches(|c: char| c == '-' || c == '*' || c == '•' || c.is_ascii_digit())
                .trim_start_matches('.')
                .trim()
                .to_string();
            if title.len() < 2 { continue; }
            results.push(serde_json::json!({ "title": title, "url": url, "snippet": "" }));
        }
    }

    results
}

/// Search request/response for the provider API call.
#[derive(Serialize)]
struct SearchRequest {
    model: String,
    messages: Vec<SearchMessage>,
    stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    enable_search: Option<bool>, // DeepSeek-style
}

#[derive(Serialize)]
struct SearchMessage {
    role: String,
    content: String,
}

#[derive(Deserialize)]
struct SearchResponse {
    choices: Vec<SearchChoice>,
}

#[derive(Deserialize)]
struct SearchChoice {
    message: SearchRespMessage,
}

#[derive(Deserialize)]
struct SearchRespMessage {
    content: String,
}

impl Tool for WebSearchTool {
    fn name(&self) -> &'static str {
        "websearch"
    }

    fn description(&self) -> &'static str {
        "Search the web for current information using the LLM provider's built-in search. \
         Returns a list of titles, URLs, and summaries."
    }

    fn input_schema(&self) -> Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query to use"
                },
                "allowed_domains": {
                    "type": "array",
                    "items": { "type": "string" },
                    "description": "Only include search results from these domains"
                },
                "blocked_domains": {
                    "type": "array",
                    "items": { "type": "string" },
                    "description": "Never include search results from these domains"
                },
                "max_results": {
                    "type": "integer",
                    "description": "Maximum number of results to return (default 8, max 8)"
                }
            },
            "required": ["query"]
        })
    }

    fn is_read_only(&self) -> bool {
        true
    }

    fn execute(&self, input: Value, ctx: &ToolContext) -> ToolResult {
        let query = input.get("query").and_then(|v| v.as_str()).unwrap_or("");
        if query.is_empty() {
            return ToolResult::error("No search query provided");
        }

        let allowed_domains: Vec<String> = input
            .get("allowed_domains")
            .and_then(|v| v.as_array())
            .unwrap_or(&vec![])
            .iter()
            .filter_map(|v| v.as_str().map(|s| s.to_lowercase()))
            .collect();

        let blocked_domains: Vec<String> = input
            .get("blocked_domains")
            .and_then(|v| v.as_array())
            .unwrap_or(&vec![])
            .iter()
            .filter_map(|v| v.as_str().map(|s| s.to_lowercase()))
            .collect();

        let max_results = input
            .get("max_results")
            .and_then(|v| v.as_u64())
            .unwrap_or(8)
            .min(8) as usize;

        // ── DuckDuckGo Lite (real search, no LLM hallucinations) ──
        // DDG returns real scraped results — URLs actually exist.
        // Provider search (enable_search) temporarily disabled — causes 404 hallucinated URLs.
        let ddg_result = match self.do_ddg_search(query, &allowed_domains, &blocked_domains, max_results) {
            Ok(r) => r,
            Err(e) => return ToolResult::error(format!("Search failed: {}", e)),
        }; // TODO(v0.6.1): re-enable provider fallback when DeepSeek search stabilizes

        let display_results: Vec<Value> = ddg_result.into_iter().take(max_results).collect();

        // ── Format output (Claude Code style) ──
        let formatted = format_search_output(query, &display_results, None);

        ToolResult::success(serde_json::json!({
            "message": formatted
        }))
    }
}

impl WebSearchTool {
    /// Primary: DuckDuckGo Lite — real scraped results, no hallucinations.
    fn do_ddg_search(
        &self,
        query: &str,
        allowed_domains: &[String],
        blocked_domains: &[String],
        max_results: usize,
    ) -> Result<Vec<serde_json::Value>, String> {
        let encoded: String = url::form_urlencoded::byte_serialize(query.as_bytes()).collect();
        let ddg_url = format!("https://lite.duckduckgo.com/lite/?q={}", encoded);

        let fut = async {
            let client = reqwest::Client::builder()
                .timeout(Duration::from_secs(10))
                .build()
                .map_err(|e| format!("Failed to build client: {}", e))?;

            let response = client
                .get(&ddg_url)
                .header("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36")
                .send()
                .await
                .map_err(|e| format!("HTTP request failed: {}", e))?;

            response
                .text()
                .await
                .map_err(|e| format!("Failed to read response: {}", e))
        };

        let fetch_result = match tokio::runtime::Handle::try_current() {
            Ok(handle) => handle.block_on(fut),
            Err(_) => {
                let rt = tokio::runtime::Runtime::new().unwrap();
                rt.block_on(fut)
            }
        };

        let html = fetch_result.map_err(|e| format!("DDG fetch failed: {}", e))?;

        // Parse DDG results — class-agnostic approach.
        // Extract any <a> tag with an external http(s) URL and non-empty text.
        // Filter out navigation/internal links by checking the URL structure.
        let re_link = regex::Regex::new(
            r#"<a[^>]*href="((?:https?:)?//[^"]+)"[^>]*>([^<]+)</a>"#
        ).unwrap();

        let mut results = Vec::new();
        let mut seen = std::collections::HashSet::new();
        for cap in re_link.captures_iter(&html) {
            let raw_url = cap.get(1).map(|m| m.as_str()).unwrap_or("");
            let title = cap.get(2).map(|m| m.as_str()).unwrap_or("").trim().to_string();

            // Skip empty, DDG internal links, navigation
            if raw_url.is_empty() || title.is_empty() { continue; }
            if title.len() < 3 { continue; }
            if raw_url.contains("duckduckgo.com") { continue; }

            let clean_url = if raw_url.starts_with("//") {
                format!("https:{}", raw_url)
            } else if raw_url.starts_with("http") {
                raw_url.to_string()
            } else {
                continue;
            };

            if !seen.insert(clean_url.clone()) { continue; }

            // Resolve uddg= redirect
            let final_url = if let Ok(parsed) = url::Url::parse(&clean_url) {
                let mut target = clean_url.clone();
                for (key, val) in parsed.query_pairs() {
                    if key == "uddg" { target = val.into_owned(); break; }
                }
                target
            } else { clean_url };

            // Filter by domains
            if !allowed_domains.is_empty() || !blocked_domains.is_empty() {
                if let Ok(parsed) = url::Url::parse(&final_url) {
                    if let Some(host) = parsed.host_str().map(|h| h.to_lowercase()) {
                        if !allowed_domains.is_empty() {
                            let allowed = allowed_domains.iter().any(|d| host == *d || host.ends_with(&format!(".{}", d)));
                            if !allowed { continue; }
                        }
                        if !blocked_domains.is_empty() {
                            let blocked = blocked_domains.iter().any(|d| host == *d || host.ends_with(&format!(".{}", d)));
                            if blocked { continue; }
                        }
                    }
                }
            }

            let snippet = String::new(); // DDG Lite doesn't show snippets inline
            results.push(serde_json::json!({
                "title": title,
                "url": final_url,
                "snippet": snippet
            }));

            if results.len() >= max_results { break; }
        }

        Ok(results)
    }

    /// Fallback: provider API search (DeepSeek enable_search).
    fn do_provider_search(
        &self,
        query: &str,
        allowed_domains: &[String],
        blocked_domains: &[String],
        max_results: usize,
        provider: &crate::provider::ProviderConfig,
    ) -> Result<Vec<serde_json::Value>, String> {
        let date_str = current_month_year();
        let mut search_query = query.to_string();
        if !allowed_domains.is_empty() {
            search_query.push_str(&format!(" site:{}", allowed_domains.join(" OR site:")));
        }
        if !blocked_domains.is_empty() {
            search_query.push_str(&format!(" -site:{}", blocked_domains.join(" -site:")));
        }

        let fut = async {
            let client = reqwest::Client::builder()
                .timeout(Duration::from_secs(15))
                .build()
                .map_err(|e| format!("Failed to build client: {}", e))?;

            let sys_prompt = format!(
                "You are a web search assistant. The current date is {}.\n\
                 Search the query and list up to {} results, each on a new line as: \
                 \"- Title URL\". Do not add any commentary, introduction, or summary.",
                date_str, max_results
            );
            let request_body = &SearchRequest {
                model: provider.model.clone(),
                messages: vec![
                    SearchMessage { role: "system".to_string(), content: sys_prompt },
                    SearchMessage { role: "user".to_string(), content: search_query },
                ],
                stream: false,
                enable_search: Some(true),
            };

            let response = client
                .post(&provider.endpoint_url)
                .header("Authorization", format!("Bearer {}", provider.api_key))
                .header("Content-Type", "application/json")
                .json(request_body)
                .send()
                .await
                .map_err(|e| format!("Provider request failed: {}", e))?;

            if !response.status().is_success() {
                return Err(format!("Provider returned {}", response.status()));
            }

            let resp: SearchResponse = response.json().await.map_err(|e| format!("Parse error: {}", e))?;
            let content = resp.choices.first().map(|c| c.message.content.clone()).unwrap_or_default();
            Ok(content)
        };

        let content = match tokio::runtime::Handle::try_current() {
            Ok(h) => h.block_on(fut),
            Err(_) => tokio::runtime::Runtime::new().unwrap().block_on(fut),
        }?;

        Ok(extract_search_results(&content))
    }
}

/// Format search results into the Claude Code-style output message.
fn format_search_output(query: &str, results: &[serde_json::Value], note: Option<&str>) -> String {
    let mut out = format!("Web search results for query: \"{}\"\n\n", query);

    if let Some(n) = note {
        out.push_str(&format!("Note: {}\n\n", n));
    }

    if results.is_empty() {
        out.push_str("No results found.\n");
    } else {
        let links: Vec<String> = results.iter().map(|r| {
            let t = r["title"].as_str().unwrap_or("");
            let u = r["url"].as_str().unwrap_or("");
            format!("{{\"title\":\"{}\",\"url\":\"{}\"}}", t, u)
        }).collect();
        out.push_str(&format!("Links: [{}]\n", links.join(", ")));
    }

    out.push_str(
        "REMINDER: You MUST cite the sources above in your response to the \
         user using markdown hyperlinks, e.g. [Source Title](URL)."
    );
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_markdown_links() {
        let text = r#"Here are some results:

1. [Rust 2026 Edition](https://pghq.dev/article/rust-2026-edition)
2. [What's Coming in Rust 2026](https://wrenlearnsrust.com/posts/whats-coming-in-rust-2026.html)

Summary..."#;
        let results = extract_search_results(text);
        assert_eq!(results.len(), 2);
        assert_eq!(results[0]["title"], "Rust 2026 Edition");
        assert_eq!(results[1]["url"], "https://wrenlearnsrust.com/posts/whats-coming-in-rust-2026.html");
    }

    #[test]
    fn test_markdown_links_extracted_numeric_refs_skipped() {
        let text = r#"Results:
1. [Rust Blog](https://blog.rust-lang.org/)
[1] [2] [3]"#;
        let results = extract_search_results(text);
        // Should capture the real markdown link, skip footnote refs (no URLs)
        assert_eq!(results.len(), 1, "should extract exactly 1 real link");
        assert_eq!(results[0]["url"], "https://blog.rust-lang.org/");
        assert_eq!(results[0]["title"], "Rust Blog");
    }

    #[test]
    fn test_bullet_list_format_deepseek() {
        // Exact format from DeepSeek's search response
        let text = r#"- 红烧茄子的家常做法 - 下厨房 https://www.xiachufang.com/recipe/100050164/
- 家常红烧茄子 - 豆果美食 https://www.douguo.com/cookbook/123456.html
- 红烧茄子（超简单家常版） - 美食天下 https://www.meishitianxia.com/recipe/23621.html"#;
        let results = extract_search_results(text);
        assert_eq!(results.len(), 3, "should extract all 3 bullet-list items");
        assert_eq!(results[0]["title"], "红烧茄子的家常做法 - 下厨房");
        assert_eq!(results[0]["url"], "https://www.xiachufang.com/recipe/100050164/");
        assert_eq!(results[1]["title"], "家常红烧茄子 - 豆果美食");
    }

    #[test]
    fn test_empty_text() {
        let results = extract_search_results("");
        assert!(results.is_empty());
    }

    #[test]
    fn test_json_results_block_parses_entries() {
        // Verify JSON block regex extracts structured search_results
        let text = r#"{"results": [{"title": "T", "url": "https://a.com", "other": 1}, {"title": "B", "url": "https://b.com"}]}"#;
        let results = extract_search_results(text);
        assert_eq!(results.len(), 2, "should parse 2 entries from JSON results block");
        assert_eq!(results[0]["title"], "T");
        assert_eq!(results[1]["url"], "https://b.com");
    }
}
