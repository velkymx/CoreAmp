# Tauri 2 capabilities are static (build-time). We cannot grant
# `updater:allow-download-and-install` only at the moment the user
# clicks the "Download & install" button; the permission is either
# on for the whole webview or off. The runtime gate IS the UI:
# `useUpdater.downloadAndInstall()` is only invoked from the explicit
# "Download & install" button in `SettingsView.vue`. There is no
# code path that triggers an update install without that button.
#
# If a future Tauri release adds runtime permission grants, split this
# file into `default.json` (check) + `install.json` (download/install)
# and grant `install` only after the user confirms.
#
# Do not add `updater:allow-download-and-install` to the default
# capability list; it is already included by `updater:default`.
