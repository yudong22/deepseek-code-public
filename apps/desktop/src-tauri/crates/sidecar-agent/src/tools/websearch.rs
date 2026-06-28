//! WebSearch tool: delegates search to the LLM provider's native search
//! capability (e.g., DeepSeek enable_search, OpenAI web_search).
//!
//! No third-party search scraping — relies entirely on the provider's
//! built-in search. If the provider doesn't support it, returns a clear
//! error message.

use super::{Tool, ToolContext, ToolResult};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;

pub struct WebSearchTool;

/// Parse search results from the provider's text response.
/// Supports multiple formats used by different LLM providers.
fn extract_search_results(text: &str) -> Vec<Value> {
    let mut results = Vec::new();
    let mut seen_urls = std::collections::HashSet::new();

    // Pattern 1: Markdown link style  `[title](url)`
    let re_md = regex::Regex::new(r"\[([^\]]+)\]\((https?://[^\)]+)\)").unwrap();
    for cap in re_md.captures_iter(text) {
        let title = cap.get(1).map(|m| m.as_str()).unwrap_or("").trim().to_string();
        let url = cap.get(2).map(|m| m.as_str()).unwrap_or("").trim().to_string();
        if title.is_empty() || url.is_empty() || !seen_urls.insert(url.clone()) { continue; }
        if title.len() <= 3 && title.chars().all(|c| c.is_ascii_digit()) { continue; }
        results.push(serde_json::json!({ "title": title, "url": url }));
    }

    // Pattern 2: Bullet-list style (DeepSeek)  `- Title https://url`
    if results.is_empty() {
        let re_bullet = regex::Regex::new(
            r"(?m)^[-\d]+[.)]?\s+(.+?)\s+(https?://[^\s]+)$"
        ).unwrap();
        for cap in re_bullet.captures_iter(text) {
            let title = cap.get(1).map(|m| m.as_str()).unwrap_or("").trim().to_string();
            let url = cap.get(2).map(|m| m.as_str()).unwrap_or("").trim().to_string();
            let title = title.trim_end_matches('.').trim_end_matches('>').trim().to_string();
            if title.is_empty() || url.is_empty() || !seen_urls.insert(url.clone()) { continue; }
            results.push(serde_json::json!({ "title": title, "url": url }));
        }
    }

    // Pattern 3: Last resort — any http(s) URL with context
    if results.is_empty() {
        let re_url = regex::Regex::new(r"(.{0,80}?)\s*(https?://[^\s<>]+)").unwrap();
        for cap in re_url.captures_iter(text) {
            let prefix = cap.get(1).map(|m| m.as_str()).unwrap_or("").trim().to_string();
            let url = cap.get(2).map(|m| m.as_str()).unwrap_or("").trim().to_string();
            if url.is_empty() || !seen_urls.insert(url.clone()) { continue; }
            let title = prefix.trim_start_matches(|c: char| c == '-' || c == '*' || c == '•' || c.is_ascii_digit())
                .trim_start_matches('.').trim().to_string();
            if title.len() < 2 { continue; }
            results.push(serde_json::json!({ "title": title, "url": url }));
        }
    }

    results
}

