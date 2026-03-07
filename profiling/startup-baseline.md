# CoreAmp Startup Profiling Baseline

Date: 2026-03-06
Script: `scripts/profile-startup.sh`

## Environment
- Build profile: `release`
- Config dir: `/tmp/coreamp-profile`
- Library dir: `/tmp/coreamp-profile-music`
- Library contents: one sample `.mp3` file

## Results
- `coreamp-daemon --scan`
  - real: `0.21s`
  - user: `0.00s`
  - sys: `0.00s`
- `coreamp-app --count`
  - real: `0.23s`
  - user: `0.00s`
  - sys: `0.00s`

## Notes
- This baseline targets startup/command responsiveness for non-GUI flows.
- Re-run after large dependency or startup-path changes to track regressions.
