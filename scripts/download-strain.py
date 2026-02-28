#!/usr/bin/env python3
"""
Download LIGO/Virgo strain data from GWOSC for all catalog events.

Fetches HDF5 strain files, extracts bandpassed strain per detector,
converts to Float32Array .bin files with a JSON manifest.

Output:
  public/strain/{eventName}/{detector}.bin
  public/strain/manifest.json

Usage:
  python3 scripts/download-strain.py              # all events
  python3 scripts/download-strain.py GW150914      # single event
  python3 scripts/download-strain.py --list        # list available events
"""

import json
import os
import sys
import tempfile
import urllib.request
import urllib.error
from pathlib import Path

import h5py
import numpy as np

GWOSC_API = "https://gwosc.org/eventapi/json/allevents/"
OUTPUT_DIR = Path(__file__).resolve().parent.parent / "public" / "strain"
SAMPLE_RATE = 4096  # We use 4 kHz files (smaller, sufficient for visualization)
DURATION = 32       # Standard GWOSC event data segment duration
DETECTORS = ["H1", "L1", "V1"]

# Catalog priority: later catalogs have better data
CATALOG_PRIORITY = {
    "O1_O2-Preliminary": 0,
    "GWTC-1-marginal": 1,
    "GWTC-2.1-marginal": 2,
    "GWTC-3-marginal": 3,
    "GWTC-1-confident": 5,
    "GWTC-2": 6,
    "GWTC-2.1-confident": 7,
    "GWTC-3-confident": 8,
    "O4_Discovery_Papers": 9,
}