/// Minimal date helper — returns "2026年6月" for the system prompt.
pub fn current_month_year() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    let days = secs / 86400;
    let mut year = 1970i64;
    let mut remaining = days;
    loop {
        let dpy = if (year % 4 == 0 && year % 100 != 0) || year % 400 == 0 { 366 } else { 365 };
        if remaining < dpy { break; }
        remaining -= dpy;
        year += 1;
    }
    let md: &[i64] = if (year % 4 == 0 && year % 100 != 0) || year % 400 == 0 {
        &[31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    } else {
        &[31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    };
    let months = ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"];
    let mut mi = 0usize;
    for (i, &m) in md.iter().enumerate() { if remaining < m { mi = i; break; } remaining -= m; }
    format!("{}年{}", year, months[mi.min(11)])
}

#[derive(Serialize)]
struct SearchRequest {
    model: String,
    messages: Vec<SearchMessage>,
    stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    enable_search: Option<bool>,
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
    fn name(&self) -> &'static str { "websearch" }

    fn description(&self) -> &'static str {
        "Search the web for current information using the LLM provider's built-in search capability."
    }

    fn input_schema(&self) -> Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "query": { "type": "string", "description": "The search query" },
                "allowed_domains": {
                    "type": "array", "items": { "type": "string" },
                    "description": "Only include results from these domains"
                },
                "blocked_domains": {
                    "type": "array", "items": { "type": "string" },
                    "description": "Exclude results from these domains"
                },
                "max_results": {
                    "type": "integer",
                    "description": "Max results (default 8, max 8)"
                }
            },
            "required": ["query"]
        })
    }

    fn is_read_only(&self) -> bool { true }

    fn execute(&self, input: Value, ctx: &ToolContext) -> ToolResult {
        let query = input.get("query").and_then(|v| v.as_str()).unwrap_or("");
        if query.is_empty() {
            return ToolResult::error("No search query provided");
        }

        let allowed_domains: Vec<String> = input.get("allowed_domains")
            .and_then(|v| v.as_array()).unwrap_or(&vec![])
            .iter().filter_map(|v| v.as_str().map(|s| s.to_lowercase())).collect();

        let blocked_domains: Vec<String> = input.get("blocked_domains")
            .and_then(|v| v.as_array()).unwrap_or(&vec![])
            .iter().filter_map(|v| v.as_str().map(|s| s.to_lowercase())).collect();

        let max_results = input.get("max_results").and_then(|v| v.as_u64()).unwrap_or(8).min(8) as usize;

        let provider = &ctx.provider_config;
        let date_str = current_month_year();

        let mut search_query = query.to_string();
        if !allowed_domains.is_empty() {
            search_query.push_str(&format!(" site:{}", allowed_domains.join(" OR site:")));
        }
        if !blocked_domains.is_empty() {
            search_query.push_str(&format!(" -site:{}", blocked_domains.join(" -site:")));
        }

        // Call provider API with enable_search
        let sys_prompt = format!(
            "You are a web search assistant. Current date: {}.\n\
             Search and list up to {} results, each on one line: \"- Title URL\".\n\
             No commentary, no introduction, no summary.",
            date_str, max_results
        );

        let client = match reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(15))
            .build()
        {
            Ok(c) => c,
            Err(e) => return ToolResult::error(format!("Failed to build HTTP client: {}", e)),
        };

        let request_body = &SearchRequest {
            model: provider.model.clone(),
            messages: vec![
                SearchMessage { role: "system".to_string(), content: sys_prompt },
                SearchMessage { role: "user".to_string(), content: search_query },
            ],
            stream: false,
            enable_search: Some(true),
        };

        let response = match client
            .post(&provider.endpoint_url)
            .header("Authorization", format!("Bearer {}", provider.api_key))
            .header("Content-Type", "application/json")
            .json(request_body)
            .send()
        {
            Ok(r) => r,
            Err(e) => return ToolResult::error(format!(
                "web_search unavailable: provider does not support search or network error: {}",
                e
            )),
        };

        if !response.status().is_success() {
            let status = response.status();
            return ToolResult::error(format!(
                "web_search unavailable: provider returned {} — this LLM may not support web search",
                status
            ));
        }

        let resp: SearchResponse = match response.json() {
            Ok(r) => r,
            Err(e) => return ToolResult::error(format!(
                "web_search unavailable: cannot parse provider response — search may not be enabled: {}",
                e
            )),
        };

        let content = resp.choices.first()
            .map(|c| c.message.content.clone())
            .unwrap_or_default();

        // Detect hallucinated/empty results — provider doesn't truly support search
        if content.trim().is_empty() || content.len() < 20 {
            return ToolResult::error(
                "web_search unavailable: this LLM provider does not support web search. \
                 Do NOT attempt to generate fake search results. \
                 Tell the user plainly that web search is not available."
            );
        }

        // Parse results from provider response
        let results = extract_search_results(&content);
        let display_results: Vec<_> = results.into_iter().take(max_results).collect();

        // Format output (Claude Code style)
        let formatted = if display_results.is_empty() {
            format!(
                "Web search results for query: \"{}\"\n\nNo results found.\n\n\
                 REMINDER: You MUST cite any sources you reference using markdown \
                 hyperlinks, e.g. [Source Title](URL).",
                query
            )
        } else {
            let links: Vec<String> = display_results.iter().map(|r| {
                let t = r["title"].as_str().unwrap_or("");
                let u = r["url"].as_str().unwrap_or("");
                format!("{{\"title\":\"{}\",\"url\":\"{}\"}}", t, u)
            }).collect();
            format!(
                "Web search results for query: \"{}\"\n\n\
                 Links: [{}]\n\
                 REMINDER: You MUST cite the sources above in your response to the \
                 user using markdown hyperlinks, e.g. [Source Title](URL).",
                query,
                links.join(", ")
            )
        };

        ToolResult::success(serde_json::json!({ "message": formatted }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_markdown_links() {
        let text = "1. [Rust 2026](https://pghq.dev) 2. [Wren](https://wrenlearnsrust.com)";
        let results = extract_search_results(text);
        assert_eq!(results.len(), 2);
        assert_eq!(results[0]["url"], "https://pghq.dev");
    }

    #[test]
    fn test_bullet_list_format() {
        let text = "- 红烧茄子 - 下厨房 https://www.xiachufang.com/recipe/100050164/\n\
                    - 家常菜 - 豆果 https://www.douguo.com/cookbook/123456.html";
        let results = extract_search_results(text);
        assert_eq!(results.len(), 2);
        assert_eq!(results[0]["url"], "https://www.xiachufang.com/recipe/100050164/");
    }

    #[test]
    fn test_empty_text() {
        assert!(extract_search_results("").is_empty());
    }

    #[test]
    fn test_markdown_links_skip_footnotes() {
        let text = "1. [Rust Blog](https://blog.rust-lang.org/)\n[1] [2] [3]";
        let results = extract_search_results(text);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0]["url"], "https://blog.rust-lang.org/");
    }
}
