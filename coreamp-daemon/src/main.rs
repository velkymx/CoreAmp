use coreamp_common::ipc;
use coreamp_common::library;
use coreamp_common::settings;
use coreamp_common::{config_dir, daemon_default_interval_secs, ensure_app_data, metadata_db_path};
use std::env;
use std::process;
use std::thread;
use std::time::Duration;

#[derive(Debug, Clone, Copy)]
struct DaemonOptions {
    scan_once: bool,
    interval_secs_override: Option<u64>,
}

fn print_help() {
    println!("coreamp-daemon");
    println!("Usage: coreamp-daemon [--scan] [--interval=<seconds>] [--help]");
    println!("  --scan                 Run a single scan immediately");
    println!("  --interval=<seconds>   Poll interval for background scans");
}

fn parse_args() -> Result<DaemonOptions, String> {
    let mut options = DaemonOptions {
        scan_once: false,
        interval_secs_override: None,
    };

    for arg in env::args().skip(1) {
        if arg == "--help" || arg == "-h" {
            print_help();
            process::exit(0);
        } else if arg == "--scan" {
            options.scan_once = true;
        } else if let Some(raw) = arg.strip_prefix("--interval=") {
            let value = raw
                .parse::<u64>()
                .map_err(|_| format!("Invalid value for --interval: {raw}"))?;
            if value == 0 {
                return Err(String::from("--interval must be greater than 0"));
            }
            options.interval_secs_override = Some(value);
        } else {
            return Err(format!("Unknown argument: {arg}"));
        }
    }

    Ok(options)
}

fn run_single_scan() {
    let saved_settings = settings::load_settings().unwrap_or_default();
    let roots = library::configured_library_dirs();
    let mut started = ipc::DaemonEvent::new("scan-started", "Daemon scan started");
    started.roots_scanned = Some(roots.len());
    emit_event(started);

    if roots.is_empty() {
        println!("scan: no library directories found; set COREAMP_LIBRARY_DIRS or create ~/Music");
        emit_event(ipc::DaemonEvent::new(
            "scan-skipped",
            "No configured library directories found",
        ));
        return;
    }

    println!("scan: indexing {} root(s)", roots.len());
    for root in &roots {
        println!("scan: root {}", root.display());
    }

    match library::index_library_dirs(&roots) {
        Ok(summary) => {
            println!(
                "scan: complete roots={} discovered={} upserted={}",
                summary.roots_scanned, summary.files_discovered, summary.files_upserted
            );
            let mut event = ipc::DaemonEvent::new("scan-complete", "Daemon scan completed");
            event.roots_scanned = Some(summary.roots_scanned);
            event.files_discovered = Some(summary.files_discovered);
            event.files_upserted = Some(summary.files_upserted);

            match library::enrich_missing_metadata(25, saved_settings.api_proxy.as_deref()) {
                Ok(enriched) => {
                    println!("scan: enrichment updated={enriched}");
                    event.enriched = Some(enriched);
                }
                Err(err) => {
                    eprintln!("scan: enrichment failed: {err}");
                    event.message = format!("Daemon scan completed with enrichment error: {err}");
                }
            }
            emit_event(event);
        }
        Err(err) => {
            eprintln!("scan: failed: {err}");
            emit_event(ipc::DaemonEvent::new(
                "scan-failed",
                format!("Daemon scan failed: {err}"),
            ));
        }
    }
}

fn run_periodic_scan(interval_secs: u64) -> ! {
    loop {
        run_single_scan();
        println!("scan: sleeping for {interval_secs} second(s)");
        let mut event = ipc::DaemonEvent::new(
            "daemon-sleeping",
            format!("Daemon sleeping for {interval_secs} second(s)"),
        );
        event.interval_secs = Some(interval_secs);
        emit_event(event);
        thread::sleep(Duration::from_secs(interval_secs));
    }
}

fn emit_event(event: ipc::DaemonEvent) {
    if let Err(err) = ipc::publish_daemon_event(event) {
        eprintln!("ipc: failed to publish daemon event: {err}");
    }
}

fn main() {
    let options = match parse_args() {
        Ok(opts) => opts,
        Err(err) => {
            eprintln!("{err}");
            print_help();
            process::exit(2);
        }
    };

    if let Err(err) = ensure_app_data() {
        eprintln!("Failed to prepare local CoreAmp data: {err}");
        process::exit(1);
    }

    let settings_interval = settings::load_settings()
        .map(|saved| saved.scan_interval_secs)
        .unwrap_or_else(|_| daemon_default_interval_secs());
    let interval_secs = options.interval_secs_override.unwrap_or(settings_interval);

    println!("CoreAmp daemon bootstrap");
    println!("Config directory: {}", config_dir().display());
    println!("Metadata database path: {}", metadata_db_path().display());
    println!("Scan interval (seconds): {interval_secs}");
    let mut started = ipc::DaemonEvent::new("daemon-started", "CoreAmp daemon started");
    started.interval_secs = Some(interval_secs);
    emit_event(started);

    if options.scan_once {
        run_single_scan();
        return;
    }

    println!("daemon: periodic scanner started");
    run_periodic_scan(interval_secs);
}
