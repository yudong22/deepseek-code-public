//! WebSearch tool: queries DuckDuckGo HTML search directly, parses results,
//! and supports allowed_domains and blocked_domains filters.

use super::{Tool, ToolContext, ToolResult};
use serde_json::Value;
use std::time::Duration;

pub struct WebSearchTool;

fn sanitize_html_tags(html: &str) -> String {
    let re_tag = regex::Regex::new(r#"<[^>]*>"#).unwrap();
    let stripped = re_tag.replace_all(html, "");
    let decoded = stripped
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#x27;", "'")
        .replace("&#39;", "'")
        .replace("&nbsp;", " ");
    
    decoded.trim().to_string()
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
                    "items": {
                        "type": "string"
                    },
                    "description": "Only include search results from these domains"
                },
                "blocked_domains": {
                    "type": "array",
                    "items": {
                        "type": "string"
                    },
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

        // 1. Build DuckDuckGo HTML search URL
        let encoded_query: String = url::form_urlencoded::byte_serialize(query.as_bytes()).collect();
        let ddg_url = format!("https://html.duckduckgo.com/html/?q={}", encoded_query);

        // 2. Fetch the page asynchronously
        let fut = async {
            let client = match reqwest::Client::builder()
                .timeout(Duration::from_secs(10))
                .build()
            {
                Ok(c) => c,
                Err(e) => return Err(format!("Failed to build client: {}", e)),
            };

            let response = client
                .get(&ddg_url)
                .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")
                .send()
                .await
                .map_err(|e| format!("HTTP request failed: {}", e))?;

            if !response.status().is_success() {
                return Err(format!("DuckDuckGo returned error status: {}", response.status()));
            }

            let html = response
                .text()
                .await
                .map_err(|e| format!("Failed to read response: {}", e))?;

            Ok(html)
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

        // 3. Extract hits from HTML page
        let mut results = Vec::new();

        // DuckDuckGo HTML search results are divs with class "result" or "web-result"
        let re_result = regex::Regex::new(r#"<div class="[^"]*result[^"]*">([\s\S]*?)</div>\s*</div>"#).unwrap();
        let re_link = regex::Regex::new(r#"<a class="result__url" href="([^"]+)">"#).unwrap();
        let re_title_a = regex::Regex::new(r#"<a class="result__a"[^>]*>([\s\S]*?)</a>"#).unwrap();
        let re_snippet = regex::Regex::new(r#"<a class="result__snippet"[^>]*>([\s\S]*?)</a>"#).unwrap();

        for cap in re_result.captures_iter(&html) {
            let block = &cap[1];
            
            let mut raw_url = "";
            let mut clean_url = String::new();
            
            let re_href = regex::Regex::new(r#"href="([^"]+)"\s*class="result__a""#).unwrap();
            let re_href2 = regex::Regex::new(r#"class="result__a"\s*href="([^"]+)"#).unwrap();
            
            if let Some(c) = re_href.captures(block).or_else(|| re_href2.captures(block)) {
                raw_url = c.get(1).map(|m| m.as_str()).unwrap_or("");
            } else if let Some(c) = re_link.captures(block) {
                raw_url = c.get(1).map(|m| m.as_str()).unwrap_or("");
            }
            
            if raw_url.is_empty() {
                continue;
            }
            
            let full_url = if raw_url.starts_with("//") {
                format!("https:{}", raw_url)
            } else if raw_url.starts_with("/") {
                format!("https://duckduckgo.com{}", raw_url)
            } else {
                raw_url.to_string()
            };
            
            if let Ok(parsed) = url::Url::parse(&full_url) {
                let mut found_uddg = false;
                for (key, val) in parsed.query_pairs() {
                    if key == "uddg" {
                        clean_url = val.into_owned();
                        found_uddg = true;
                        break;
                    }
                }
                if !found_uddg {
                    clean_url = full_url;
                }
            } else {
                clean_url = full_url;
            }
            
            let mut title = String::new();
            if let Some(c) = re_title_a.captures(block) {
                title = sanitize_html_tags(&c[1]);
            }
            if title.is_empty() {
                title = "Untitled Result".to_string();
            }
            
            let mut snippet = String::new();
            if let Some(c) = re_snippet.captures(block) {
                snippet = sanitize_html_tags(&c[1]);
            }
            
            // Domain filtering logic
            if let Ok(parsed) = url::Url::parse(&clean_url) {
                if let Some(hostname) = parsed.host_str().map(|h| h.to_lowercase()) {
                    if !allowed_domains.is_empty() {
                        let mut allowed = false;
                        for domain in &allowed_domains {
                            if hostname == *domain || hostname.ends_with(&format!(".{}", domain)) {
                                allowed = true;
                                break;
                            }
                        }
                        if !allowed {
                            continue;
                        }
                    }
                    
                    if !blocked_domains.is_empty() {
                        let mut blocked = false;
                        for domain in &blocked_domains {
                            if hostname == *domain || hostname.ends_with(&format!(".{}", domain)) {
                                blocked = true;
                                break;
                            }
                        }
                        if blocked {
                            continue;
                        }
                    }
                }
            }

            results.push(serde_json::json!({
                "title": title,
                "url": clean_url,
                "snippet": snippet
            }));
            
            if results.len() >= 10 {
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
        assert_eq!(sanitize_html_tags("<p>Hello &amp; welcome</p>"), "Hello & welcome");
        assert_eq!(sanitize_html_tags("<b>bold</b> text"), "bold text");
    }
}
