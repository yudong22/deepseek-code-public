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

/// Parse search results from the provider's streaming response.
/// DeepSeek and other providers embed search results as citations in the text
/// or as structured `search_results` in the response.
fn extract_search_results(text: &str) -> Vec<Value> {
    let mut results = Vec::new();

    // Pattern 1: Markdown links with citation style: `[title](url)` after a heading
    let re_md_link = regex::Regex::new(r"\[([^\]]+)\]\((https?://[^\)]+)\)").unwrap();
    let mut seen_urls = std::collections::HashSet::new();

    for cap in re_md_link.captures_iter(text) {
        let title = cap.get(1).map(|m| m.as_str()).unwrap_or("").trim().to_string();
        let url = cap.get(2).map(|m| m.as_str()).unwrap_or("").trim().to_string();

        if !title.is_empty() && !url.is_empty() && seen_urls.insert(url.clone()) {
            // Skip footnote/ref-style markers
            if title.len() <= 3 && title.chars().all(|c| c.is_ascii_digit()) {
                continue;
            }
            results.push(serde_json::json!({
                "title": title,
                "url": url,
                "snippet": ""
            }));
        }
    }

    // Pattern 2: YAML/JSON-style search_results block (some providers return structured data)
    if results.is_empty() {
        let re_json_block = regex::Regex::new(r#""results"\s*:\s*\[([\s\S]*?)\]"#).unwrap();
        if let Some(cap) = re_json_block.captures(text) {
            let inner = &cap[1];
            let re_entry = regex::Regex::new(r#"\{"title"\s*:\s*"([^"]+)"\s*,\s*"url"\s*:\s*"([^"]+)"[^}]*\}"#).unwrap();
            for entry_cap in re_entry.captures_iter(inner) {
                let title = entry_cap.get(1).map(|m| m.as_str()).unwrap_or("");
                let url = entry_cap.get(2).map(|m| m.as_str()).unwrap_or("");
                if seen_urls.insert(url.to_string()) {
                    results.push(serde_json::json!({
                        "title": title,
                        "url": url,
                        "snippet": ""
                    }));
                }
            }
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

        // Use the provider's API for web search.
        // Claude Code pattern: the web_search tool delegates to the LLM API,
        // which handles the actual search server-side.
        let provider = &ctx.provider_config;

        // Build domain constraints into the query if present
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

            // Provider-native search: send a focused request. The provider's
            // built-in web search (enable_search for DeepSeek, tool_choice for
            // others) will handle the actual search server-side.
            let request_body = &SearchRequest {
                model: provider.model.clone(),
                messages: vec![
                    SearchMessage {
                        role: "system".to_string(),
                        content: format!(
                            "You are a web search assistant. Search for the following query \
                             and return the top results as a list. For each result include \
                             the title and URL. Do not add commentary.\n\
                             Query: {}",
                            search_query
                        ),
                    },
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
                .map_err(|e| format!("Provider search request failed: {}", e))?;

            if !response.status().is_success() {
                let status = response.status();
                let body = response.text().await.unwrap_or_default();
                return Err(format!("Provider returned error {}: {}", status, body));
            }

            let resp: SearchResponse = response
                .json()
                .await
                .map_err(|e| format!("Failed to parse search response: {}", e))?;

            let content = resp
                .choices
                .first()
                .map(|c| c.message.content.clone())
                .unwrap_or_default();

            Ok(content)
        };

        let search_result = match tokio::runtime::Handle::try_current() {
            Ok(handle) => handle.block_on(fut),
            Err(_) => {
                let rt = tokio::runtime::Runtime::new().unwrap();
                rt.block_on(fut)
            }
        };

        let content = match search_result {
            Ok(c) => c,
            Err(e) => {
                // Fallback: if provider search failed, try DuckDuckGo Lite
                return self.fallback_ddg(query, &allowed_domains, &blocked_domains, &e);
            }
        };

        // Parse search results from the provider's response
        let results = extract_search_results(&content);

        ToolResult::success(serde_json::json!({
            "query": query,
            "results": results,
            "provider": provider.model,
            "raw_text": content
        }))
    }
}

impl WebSearchTool {
    /// Fallback to DuckDuckGo Lite when the provider doesn't support search.
    fn fallback_ddg(
        &self,
        query: &str,
        allowed_domains: &[String],
        blocked_domains: &[String],
        provider_error: &str,
    ) -> ToolResult {
        let encoded: String = url::form_urlencoded::byte_serialize(query.as_bytes()).collect();
        let ddg_url = format!("https://lite.duckduckgo.com/lite/?q={}", encoded);

        let fut = async {
            let client = reqwest::Client::builder()
                .timeout(Duration::from_secs(10))
                .build()
                .map_err(|e| format!("Failed to build client: {}", e))?;

            let response = client
                .get(&ddg_url)
                .header("User-Agent", "deepseek-code/0.6.0")
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

        let html = match fetch_result {
            Ok(h) => h,
            Err(e) => {
                return ToolResult::error(format!(
                    "Provider search failed ({}), and DDG fallback also failed: {}",
                    provider_error, e
                ))
            }
        };

        // Parse DDG Lite results
        let re_link = regex::Regex::new(
            r#"<a[^>]*href="([^"]+)"[^>]*class="result-link"[^>]*>([^<]+)</a>"#
        ).unwrap();
        let re_snippet = regex::Regex::new(
            r#"<span[^>]*class="result-snippet"[^>]*>([\s\S]*?)</span>"#
        ).unwrap();

        let mut results = Vec::new();
        for cap in re_link.captures_iter(&html) {
            let raw_url = cap.get(1).map(|m| m.as_str()).unwrap_or("");
            let title = cap.get(2).map(|m| m.as_str()).unwrap_or("").trim().to_string();

            if raw_url.is_empty() || title.is_empty() { continue; }

            let clean_url = if raw_url.starts_with("//") {
                format!("https:{}", raw_url)
            } else if raw_url.starts_with('/') {
                continue;
            } else if raw_url.starts_with("http") {
                raw_url.to_string()
            } else {
                continue;
            };

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

            if results.len() >= 8 { break; }
        }

        ToolResult::success(serde_json::json!({
            "query": query,
            "results": results,
            "provider": "duckduckgo_lite_fallback",
            "note": format!("Provider search unavailable: {}", provider_error)
        }))
    }
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
