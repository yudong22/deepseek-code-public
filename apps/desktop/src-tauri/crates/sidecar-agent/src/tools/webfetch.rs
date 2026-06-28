//! WebFetch tool: fetches content from a URL, converts HTML to Markdown,
//! and processes the result using a secondary LLM query with a custom prompt.

use super::{Tool, ToolContext, ToolResult};
use crate::provider::ChatMessage;
use serde_json::Value;
use std::net::ToSocketAddrs;
use std::time::Duration;

pub struct WebFetchTool;

fn is_private_ip(ip: std::net::IpAddr) -> bool {
    match ip {
        std::net::IpAddr::V4(ipv4) => {
            ipv4.is_loopback()
                || ipv4.is_private()
                || ipv4.is_link_local()
                || ipv4.is_unspecified()
                || ipv4.is_broadcast()
                || ipv4.is_documentation()
        }
        std::net::IpAddr::V6(ipv6) => {
            ipv6.is_loopback()
                || ipv6.is_unspecified()
                // Unique Local Address (fc00::/7)
                || (ipv6.segments()[0] & 0xfe00) == 0xfc00
                // Link-Local Unicast (fe80::/10)
                || (ipv6.segments()[0] & 0xffc0) == 0xfe80
        }
    }
}

fn check_ssrf(url_str: &str) -> Result<String, String> {
    let parsed_url = url::Url::parse(url_str)
        .map_err(|e| format!("Failed to parse URL: {}", e))?;

    let host = parsed_url.host_str()
        .ok_or_else(|| "URL has no host".to_string())?;

    // Resolve hostname/IP to address candidates
    let addrs = format!("{}:80", host)
        .to_socket_addrs()
        .map_err(|e| format!("DNS resolution failed for {}: {}", host, e))?;

    for addr in addrs {
        let ip = addr.ip();
        if is_private_ip(ip) {
            return Err(format!("Access to private/local network address {} is blocked for safety", ip));
        }
    }

    Ok(parsed_url.to_string())
}

