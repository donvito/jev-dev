use std::time::{Duration, Instant};

use reqwest::{
    header::{HeaderValue, AUTHORIZATION},
    Client,
};
use serde::Serialize;
use serde_json::Value;
use tauri::State;

use crate::{
    credentials,
    error::{AppError, AppResult},
};

const ENDPOINT: &str = "https://api.typesafe.ai/v1/systemone";
const MAX_RETRIES: u32 = 3;

pub struct ApiClient(pub Client);

impl ApiClient {
    pub fn new() -> reqwest::Result<Self> {
        Client::builder()
            .https_only(true)
            .redirect(reqwest::redirect::Policy::none())
            .timeout(Duration::from_secs(30))
            .connect_timeout(Duration::from_secs(10))
            .user_agent(concat!("JevDev/", env!("CARGO_PKG_VERSION")))
            .build()
            .map(Self)
    }
}

#[derive(Serialize)]
pub struct Evaluation {
    pub response: Value,
    pub latency_ms: u64,
}

fn elapsed_ms(started: Instant) -> u64 {
    started.elapsed().as_millis().min(u64::MAX as u128) as u64
}

fn validate_request(request: &Value) -> AppResult<()> {
    let Some(body) = request.as_object() else {
        return Err(AppError::new(
            "validation",
            "The request must be a JSON object.",
        ));
    };
    if !body
        .get("state")
        .is_some_and(|s| s.is_string() || s.is_object() || s.is_array())
    {
        return Err(AppError::new(
            "validation",
            "State must be text, a JSON object, or an array.",
        ));
    }
    if body
        .get("model")
        .and_then(Value::as_str)
        .is_none_or(|s| s.trim().is_empty())
    {
        return Err(AppError::new("validation", "Select a requested model."));
    }
    if body
        .get("questions")
        .and_then(Value::as_object)
        .is_none_or(|q| q.is_empty())
    {
        return Err(AppError::new(
            "validation",
            "Add at least one question before running.",
        ));
    }
    Ok(())
}

fn retry_delay(status: u16, retries_completed: u32) -> Option<Duration> {
    if matches!(status, 429 | 529) && retries_completed < MAX_RETRIES {
        Some(Duration::from_millis(500 * 2_u64.pow(retries_completed)))
    } else {
        None
    }
}

/// Preserve useful provider validation details, while removing credential
/// values and any authentication fields before an error reaches history/UI.
fn redact_error(value: Value, key: &str) -> Value {
    match value {
        Value::String(value) => Value::String(value.replace(key, "[redacted]")),
        Value::Array(values) => {
            Value::Array(values.into_iter().map(|v| redact_error(v, key)).collect())
        }
        Value::Object(values) => Value::Object(
            values
                .into_iter()
                .map(|(name, value)| {
                    let normalized = name.to_ascii_lowercase().replace(['-', '_'], "");
                    let value = if matches!(
                        normalized.as_str(),
                        "authorization" | "apikey" | "accesstoken" | "token"
                    ) {
                        Value::String("[redacted]".into())
                    } else {
                        redact_error(value, key)
                    };
                    (name.replace(key, "[redacted]"), value)
                })
                .collect(),
        ),
        value => value,
    }
}

fn provider_error(status: u16, details: Option<Value>, key: &str, started: Instant) -> AppError {
    let message = match status {
        401 | 403 => "TypeSafe could not authorize this request. Check your API key and account access in Settings.",
        422 => "TypeSafe rejected the request. Check the state and question definitions.",
        429 => "TypeSafe is rate limiting requests. The request failed after bounded retries; try again later.",
        529 => "TypeSafe is temporarily overloaded. The request failed after bounded retries; try again later.",
        _ => "TypeSafe returned an unsuccessful response.",
    };
    AppError {
        kind: "http",
        message: message.into(),
        status: Some(status),
        details: details.map(|v| redact_error(v, key)),
        latency_ms: Some(elapsed_ms(started)),
    }
}

fn response_body_error(error: &reqwest::Error, status: u16, started: Instant) -> AppError {
    let (kind, message) = if error.is_timeout() {
        (
            "timeout",
            "The TypeSafe response timed out while being received. It was not automatically retried.",
        )
    } else {
        (
            "network",
            "The TypeSafe response could not be fully received. Check your connection and try again.",
        )
    };
    AppError {
        kind,
        message: message.into(),
        status: Some(status),
        details: None,
        latency_ms: Some(elapsed_ms(started)),
    }
}

