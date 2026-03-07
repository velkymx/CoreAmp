# Contributing to CoreAmp

First off, thank you for considering contributing to CoreAmp! It's people like you who make it a great tool for everyone.

## Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

## How Can I Contribute?

### Reporting Bugs
Before creating a bug report, please check the existing issues to see if the problem has already been reported. When reporting a bug, please use the provided **Bug Report** template.

### Suggesting Enhancements
Feature requests are welcome! Please use the **Feature Request** template when suggesting a new idea.

### Pull Requests
1.  Fork the repository.
2.  Create a new branch for your feature or bug fix.
3.  Ensure your code follows the existing style and is well-documented.
4.  Run tests locally: `cargo test --workspace`.
5.  Check formatting: `cargo fmt --all --check`.
6.  Submit a pull request using the provided template.

## Technical Overview

CoreAmp is a Rust-based project utilizing [Tauri v2](https://tauri.app/) for the UI.

- **`coreamp-app`**: The main desktop application (Tauri).
- **`coreamp-daemon`**: Background metadata enrichment service.
- **`coreamp-common`**: Shared logic, database models, and IPC.

### Frontend
The frontend is built using React and Vanilla CSS, located in `coreamp-app/dist` (static assets). 

### Backend
The backend logic is entirely in Rust. We use `CPAL` for audio output and `lofty` for metadata.

## Licensing

By contributing to CoreAmp, you agree that your contributions will be licensed under the project's **Polyform Non-Commercial License 1.0.0**.