impl Tool for WebFetchTool {
    fn name(&self) -> &'static str {
        "webfetch"
    }

    fn description(&self) -> &'static str {
        "Fetch and extract content from a URL. Automatically converts HTML to Markdown and extracts relevant info using LLM."
    }

    fn input_schema(&self) -> Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "The URL to fetch content from"
                },
                "prompt": {
                    "type": "string",
                    "description": "Instruction for the LLM to extract or summarize specific content from the page"
                }
            },
            "required": ["url", "prompt"]
        })
    }

    fn is_read_only(&self) -> bool {
        true
    }

    fn execute(&self, input: Value, ctx: &ToolContext) -> ToolResult {
        let url_str = input.get("url").and_then(|v| v.as_str()).unwrap_or("");
        let prompt = input.get("prompt").and_then(|v| v.as_str()).unwrap_or("");

        if url_str.is_empty() {
            return ToolResult::error("No URL provided");
        }

        // 1. SSRF Check
        let safe_url = match check_ssrf(url_str) {
            Ok(u) => u,
            Err(e) => return ToolResult::error(e),
        };

        // 2. Fetch page content asynchronously
        let fut = async {
            let client = match reqwest::Client::builder()
                .timeout(Duration::from_secs(10)) // 10s timeout
                .build()
            {
                Ok(c) => c,
                Err(e) => return Err(format!("Failed to build HTTP client: {}", e)),
            };

            let response = client.get(&safe_url)
                .send()
                .await
                .map_err(|e| format!("HTTP request failed: {}", e))?;

            let status = response.status();
            if !status.is_success() {
                return Err(format!("Server returned error status: {}", status));
            }

            if let Some(content_length) = response.content_length() {
                if content_length > 10 * 1024 * 1024 {
                    return Err("Content size exceeds the 10MB safety limit".to_string());
                }
            }

            let content_type = response.headers()
                .get(reqwest::header::CONTENT_TYPE)
                .and_then(|v| v.to_str().ok())
                .unwrap_or("")
                .to_string();

            let bytes = response.bytes()
                .await
                .map_err(|e| format!("Failed to read response bytes: {}", e))?;

            if bytes.len() > 10 * 1024 * 1024 {
                return Err("Content size exceeds the 10MB safety limit".to_string());
            }

            let text = String::from_utf8_lossy(&bytes).into_owned();
            Ok((text, content_type))
        };

        let fetch_result = match tokio::runtime::Handle::try_current() {
            Ok(handle) => handle.block_on(fut),
            Err(_) => {
                let rt = tokio::runtime::Runtime::new().unwrap();
                rt.block_on(fut)
            }
        };

        let (raw_content, content_type) = match fetch_result {
            Ok(res) => res,
            Err(e) => return ToolResult::error(e),
        };

        // 3. Convert HTML to Markdown
        let is_html = content_type.contains("html")
            || raw_content.trim().starts_with("<!DOCTYPE")
            || raw_content.trim().starts_with("<html");

        let markdown = if is_html {
            html2md::parse_html(&raw_content)
        } else {
            raw_content
        };

        // Truncate to 100K chars
        let truncated_markdown = if markdown.len() > 100_000 {
            format!("{}... [Truncated due to 100K limit]", &markdown[..100_000])
        } else {
            markdown
        };

        // Wrap external content for protection
        let guarded_content = format!(
            "<<EXTERNAL_UNTRUSTED_CONTENT>>\n{}\n<</EXTERNAL_UNTRUSTED_CONTENT>>",
            truncated_markdown
        );

        // 4. Extract with LLM if prompt is provided
        if !prompt.is_empty() {
            let system_prompt = "You are a helpful assistant that processes web page content according to user extraction prompts.";
            let user_msg = format!(
                "Please extract or summarize the following content based on this instruction: \"{}\"\n\nPage Content:\n{}\n",
                prompt, guarded_content
            );

            let messages = vec![
                ChatMessage {
                    role: "system".to_string(),
                    content: Some(system_prompt.to_string()),
                    tool_call_id: None,
                    tool_calls: None,
                },
                ChatMessage {
                    role: "user".to_string(),
                    content: Some(user_msg),
                    tool_call_id: None,
                    tool_calls: None,
                }
            ];

            let llm_fut = async {
                crate::provider::fetch_chat_completion(&ctx.provider_config, &messages).await
            };

            let llm_result = match tokio::runtime::Handle::try_current() {
                Ok(handle) => handle.block_on(llm_fut),
                Err(_) => {
                    let rt = tokio::runtime::Runtime::new().unwrap();
                    rt.block_on(llm_fut)
                }
            };

            match llm_result {
                Ok(summary) => {
                    return ToolResult::success(serde_json::json!({
                        "result": summary,
                        "url": safe_url
                    }));
                }
                Err(e) => {
                    return ToolResult::success(serde_json::json!({
                        "result": guarded_content,
                        "url": safe_url,
                        "warning": format!("LLM extraction failed: {:?}", e)
                    }));
                }
            }
        }

        ToolResult::success(serde_json::json!({
            "result": guarded_content,
            "url": safe_url
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_private_ip() {
        assert!(is_private_ip("127.0.0.1".parse().unwrap()));
        assert!(is_private_ip("10.0.0.1".parse().unwrap()));
        assert!(is_private_ip("192.168.1.1".parse().unwrap()));
        assert!(is_private_ip("::1".parse().unwrap()));
        assert!(!is_private_ip("8.8.8.8".parse().unwrap()));
    }

    #[test]
    fn test_check_ssrf() {
        // Private host should be rejected
        assert!(check_ssrf("http://127.0.0.1/").is_err());
        assert!(check_ssrf("http://localhost/").is_err());
        // Public host should be allowed
        assert!(check_ssrf("http://example.com/").is_ok());
    }

    #[test]
    fn test_webfetch_execute_ssrf_error() {
        let tool = WebFetchTool;
        let ctx = ToolContext {
            workspace_path: std::path::PathBuf::from("/tmp"),
            session_id: "test".to_string(),
            call_id: "c1".to_string(),
            cancel_flag: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
            provider_config: crate::provider::config_for_model("dummy", "dummy"),
            event_tx: None,
        };
        let res = tool.execute(serde_json::json!({
            "url": "http://127.0.0.1/local",
            "prompt": "summarize"
        }), &ctx);
        match res {
            ToolResult::Error { message } => {
                assert!(message.contains("blocked for safety"));
            }
            _ => panic!("Expected SSRF error"),
        }
    }
}
