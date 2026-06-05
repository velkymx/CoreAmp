use crate::metadata::TrackMetadata;
use reqwest::blocking::Client;
use serde_json::Value;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

// MusicBrainz asks for no more than one request per second. Hold a small margin.
const MIN_REQUEST_INTERVAL: Duration = Duration::from_millis(1100);

// MusicBrainz requires a descriptive User-Agent that identifies the app version
// and a contact (the project URL serves as contact per their guidelines).
const USER_AGENT: &str = concat!(
    "CoreAmp/",
    env!("CARGO_PKG_VERSION"),
    " ( https://github.com/velkymx/CoreAmp )"
);

// Remaining time to wait before the next request may be sent, given the last
// request time. Pure so the policy is unit-tested without real sleeping.
fn throttle_remaining(last: Instant, now: Instant, min: Duration) -> Duration {
    let elapsed = now.saturating_duration_since(last);
    min.checked_sub(elapsed).unwrap_or(Duration::ZERO)
}

// Process-global gate: the timestamp of the last MusicBrainz request.
fn rate_gate() -> &'static Mutex<Option<Instant>> {
    static GATE: OnceLock<Mutex<Option<Instant>>> = OnceLock::new();
    GATE.get_or_init(|| Mutex::new(None))
}

// Block until at least MIN_REQUEST_INTERVAL has passed since the previous
// request, then record this request's time. Poison-tolerant.
fn enforce_rate_limit() {
    let gate = rate_gate();
    let mut last = gate.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    if let Some(prev) = *last {
        let wait = throttle_remaining(prev, Instant::now(), MIN_REQUEST_INTERVAL);
        if !wait.is_zero() {
            std::thread::sleep(wait);
        }
    }
    *last = Some(Instant::now());
}

fn extract_year(date: &str) -> Option<String> {
    let year = date.split('-').next()?.trim();
    if year.len() == 4 && year.chars().all(|ch| ch.is_ascii_digit()) {
        Some(year.to_string())
    } else {
        None
    }
}

fn from_response(value: &Value) -> Option<TrackMetadata> {
    let recording = value.get("recordings")?.as_array()?.first()?;

    let title = recording
        .get("title")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(ToOwned::to_owned);

    let artist = recording
        .get("artist-credit")
        .and_then(Value::as_array)
        .and_then(|credits| credits.first())
        .and_then(|entry| {
            entry.get("name").and_then(Value::as_str).or_else(|| {
                entry
                    .get("artist")
                    .and_then(|artist| artist.get("name"))
                    .and_then(Value::as_str)
            })
        })
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(ToOwned::to_owned);

    let album = recording
        .get("releases")
        .and_then(Value::as_array)
        .and_then(|releases| releases.first())
        .and_then(|release| release.get("title"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(ToOwned::to_owned);

    let year = recording
        .get("releases")
        .and_then(Value::as_array)
        .and_then(|releases| releases.first())
        .and_then(|release| release.get("date"))
        .and_then(Value::as_str)
        .and_then(extract_year);

    let metadata = TrackMetadata {
        artist,
        album,
        album_artist: None,
        title,
        year,
        genre: None,
        track_number: None,
        duration_secs: None,
    };

    if metadata.artist.is_none()
        && metadata.album.is_none()
        && metadata.title.is_none()
        && metadata.year.is_none()
    {
        None
    } else {
        Some(metadata)
    }
}

pub fn lookup_recording(query: &str, proxy: Option<&str>) -> Result<Option<TrackMetadata>, String> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }

    let mut builder = Client::builder()
        .timeout(Duration::from_secs(10))
        .user_agent(USER_AGENT);
    if let Some(proxy_url) = proxy.map(str::trim).filter(|value| !value.is_empty()) {
        let reqwest_proxy = reqwest::Proxy::all(proxy_url).map_err(|err| err.to_string())?;
        builder = builder.proxy(reqwest_proxy);
    }
    let client = builder.build().map_err(|err| err.to_string())?;

    let encoded = urlencoding::encode(trimmed);
    let url = format!(
        "https://musicbrainz.org/ws/2/recording/?query=recording:{encoded}&fmt=json&limit=1"
    );

    enforce_rate_limit();
    let response = client.get(url).send().map_err(|err| err.to_string())?;
    if !response.status().is_success() {
        return Err(format!(
            "MusicBrainz request failed: HTTP {}",
            response.status()
        ));
    }

    let payload: Value = response.json().map_err(|err| err.to_string())?;
    Ok(from_response(&payload))
}

#[cfg(test)]
mod tests {
    use super::{MIN_REQUEST_INTERVAL, USER_AGENT, from_response, throttle_remaining};
    use serde_json::json;
    use std::time::{Duration, Instant};

    #[test]
    fn user_agent_is_current_and_identifies_contact() {
        // MusicBrainz requires an identifying UA with contact info.
        assert!(USER_AGENT.starts_with("CoreAmp/"));
        assert!(USER_AGENT.contains("github.com/velkymx/CoreAmp"));
        // The old placeholder must be gone.
        assert!(!USER_AGENT.contains("yourusername"));
        assert!(!USER_AGENT.contains("0.2.0"));
    }

    #[test]
    fn throttle_waits_until_min_interval_elapses() {
        let base = Instant::now();
        // No time elapsed since the last request → must wait the full interval.
        assert_eq!(
            throttle_remaining(base, base, MIN_REQUEST_INTERVAL),
            MIN_REQUEST_INTERVAL
        );
        // Halfway through the interval → wait the remainder.
        let half = MIN_REQUEST_INTERVAL / 2;
        assert_eq!(
            throttle_remaining(base, base + half, MIN_REQUEST_INTERVAL),
            MIN_REQUEST_INTERVAL - half
        );
        // Past the interval → no wait.
        assert_eq!(
            throttle_remaining(
                base,
                base + MIN_REQUEST_INTERVAL + Duration::from_millis(50),
                MIN_REQUEST_INTERVAL
            ),
            Duration::ZERO
        );
    }

    #[test]
    fn parses_first_recording() {
        let sample = json!({
            "recordings": [
                {
                    "title": "Track Name",
                    "artist-credit": [{"name": "Artist Name"}],
                    "releases": [{"title": "Album Name", "date": "2020-04-01"}]
                }
            ]
        });
        let metadata = from_response(&sample).expect("metadata");
        assert_eq!(metadata.title.as_deref(), Some("Track Name"));
        assert_eq!(metadata.artist.as_deref(), Some("Artist Name"));
        assert_eq!(metadata.album.as_deref(), Some("Album Name"));
        assert_eq!(metadata.year.as_deref(), Some("2020"));
    }
}
