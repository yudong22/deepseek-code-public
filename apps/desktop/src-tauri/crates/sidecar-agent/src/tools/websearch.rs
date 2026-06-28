//! WebSearch tool: queries DuckDuckGo Lite HTML search directly, parses results,
//! and supports allowed_domains and blocked_domains filters.
//!
//! Uses lite.duckduckgo.com (designed for scraping — stable, minimal HTML)
//! rather than the full site whose class names change frequently.

use super::{Tool, ToolContext, ToolResult};
use serde_json::Value;
use std::time::Duration;

pub struct WebSearchTool;

/// Strip HTML tags and decode common entities.
fn sanitize_html(text: &str) -> String {
    let re_tag = regex::Regex::new(r"<[^>]*>").unwrap();
    let stripped = re_tag.replace_all(text, "");
    stripped
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#x27;", "'")
        .replace("&#39;", "'")
        .replace("&nbsp;", " ")
        .trim()
        .to_string()
}

impl Tool for WebSearchTool {
    fn name(&self) -> &'static str {
        "websearch"
    }

    fn description(&self) -> &'static str {
        "Search the web for current information. Returns a list of titles, URLs, and snippets."
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

    fn execute(&self, input: Value, _ctx: &ToolContext) -> ToolResult {
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

        // Use lite.duckduckgo.com — stable HTML, built for programmatic access
        let encoded_query: String = url::form_urlencoded::byte_serialize(query.as_bytes()).collect();
        let lite_url = format!("https://lite.duckduckgo.com/lite/?q={}", encoded_query);

        // Fetch the page
        let fut = async {
            let client = reqwest::Client::builder()
                .timeout(Duration::from_secs(10))
                .build()
                .map_err(|e| format!("Failed to build client: {}", e))?;

            let response = client
                .get(&lite_url)
                .header("User-Agent", "deepseek-code/0.6.0")
                .send()
                .await
                .map_err(|e| format!("HTTP request failed: {}", e))?;

            if !response.status().is_success() {
                return Err(format!("DuckDuckGo returned error status: {}", response.status()));
            }

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
            Err(e) => return ToolResult::error(e),
        };

        // Parse lite.duckduckgo.com HTML results.
        //
        // Each result row looks like:
        //   <a rel="nofollow" href="https://..." class="result-link">Title</a>
        //   <span class="result-snippet">Snippet text...</span>
        //   <span class="link-text">display-url</span>
        //
        // Results are separated by <td> blocks; each result has a result-link <a>.
        let re_result_block = regex::Regex::new(
            r#"<a[^>]*href="([^"]+)"[^>]*class="result-link"[^>]*>([^<]+)</a>"#
        ).unwrap();

        let re_snippet = regex::Regex::new(
            r#"<span[^>]*class="result-snippet"[^>]*>([\s\S]*?)</span>"#
        ).unwrap();

        let mut results = Vec::new();
        let mut last_end = 0usize;

        // Walk through each result-link anchor to extract (url, title)
        for cap in re_result_block.captures_iter(&html) {
            let link_match = cap.get(0).unwrap();
            let raw_url = cap.get(1).map(|m| m.as_str()).unwrap_or("");
            let title = cap.get(2).map(|m| m.as_str()).unwrap_or("").trim().to_string();

            if raw_url.is_empty() || title.is_empty() {
                continue;
            }

            // Resolve protocol-relative or path-relative URLs
            let clean_url = if raw_url.starts_with("//") {
                format!("https:{}", raw_url)
            } else if raw_url.starts_with('/') {
                continue; // internal DuckDuckGo links, skip
            } else if raw_url.starts_with("http") {
                raw_url.to_string()
            } else {
                continue;
            };

            // Try to extract the DuckDuckGo redirect target (uddg= param)
            let final_url = if let Ok(parsed) = url::Url::parse(&clean_url) {
                let mut found = false;
                let mut target = clean_url.clone();
                for (key, val) in parsed.query_pairs() {
                    if key == "uddg" {
                        target = val.into_owned();
                        found = true;
                        break;
                    }
                }
                if !found { clean_url } else { target }
            } else {
                clean_url
            };

            // Extract snippet from the HTML following this link (up to the next result)
            let search_start = link_match.end();
            let search_end = html[search_start..]
                .find(r#"class="result-link""#)
                .map(|pos| search_start + pos)
                .unwrap_or(html.len());

            let snippet = if search_end > search_start {
                let chunk = &html[search_start..search_end.min(html.len())];
                re_snippet
                    .captures(chunk)
                    .and_then(|c| c.get(1))
                    .map(|m| sanitize_html(m.as_str()))
                    .unwrap_or_default()
            } else {
                String::new()
            };

            // Domain filtering
            if !allowed_domains.is_empty() || !blocked_domains.is_empty() {
                if let Ok(parsed) = url::Url::parse(&final_url) {
                    if let Some(hostname) = parsed.host_str().map(|h| h.to_lowercase()) {
                        if !allowed_domains.is_empty() {
                            let mut allowed = false;
                            for domain in &allowed_domains {
                                if hostname == *domain || hostname.ends_with(&format!(".{}", domain)) {
                                    allowed = true;
                                    break;
                                }
                            }
                            if !allowed { continue; }
                        }
                        if !blocked_domains.is_empty() {
                            let mut blocked = false;
                            for domain in &blocked_domains {
                                if hostname == *domain || hostname.ends_with(&format!(".{}", domain)) {
                                    blocked = true;
                                    break;
                                }
                            }
                            if blocked { continue; }
                        }
                    }
                }
            }

            results.push(serde_json::json!({
                "title": title,
                "url": final_url,
                "snippet": snippet
            }));

            last_end = search_end;
            if results.len() >= 8 {
                break;
            }
        }

        ToolResult::success(serde_json::json!({
            "query": query,
            "results": results
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sanitize_html_tags() {
        assert_eq!(sanitize_html("<p>Hello &amp; welcome</p>"), "Hello & welcome");
        assert_eq!(sanitize_html("<b>bold</b> text"), "bold text");
        assert_eq!(sanitize_html("text &nbsp; here"), "text   here");
    }

    /// Integration test: verifies lite.duckduckgo.com returns parseable HTML.
    /// Marked #[ignore] because it requires network access.
    #[test]
    #[ignore]
    fn test_websearch_live() {
        let tool = WebSearchTool;
        let ctx = super::super::ToolContext {
            workspace_path: std::path::PathBuf::from("/tmp"),
            session_id: "test".to_string(),
            call_id: "c1".to_string(),
            cancel_flag: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
            provider_config: crate::provider::config_for_model("dummy", "dummy"),
        };
        let input = serde_json::json!({"query": "rust async traits 2026"});
        let result = tool.execute(input, &ctx);
        match result {
            ToolResult::Success { output } => {
                let results = output["results"].as_array().unwrap();
                assert!(!results.is_empty(), "should return at least 1 result");
                let first = &results[0];
                assert!(!first["title"].as_str().unwrap().is_empty(), "title should not be empty");
                assert!(!first["url"].as_str().unwrap().is_empty(), "url should not be empty");
                println!("First result: {:?}", first);
            }
            ToolResult::Error { message } => {
                panic!("websearch failed: {}", message);
            }
        }
    }
}
