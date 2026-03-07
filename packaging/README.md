# CoreAmp Packaging

## Linux
- Build `.deb` artifacts with Tauri:
  - `bash packaging/linux/build-deb.sh`
- Build `.AppImage` artifacts with Tauri:
  - `bash packaging/linux/build-appimage.sh`

## macOS
- Build `.app.tar.gz` artifacts with Tauri:
  - `bash packaging/macos/build-app.sh`

## CI Workflow
- GitHub Actions workflow: `.github/workflows/package.yml`
- Triggers with:
  - `workflow_dispatch`
  - version tags matching `v*`
- Release job builds real desktop bundles instead of CLI tarballs
