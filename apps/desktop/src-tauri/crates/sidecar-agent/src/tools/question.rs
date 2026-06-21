//! Question tool: interactive Q&A — the agent loop pauses and awaits user input.
//!
//! This tool returns a placeholder success result. The actual answer is injected
//! by the agent loop via the answer channel (see `agent.rs`).

use super::{Tool, ToolContext, ToolResult};
use serde_json::Value;

pub struct QuestionTool;

impl Tool for QuestionTool {
    fn name(&self) -> &'static str {
        "question"
    }

    fn description(&self) -> &'static str {
        "Ask the user a question. Present options for the user to choose from. Returns the user's selected answer."
    }

    fn input_schema(&self) -> Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "questions": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "question": {
                                "type": "string",
                                "description": "The question to ask"
                            },
                            "header": {
                                "type": "string",
                                "description": "Short label for the question"
                            },
                            "options": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "label": {
                                            "type": "string",
                                            "description": "Display text for this option"
                                        },
                                        "description": {
                                            "type": "string",
                                            "description": "Explanation of what this option means"
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            "required": ["questions"]
        })
    }

    fn execute(&self, input: Value, _ctx: &ToolContext) -> ToolResult {
        // The real answer comes from the agent loop's answer channel.
        // This placeholder signals that the question was presented.
        ToolResult::success(serde_json::json!({
            "status": "question_presented",
            "input": input,
        }))
    }
}
