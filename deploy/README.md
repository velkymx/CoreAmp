# CoreAmp Service Templates

## systemd (Linux user service)
1. Copy `deploy/systemd/coreamp-daemon.service` to `~/.config/systemd/user/coreamp-daemon.service`.
2. Reload units: `systemctl --user daemon-reload`.
3. Enable + start:
   - `systemctl --user enable --now coreamp-daemon.service`

## launchd (macOS LaunchAgent)
1. Copy `deploy/launchd/com.coreamp.daemon.plist` to `~/Library/LaunchAgents/com.coreamp.daemon.plist`.
2. Load agent:
   - `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.coreamp.daemon.plist`
3. Check status:
   - `launchctl print gui/$(id -u)/com.coreamp.daemon`