fn parse_response_json(payload: &[u8], status: u16, started: Instant) -> AppResult<Value> {
    serde_json::from_slice(payload).map_err(|_| AppError {
        kind: "invalid_response",
        message: "TypeSafe returned a response that was not valid JSON.".into(),
        status: Some(status),
        details: None,
        latency_ms: Some(elapsed_ms(started)),
    })
}

fn validate_success_response(
    response: &Value,
    request: &Value,
    status: u16,
    started: Instant,
) -> AppResult<()> {
    let invalid = |message: &str| AppError {
        kind: "invalid_response",
        message: message.into(),
        status: Some(status),
        details: None,
        latency_ms: Some(elapsed_ms(started)),
    };
    if response
        .get("model")
        .and_then(Value::as_str)
        .is_none_or(|model| model.trim().is_empty())
    {
        return Err(invalid(
            "TypeSafe returned a response without a valid resolved model.",
        ));
    }
    let Some(answers) = response.get("answers").and_then(Value::as_object) else {
        return Err(invalid(
            "TypeSafe returned a response without a valid answers object.",
        ));
    };
    // The API promises one answer object per requested question. Preserve all
    // extra response fields and future answer metadata without interpreting it.
    if request
        .get("questions")
        .and_then(Value::as_object)
        .is_some_and(|questions| {
            questions
                .keys()
                .any(|id| !answers.get(id).is_some_and(Value::is_object))
        })
    {
        return Err(invalid(
            "TypeSafe returned an incomplete response: one or more requested answers are missing or malformed.",
        ));
    }
    Ok(())
}

