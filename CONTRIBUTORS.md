# Contributors & Dependencies

CoreAmp is built on top of many amazing open-source libraries. We would like to thank the maintainers and contributors of the following projects:

## Core Framework
- [Tauri](https://tauri.app/) - Frontend framework for desktop applications.
- [Rust](https://www.rust-lang.org/) - The systems programming language powering our core logic.

## Dependencies

### Application (`coreamp-app`)
- `tauri` - Cross-platform app framework.
- `rodio` - Audio playback library.
- `serde` - Serialization and deserialization framework.
- `base64` - Base64 encoding and decoding.

### Common Logic & Data (`coreamp-common`)
- `lofty` - Audio metadata reading and writing.
- `rusqlite` - SQLite bindings for Rust (bundled).
- `reqwest` - HTTP client for MusicBrainz and API interactions.
- `serde_json` - JSON support for `serde`.
- `urlencoding` - URL percent-encoding.

### Daemon (`coreamp-daemon`)
- Inherits core logic from `coreamp-common`.

## Frontend Assets
- [Butterchurn](https://github.com/jberg/butterchurn) - WebGL Milkdrop visualizer.
