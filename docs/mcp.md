# WarpLab MCP Server

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that gives AI agents direct access to gravitational wave data and physics computation. Search the GWOSC catalog, generate waveforms, compute quasi-normal modes, trace geodesics, and more.

## Setup

### Build

```bash
npm run build:server
```

This creates `dist-server/mcp.js` — the MCP server entry point.

### Claude Code

Add to your Claude Code MCP settings (`~/.claude/claude_code_config.json`):

```json
{
  "mcpServers": {
    "warplab": {
      "command": "node",
      "args": ["/absolute/path/to/warp/dist-server/mcp.js"]
    }
  }
}
```

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%/Claude/claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "warplab": {
      "command": "node",
      "args": ["/absolute/path/to/warp/dist-server/mcp.js"]
    }
  }
}
```

Restart Claude after editing the config.

## Tools

The server exposes 8 tools. The GWOSC catalog is fetched on first use and cached for the session.

### search_events

Search and filter the gravitational wave event catalog.

| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | `"BBH" \| "BNS" \| "NSBH"` | Filter by event type |
| `mass_min` | `number` | Minimum total mass (solar masses) |
| `mass_max` | `number` | Maximum total mass (solar masses) |
| `distance_max` | `number` | Maximum luminosity distance (Mpc) |
| `snr_min` | `number` | Minimum network SNR |
| `catalog` | `string` | Filter by catalog name (e.g. "GWTC-3") |
| `limit` | `number` | Max results (default: 20) |

**Example prompts:**
- "Search for binary neutron star mergers"
- "Find the 10 loudest black hole mergers"
- "What events have total mass over 100 solar masses?"

### get_event

Get full parameters for a specific event, including uncertainties and multi-messenger data (if available).

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | `string` | Event name (e.g. "GW150914") |

**Example prompts:**
- "Get me the full parameters for GW150914"
- "What are the masses and distance for GW170817?"

### generate_waveform

Synthesize a gravitational waveform (h+ and hx polarizations). Provide either an event name or custom binary parameters.

| Parameter | Type | Description |
|-----------|------|-------------|
| `event_name` | `string` | Generate from a catalog event |
| `m1` | `number` | Primary mass in solar masses |
| `m2` | `number` | Secondary mass in solar masses |
| `chi1` | `number` | Primary spin, -1 to 1 (default: 0) |
| `chi2` | `number` | Secondary spin, -1 to 1 (default: 0) |
| `distance` | `number` | Distance in Mpc (default: 100) |
| `inclination` | `number` | Inclination in radians (default: 0) |
| `format` | `"json" \| "csv"` | Output format (default: json) |

JSON returns metadata plus a downsampled array (~200 points). CSV returns the full time series.

**Example prompts:**
- "Generate a waveform for GW150914"
- "What does a 50+30 solar mass merger waveform look like?"
- "Generate a CSV waveform for a 10+10 solar mass binary at 200 Mpc"

### compute_qnm

Compute quasi-normal mode frequencies for the remnant black hole.

| Parameter | Type | Description |
|-----------|------|-------------|
| `m1` | `number` | Primary mass (solar masses) |
| `m2` | `number` | Secondary mass (solar masses) |
| `chi1` | `number` | Primary spin (default: 0) |
| `chi2` | `number` | Secondary spin (default: 0) |
| `modes` | `string[]` | Modes to compute (default: ["2,2,0", "2,2,1"]) |

Returns frequency (Hz), damping time (ms), and quality factor for each mode.

**Example prompts:**
- "What are the ringdown frequencies for a 36+29 solar mass merger?"
- "Compute QNM modes for GW150914's masses"

### compute_snr

Compute optimal matched-filter SNR against aLIGO O4 design sensitivity.

| Parameter | Type | Description |
|-----------|------|-------------|
| `event_name` | `string` | Compute for a catalog event |
| `m1` | `number` | Primary mass (for custom) |
| `m2` | `number` | Secondary mass (for custom) |
| `distance` | `number` | Distance in Mpc (default: 100) |

**Example prompts:**
- "What's the optimal SNR for GW150914?"
- "How detectable is a 10+10 solar mass merger at 500 Mpc?"

### get_population_stats

Population statistics across the full GWOSC catalog.

| Parameter | Type | Description |
|-----------|------|-------------|
| `stat` | `"mass" \| "chirp_mass" \| "spin" \| "distance" \| "type_counts"` | Which statistic |

**Example prompts:**
- "How many BBH vs BNS events have been detected?"
- "What's the mass distribution of detected mergers?"
- "What are the nearest gravitational wave events?"

### integrate_geodesic

Trace a photon or massive particle trajectory in Schwarzschild spacetime.

| Parameter | Type | Description |
|-----------|------|-------------|
| `start_r` | `number` | Starting radius (in Schwarzschild radii) |
| `start_angle` | `number` | Starting angle in radians (default: 0) |
| `velocity_angle` | `number` | Initial velocity direction (default: pi/2) |
| `schwarzschild_radius` | `number` | Rs value (default: 2) |
| `particle_type` | `"photon" \| "particle"` | Photon or massive particle (default: photon) |
| `energy` | `number` | Specific energy for particles (default: 1.0) |
| `max_points` | `number` | Max trajectory points returned (default: 200) |

Returns the trajectory as (x, y, z) points plus the outcome: `captured`, `scattered`, `orbiting`, or `bound_orbit`.

**Example prompts:**
- "Trace a photon starting at 5 Schwarzschild radii"
- "What happens to a particle orbiting at 3 Rs?"

### export_event

Generate event data in various formats.

| Parameter | Type | Description |
|-----------|------|-------------|
| `event_name` | `string` | Event name |
| `format` | `"json" \| "csv" \| "bibtex" \| "notebook" \| "readme" \| "waveform_csv"` | Export format |

**Example prompts:**
- "Export GW150914 parameters as CSV"
- "Generate a BibTeX citation for GW170817"
- "Create a Jupyter notebook for GW150914"

## Data Source

All event data comes from the [Gravitational-Wave Open Science Center (GWOSC)](https://gwosc.org/) catalog API. The catalog is fetched live on first tool use and cached for the duration of the MCP session.

Events are deduplicated across overlapping catalogs (GWTC-1, GWTC-2, GWTC-2.1, GWTC-3, GWTC-4.0) with the most recent catalog taking priority.