#[tauri::command]
pub async fn execute_request(
    client: State<'_, ApiClient>,
    request: Value,
) -> AppResult<Evaluation> {
    validate_request(&request)?;
    let key = credentials::get_key()?;
    let mut authorization =
        HeaderValue::from_str(&format!("Bearer {}", key.as_str())).map_err(|_| {
            AppError::new(
                "invalid_api_key",
                "The stored API key is invalid. Replace it in Settings.",
            )
        })?;
    authorization.set_sensitive(true);
    let started = Instant::now();
    let mut retries_completed = 0;
    loop {
        let response = client
            .0
            .post(ENDPOINT)
            .header(AUTHORIZATION, authorization.clone())
            .json(&request)
            .send()
            .await
            .map_err(|error| AppError {
                kind: if error.is_timeout() {
                    "timeout"
                } else {
                    "network"
                },
                message: if error.is_timeout() {
                    "The TypeSafe request timed out. It was not automatically retried."
                } else {
                    "Could not connect to TypeSafe. Check your connection and try again."
                }
                .into(),
                status: None,
                details: None,
                latency_ms: Some(elapsed_ms(started)),
            })?;
        let status = response.status();
        if let Some(delay) = retry_delay(status.as_u16(), retries_completed) {
            // Drop this response before waiting to release its resources.
            drop(response);
            tokio::time::sleep(delay).await;
            retries_completed += 1;
            continue;
        }
        // Receive the bytes before parsing JSON. reqwest can label a truncated
        // HTTP body as a decode error too; these phases must stay distinct.
        let payload = response.bytes().await;
        if !status.is_success() {
            let details = payload
                .ok()
                .and_then(|bytes| serde_json::from_slice(&bytes).ok());
            return Err(provider_error(status.as_u16(), details, &key, started));
        }
        let bytes =
            payload.map_err(|error| response_body_error(&error, status.as_u16(), started))?;
        let response = parse_response_json(&bytes, status.as_u16(), started)?;
        validate_success_response(&response, &request, status.as_u16(), started)?;
        return Ok(Evaluation {
            response,
            latency_ms: elapsed_ms(started),
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::{
        io::{Read, Write},
        net::TcpListener,
        thread,
    };

    #[test]
    fn backoff_is_bounded_and_only_retries_documented_statuses() {
        for status in [429, 529] {
            assert_eq!(retry_delay(status, 0), Some(Duration::from_millis(500)));
            assert_eq!(retry_delay(status, 1), Some(Duration::from_millis(1000)));
            assert_eq!(retry_delay(status, 2), Some(Duration::from_millis(2000)));
            assert_eq!(retry_delay(status, 3), None);
        }
        for status in [200, 301, 400, 401, 403, 422, 500, 503] {
            assert_eq!(retry_delay(status, 0), None);
        }
    }

    #[test]
    fn provider_errors_never_expose_credentials() {
        let secret = "very-secret-test-key";
        let details = json!({"detail":[{"msg":format!("Invalid {secret}"), "loc":["body","state"]}],
            "Authorization":"Bearer some-other-secret", "nested":{"api_key":"another-secret"}});
        let error = provider_error(422, Some(details), secret, Instant::now());
        let serialized = serde_json::to_string(&error).unwrap();
        assert!(!serialized.contains(secret));
        assert!(!serialized.contains("some-other-secret"));
        assert!(!serialized.contains("another-secret"));
        assert!(serialized.contains("state"));
        assert_eq!(error.status, Some(422));
    }

    #[test]
    fn accepts_structured_state_and_preserves_question_instructions() {
        let request = json!({"state":[{"resume":"candidate"}], "model":"jev-latest", "questions":{
            "profile":{"type":"choice", "instructions":{"question":"Choose profile"}, "criteria":{"engineering":null,"other":null}}
        }});
        assert!(validate_request(&request).is_ok());
        assert!(
            validate_request(&json!({"state":"x","model":"jev-latest","questions":{}})).is_err()
        );
        assert!(
            validate_request(&json!({"state":null,"model":"jev-latest","questions":{"q":{}}}))
                .is_err()
        );
    }

    #[test]
    fn rejects_incomplete_success_responses_and_keeps_future_metadata() {
        let request = json!({"questions":{"ready":{"type":"noul"}}});
        let valid = json!({
            "model":"jev-1.13.0",
            "answers":{"ready":{"type":"noul","noul":0.8,"future_answer_field":[1,2]}},
            "future_provider_field":{"trace":"preserve"}
        });
        assert!(validate_success_response(&valid, &request, 200, Instant::now()).is_ok());
        for invalid in [
            json!({}),
            json!({"model":" ","answers":{"ready":{}}}),
            json!({"model":1,"answers":{"ready":{}}}),
            json!({"model":"jev-latest","answers":[]}),
            json!({"model":"jev-latest","answers":{}}),
            json!({"model":"jev-latest","answers":{"ready":null}}),
            json!({"model":"jev-latest","answers":{"ready":[]}}),
        ] {
            let error =
                validate_success_response(&invalid, &request, 200, Instant::now()).unwrap_err();
            assert_eq!(error.kind, "invalid_response");
            assert_eq!(error.status, Some(200));
        }
        assert_eq!(
            valid["answers"]["ready"]["future_answer_field"],
            json!([1, 2])
        );
        assert_eq!(valid["future_provider_field"], json!({"trace":"preserve"}));
    }

    /// A loopback-only fixture reproduces reqwest's real body error variants;
    /// it never contacts TypeSafe or reads the OS credential store.
    fn mocked_body_error(body: &'static str, declared_length: usize, stall: bool) -> AppError {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let (release, wait_for_release) = std::sync::mpsc::channel::<()>();
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            let mut request = [0; 1024];
            let received = stream.read(&mut request).unwrap();
            assert!(received > 0, "Mock server received no request bytes");
            write!(stream, "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {declared_length}\r\nConnection: close\r\n\r\n{body}").unwrap();
            stream.flush().unwrap();
            if stall {
                let _ = wait_for_release.recv_timeout(Duration::from_secs(5));
            }
        });
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let error = runtime.block_on(async {
            let client = Client::builder()
                .no_proxy()
                .timeout(Duration::from_secs(1))
                .build()
                .unwrap();
            let response = client
                .get(format!("http://{address}"))
                .send()
                .await
                .unwrap();
            let started = Instant::now();
            response
                .bytes()
                .await
                .map_err(|error| response_body_error(&error, 200, started))
                .and_then(|bytes| parse_response_json(&bytes, 200, started))
                .unwrap_err()
        });
        let _ = release.send(());
        server.join().unwrap();
        error
    }

    #[test]
    fn body_timeouts_disconnects_and_invalid_json_have_distinct_errors() {
        let timeout = mocked_body_error("{", 100, true);
        assert_eq!(timeout.kind, "timeout");
        let disconnect = mocked_body_error("{", 100, false);
        assert_eq!(disconnect.kind, "network");
        let invalid = mocked_body_error("{", 1, false);
        assert_eq!(invalid.kind, "invalid_response");
        for error in [timeout, disconnect, invalid] {
            assert_eq!(error.status, Some(200));
            assert!(error.details.is_none());
            assert!(error.latency_ms.is_some());
            assert!(!error.message.contains("127.0.0.1"));
        }
    }
}
