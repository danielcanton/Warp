# WarpLab CLI

Command-line access to gravitational wave physics tools. Query the GWOSC catalog, generate waveforms, compute quasi-normal modes, and export data — all from your terminal.

## Installation

```bash
# Run directly (no install needed)
npx warplab help

# Or install globally
npm install -g warplab
warplab help
```

## Commands

### search

Search and filter the gravitational wave event catalog.

```bash
# All BBH events
warplab search --type BBH

# High-mass events with strong signals
warplab search --mass-min 100 --snr-min 15

# BNS events, table format
warplab search --type BNS --table

# Limit results
warplab search --type NSBH --limit 5
```

**Flags:**
| Flag | Description |
|------|-------------|
| `--type` | Filter by type: `BBH`, `BNS`, or `NSBH` |
| `--mass-min` | Minimum total mass (solar masses) |
| `--mass-max` | Maximum total mass (solar masses) |
| `--snr-min` | Minimum network SNR |
| `--limit` | Max results (default: 20) |
| `--table` | Human-readable table output |

Default output is JSON. Pipe to `jq` for processing:

```bash
warplab search --type BBH --limit 50 | jq '.[].name'
```

### info

Get full parameters for a specific event.

```bash
warplab info GW150914
warplab info GW170817
```

Returns masses, distance, redshift, spin, SNR, and classification.

### waveform

Generate a gravitational waveform (h+ / hx time series).

```bash
# From a catalog event
warplab waveform GW150914
warplab waveform GW150914 --format csv

# Custom binary parameters
warplab waveform --m1 36 --m2 29
warplab waveform --m1 50 --m2 30 --chi1 0.5 --distance 200 --format csv
```

**Flags:**
| Flag | Description |
|------|-------------|
| `--m1` | Primary mass (solar masses) |
| `--m2` | Secondary mass (solar masses) |
| `--chi1` | Primary spin (default: 0) |
| `--chi2` | Secondary spin (default: 0) |
| `--distance` | Distance in Mpc (default: 100) |
| `--inclination` | Inclination in radians (default: 0) |
| `--format` | `json` (default) or `csv` |

JSON output returns metadata (sample rate, duration, sample count). CSV output returns the full time series with columns: `time,h_plus,h_cross`.

### qnm

Compute quasi-normal mode frequencies for a black hole merger remnant.

```bash
# From a catalog event
warplab qnm GW150914

# Custom masses
warplab qnm --m1 36 --m2 29
warplab qnm --m1 50 --m2 30 --chi1 0.7 --chi2 0.1
```

Returns frequency (Hz), damping time (ms), and quality factor for the (2,2,0) and (2,2,1) modes.

### snr

Compute optimal matched-filter SNR against aLIGO design sensitivity.

```bash
# From a catalog event
warplab snr GW150914

# Custom binary
warplab snr --m1 36 --m2 29 --distance 100
```

### export

Export event data in various formats.

```bash
warplab export GW150914 --format json       # Parameter JSON
warplab export GW150914 --format csv        # Parameter CSV
warplab export GW150914 --format bibtex     # BibTeX citation
warplab export GW150914 --format notebook   # Jupyter notebook
warplab export GW150914 --format readme     # Markdown README
warplab export GW150914 --format waveform   # Waveform CSV
```

Redirect to a file:

```bash
warplab export GW150914 --format notebook > GW150914.ipynb
warplab export GW170817 --format bibtex > GW170817.bib
```

### stats

Population statistics across the full catalog.

```bash
warplab stats                          # Type counts (default)
warplab stats --stat mass              # Total mass distribution
warplab stats --stat chirp_mass        # Chirp mass distribution
warplab stats --stat spin              # Effective spin distribution
warplab stats --stat distance          # Distance distribution
```

## Examples

**Find the 5 loudest events:**
```bash
warplab search --snr-min 20 --limit 5 --table
```

**Generate a waveform CSV for analysis in Python:**
```bash
warplab waveform GW150914 --format csv > gw150914_waveform.csv
python3 -c "
import pandas as pd
import matplotlib.pyplot as plt
df = pd.read_csv('gw150914_waveform.csv')
plt.plot(df['time'], df['h_plus'])
plt.xlabel('Time (s)')
plt.ylabel('Strain h+')
plt.savefig('gw150914.png')
"
```

**Pipe event names into a loop:**
```bash
warplab search --type BNS | jq -r '.[].name' | while read name; do
  echo "=== $name ==="
  warplab qnm "$name"
done
```

**Export a full data package:**
```bash
mkdir GW150914_data && cd GW150914_data
warplab export GW150914 --format json > parameters.json
warplab export GW150914 --format csv > parameters.csv
warplab export GW150914 --format bibtex > citation.bib
warplab export GW150914 --format waveform > waveform.csv
warplab export GW150914 --format notebook > analysis.ipynb
```

## Output Format

All commands output JSON by default. Use `--table` with `search` for human-readable tables. Use `--format csv` where available for piping into other tools.

Status messages (like "Fetching catalog...") go to stderr, so they won't interfere with piped JSON/CSV output.
