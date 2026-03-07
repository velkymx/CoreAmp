use crate::metadata::TrackMetadata;
use reqwest::blocking::Client;
use serde_json::Value;
use std::time::Duration;

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
        title,
        year,
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
        .user_agent("CoreAmp/0.1 (https://example.com/coreamp)");
    if let Some(proxy_url) = proxy.map(str::trim).filter(|value| !value.is_empty()) {
        let reqwest_proxy = reqwest::Proxy::all(proxy_url).map_err(|err| err.to_string())?;
        builder = builder.proxy(reqwest_proxy);
    }
    let client = builder.build().map_err(|err| err.to_string())?;

    let encoded = urlencoding::encode(trimmed);
    let url = format!(
        "https://musicbrainz.org/ws/2/recording/?query=recording:{encoded}&fmt=json&limit=1"
    );

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
    use super::from_response;
    use serde_json::json;

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