def fetch_json(url: str) -> dict:
    """Fetch JSON from a URL."""
    req = urllib.request.Request(url, headers={"User-Agent": "WarpLab/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode())


def get_all_events() -> dict[str, list[dict]]:
    """
    Fetch all events from GWOSC, grouped by commonName.
    Returns {commonName: [list of catalog entries sorted by priority desc]}.
    We keep all versions so we can try each for strain data.
    """
    print("Fetching event catalog from GWOSC...")
    data = fetch_json(GWOSC_API)

    grouped: dict[str, list[dict]] = {}
    for _key, entry in data["events"].items():
        name = entry.get("commonName", "")
        if not name:
            continue
        if name not in grouped:
            grouped[name] = []
        grouped[name].append(entry)

    # Sort each group by catalog priority (highest first)
    for name in grouped:
        grouped[name].sort(
            key=lambda e: CATALOG_PRIORITY.get(e.get("catalog.shortName", ""), 0),
            reverse=True,
        )

    print(f"Found {len(grouped)} unique events")
    return grouped


def get_strain_urls(event_versions: list[dict]) -> tuple[dict[str, str], float]:
    """
    Get 4kHz HDF5 strain URLs for each detector.
    Tries each catalog version (best first) until strain data is found.
    Returns (detector_urls, gps_start).
    """
    for event in event_versions:
        jsonurl = event.get("jsonurl")
        if not jsonurl:
            continue

        try:
            detail = fetch_json(jsonurl)
        except (urllib.error.URLError, urllib.error.HTTPError):
            continue

        # GWOSC event detail wraps data in events -> {key} -> strain
        strain_entries: list[dict] = []
        if "events" in detail:
            for _key, event_data in detail["events"].items():
                if isinstance(event_data, dict) and "strain" in event_data:
                    strain_entries = event_data.get("strain", [])
                    break

        if not strain_entries:
            continue

        urls: dict[str, str] = {}
        for s in strain_entries:
            detector = s.get("detector", "")
            sample_rate = s.get("sampling_rate", 0)
            fmt = s.get("format", "")
            duration = s.get("duration", 0)

            # We want 4096 Hz, HDF5, 32-second files
            if (
                detector in DETECTORS
                and sample_rate == SAMPLE_RATE
                and fmt == "hdf5"
                and duration == DURATION
            ):
                urls[detector] = s["url"]

        if urls:
            gps = event.get("GPS", 0)
            return urls, gps

    return {}, 0


def download_hdf5(url: str) -> str:
    """Download an HDF5 file to a temp path. Returns the temp file path."""
    req = urllib.request.Request(url, headers={"User-Agent": "WarpLab/1.0"})
    fd, tmp_path = tempfile.mkstemp(suffix=".hdf5")
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            with os.fdopen(fd, "wb") as f:
                while True:
                    chunk = resp.read(65536)
                    if not chunk:
                        break
                    f.write(chunk)
    except Exception:
        try:
            os.close(fd)
        except OSError:
            pass
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
        raise
    return tmp_path


def extract_strain(hdf5_path: str) -> tuple[np.ndarray, int, float]:
    """
    Extract strain data from a GWOSC HDF5 file.
    Returns (strain_array, sample_rate, gps_start).
    """
    with h5py.File(hdf5_path, "r") as f:
        strain = f["strain"]["Strain"][:]
        meta = f["meta"]
        gps_start = float(meta["GPSstart"][()])
        sr = SAMPLE_RATE

        # Try to get sample rate from strain dataset attributes
        strain_ds = f["strain"]["Strain"]
        if "Npoints" in strain_ds.attrs and "Duration" in meta.attrs:
            npoints = int(strain_ds.attrs["Npoints"])
            dur = float(meta.attrs["Duration"])
            if dur > 0:
                sr = int(npoints / dur)

        return strain.astype(np.float32), sr, gps_start


def save_bin(data: np.ndarray, path: Path) -> None:
    """Save a Float32Array as a raw binary file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    data.astype(np.float32).tofile(str(path))


def process_event(name: str, event_versions: list[dict], manifest: dict) -> bool:
    """Process a single event. Returns True if any data was saved."""
    event_dir = OUTPUT_DIR / name

    # Check if already processed (idempotent)
    if event_dir.exists() and any(event_dir.glob("*.bin")):
        detectors = []
        for bin_file in sorted(event_dir.glob("*.bin")):
            det = bin_file.stem
            size = bin_file.stat().st_size
            if size > 0 and size % 4 == 0:  # Valid Float32Array
                detectors.append(det)

        if detectors:
            gps = event_versions[0].get("GPS", 0) if event_versions else 0
            manifest[name] = {
                "detectors": detectors,
                "sampleRate": SAMPLE_RATE,
                "gpsStart": gps,
                "duration": DURATION,
            }
            print(f"  {name}: already exists ({', '.join(detectors)}), skipping")
            return True

    # Get strain URLs (tries each catalog version)
    urls, gps_start = get_strain_urls(event_versions)
    if not urls:
        print(f"  {name}: no 4kHz HDF5 strain data available, skipping")
        return False

    detectors_saved = []

    for detector, url in sorted(urls.items()):
        try:
            print(f"  {name}/{detector}: downloading...", end="", flush=True)
            tmp_path = download_hdf5(url)

            try:
                strain, sr, gps = extract_strain(tmp_path)
                gps_start = gps
                bin_path = event_dir / f"{detector}.bin"
                save_bin(strain, bin_path)
                detectors_saved.append(detector)
                size_kb = bin_path.stat().st_size / 1024
                print(f" OK ({len(strain)} samples, {size_kb:.0f} KB)")
            finally:
                os.unlink(tmp_path)

        except Exception as e:
            print(f" FAILED: {e}")

    if detectors_saved:
        manifest[name] = {
            "detectors": sorted(detectors_saved),
            "sampleRate": SAMPLE_RATE,
            "gpsStart": gps_start,
            "duration": DURATION,
        }
        return True

    return False


def main():
    single_event = None
    list_only = False

    if len(sys.argv) > 1:
        if sys.argv[1] == "--list":
            list_only = True
        else:
            single_event = sys.argv[1]

    events = get_all_events()

    if list_only:
        for name in sorted(events.keys()):
            print(name)
        return

    if single_event:
        if single_event not in events:
            print(f"Error: Event '{single_event}' not found in catalog")
            sys.exit(1)
        events = {single_event: events[single_event]}

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Load existing manifest if present (for incremental updates)
    manifest_path = OUTPUT_DIR / "manifest.json"
    manifest: dict = {}
    if manifest_path.exists():
        with open(manifest_path) as f:
            manifest = json.load(f)

    total = len(events)
    success = 0
    for i, (name, versions) in enumerate(sorted(events.items()), 1):
        print(f"[{i}/{total}] Processing {name}...")
        try:
            if process_event(name, versions, manifest):
                success += 1
        except Exception as e:
            print(f"  ERROR: {e}")

    # Write manifest
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2, sort_keys=True)

    print(f"\nDone: {success}/{total} events processed")
    print(f"Manifest: {manifest_path}")

    # Calculate total size
    total_size = sum(
        p.stat().st_size for p in OUTPUT_DIR.rglob("*.bin")
    )
    print(f"Total strain data: {total_size / (1024 * 1024):.1f} MB")


if __name__ == "__main__":
    main()
