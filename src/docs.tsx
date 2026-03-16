import { inject } from "@vercel/analytics";
inject();

import { createRoot } from "react-dom/client";
import { useState } from "react";
import "./docs.css";

// ─── Types ──────────────────────────────────────────────────────────

interface ToolParam {
  name: string;
  type: string;
  description: string;
}

interface Tool {
  name: string;
  description: string;
  params: ToolParam[];
  examples: string[];
}

interface CLICommand {
  name: string;
  description: string;
  usage: string[];
  flags?: { flag: string; description: string }[];
}

// ─── Data ───────────────────────────────────────────────────────────

const cliCommands: CLICommand[] = [
  {
    name: "search",
    description: "Search and filter the gravitational wave event catalog.",
    usage: [
      "warplab search --type BBH",
      "warplab search --mass-min 100 --snr-min 15",
      "warplab search --type BNS --table",
      "warplab search --type NSBH --limit 5",
    ],
    flags: [
      { flag: "--type", description: "Filter by type: BBH, BNS, or NSBH" },
      { flag: "--mass-min", description: "Minimum total mass (solar masses)" },
      { flag: "--mass-max", description: "Maximum total mass (solar masses)" },
      { flag: "--snr-min", description: "Minimum network SNR" },
      { flag: "--limit", description: "Max results (default: 20)" },
      { flag: "--table", description: "Human-readable table output" },
    ],
  },
  {
    name: "info",
    description: "Get full parameters for a specific event.",
    usage: ["warplab info GW150914", "warplab info GW170817"],
  },
  {
    name: "waveform",
    description: "Generate a gravitational waveform (h+ / hx time series).",
    usage: [
      "warplab waveform GW150914",
      "warplab waveform GW150914 --format csv",
      "warplab waveform --m1 36 --m2 29",
      "warplab waveform --m1 50 --m2 30 --chi1 0.5 --format csv",
    ],
    flags: [
      { flag: "--m1", description: "Primary mass (solar masses)" },
      { flag: "--m2", description: "Secondary mass (solar masses)" },
      { flag: "--chi1", description: "Primary spin (default: 0)" },
      { flag: "--chi2", description: "Secondary spin (default: 0)" },
      { flag: "--distance", description: "Distance in Mpc (default: 100)" },
      { flag: "--inclination", description: "Inclination in radians (default: 0)" },
      { flag: "--format", description: "json (default) or csv" },
    ],
  },
  {
    name: "qnm",
    description: "Compute quasi-normal mode frequencies for a merger remnant.",
    usage: [
      "warplab qnm GW150914",
      "warplab qnm --m1 36 --m2 29",
      "warplab qnm --m1 50 --m2 30 --chi1 0.7",
    ],
  },
  {
    name: "snr",
    description: "Compute optimal matched-filter SNR against aLIGO.",
    usage: [
      "warplab snr GW150914",
      "warplab snr --m1 36 --m2 29 --distance 100",
    ],
  },
  {
    name: "export",
    description: "Export event data in various formats.",
    usage: [
      "warplab export GW150914 --format json",
      "warplab export GW150914 --format csv",
      "warplab export GW150914 --format bibtex",
      "warplab export GW150914 --format notebook",
      "warplab export GW150914 --format waveform",
    ],
  },
  {
    name: "stats",
    description: "Population statistics across the full catalog.",
    usage: [
      "warplab stats",
      "warplab stats --stat mass",
      "warplab stats --stat chirp_mass",
      "warplab stats --stat spin",
      "warplab stats --stat distance",
    ],
  },
];

const mcpTools: Tool[] = [
  {
    name: "search_events",
    description: "Search and filter the gravitational wave event catalog from GWOSC.",
    params: [
      { name: "type", type: '"BBH" | "BNS" | "NSBH"', description: "Filter by event type" },
      { name: "mass_min", type: "number", description: "Minimum total mass (solar masses)" },
      { name: "mass_max", type: "number", description: "Maximum total mass (solar masses)" },
      { name: "distance_max", type: "number", description: "Maximum luminosity distance (Mpc)" },
      { name: "snr_min", type: "number", description: "Minimum network SNR" },
      { name: "catalog", type: "string", description: 'Filter by catalog (e.g. "GWTC-3")' },
      { name: "limit", type: "number", description: "Max results (default: 20)" },
    ],
    examples: [
      "Search for binary neutron star mergers",
      "Find the 10 loudest black hole mergers",
      "What events have total mass over 100 solar masses?",
    ],
  },
  {
    name: "get_event",
    description: "Get full parameters for a specific event, including uncertainties and multi-messenger data.",
    params: [
      { name: "name", type: "string", description: 'Event name (e.g. "GW150914")' },
    ],
    examples: [
      "Get me the full parameters for GW150914",
      "What are the masses and distance for GW170817?",
    ],
  },
  {
    name: "generate_waveform",
    description: "Synthesize a gravitational waveform (h+ and hx polarizations).",
    params: [
      { name: "event_name", type: "string", description: "Generate from a catalog event" },
      { name: "m1", type: "number", description: "Primary mass in solar masses" },
      { name: "m2", type: "number", description: "Secondary mass in solar masses" },
      { name: "chi1", type: "number", description: "Primary spin, -1 to 1 (default: 0)" },
      { name: "chi2", type: "number", description: "Secondary spin, -1 to 1 (default: 0)" },
      { name: "distance", type: "number", description: "Distance in Mpc (default: 100)" },
      { name: "inclination", type: "number", description: "Inclination in radians (default: 0)" },
      { name: "format", type: '"json" | "csv"', description: "Output format (default: json)" },
    ],
    examples: [
      "Generate a waveform for GW150914",
      "What does a 50+30 solar mass merger look like?",
      "Generate a CSV waveform for a 10+10 binary at 200 Mpc",
    ],
  },
  {
    name: "compute_qnm",
    description: "Compute quasi-normal mode frequencies for the remnant black hole.",
    params: [
      { name: "m1", type: "number", description: "Primary mass (solar masses)" },
      { name: "m2", type: "number", description: "Secondary mass (solar masses)" },
      { name: "chi1", type: "number", description: "Primary spin (default: 0)" },
      { name: "chi2", type: "number", description: "Secondary spin (default: 0)" },
      { name: "modes", type: "string[]", description: 'Modes to compute (default: ["2,2,0", "2,2,1"])' },
    ],
    examples: [
      "What are the ringdown frequencies for a 36+29 solar mass merger?",
      "Compute QNM modes for GW150914's masses",
    ],
  },
  {
    name: "compute_snr",
    description: "Compute optimal matched-filter SNR against aLIGO O4 design sensitivity.",
    params: [
      { name: "event_name", type: "string", description: "Compute for a catalog event" },
      { name: "m1", type: "number", description: "Primary mass (for custom)" },
      { name: "m2", type: "number", description: "Secondary mass (for custom)" },
      { name: "distance", type: "number", description: "Distance in Mpc (default: 100)" },
    ],
    examples: [
      "What's the optimal SNR for GW150914?",
      "How detectable is a 10+10 merger at 500 Mpc?",
    ],
  },
  {
    name: "get_population_stats",
    description: "Population statistics across the full GWOSC catalog.",
    params: [
      { name: "stat", type: '"mass" | "chirp_mass" | "spin" | "distance" | "type_counts"', description: "Which statistic to compute" },
    ],
    examples: [
      "How many BBH vs BNS events have been detected?",
      "What's the mass distribution of detected mergers?",
      "What are the nearest gravitational wave events?",
    ],
  },
  {
    name: "integrate_geodesic",
    description: "Trace a photon or massive particle trajectory in Schwarzschild spacetime.",
    params: [
      { name: "start_r", type: "number", description: "Starting radius (in Schwarzschild radii)" },
      { name: "start_angle", type: "number", description: "Starting angle in radians (default: 0)" },
      { name: "velocity_angle", type: "number", description: "Initial velocity direction (default: pi/2)" },
      { name: "schwarzschild_radius", type: "number", description: "Rs value (default: 2)" },
      { name: "particle_type", type: '"photon" | "particle"', description: "Photon or massive particle (default: photon)" },
      { name: "energy", type: "number", description: "Specific energy for particles (default: 1.0)" },
      { name: "max_points", type: "number", description: "Max trajectory points (default: 200)" },
    ],
    examples: [
      "Trace a photon starting at 5 Schwarzschild radii",
      "What happens to a particle orbiting at 3 Rs?",
    ],
  },
  {
    name: "export_event",
    description: "Generate event data in various formats.",
    params: [
      { name: "event_name", type: "string", description: "Event name" },
      { name: "format", type: '"json" | "csv" | "bibtex" | "notebook" | "readme" | "waveform_csv"', description: "Export format" },
    ],
    examples: [
      "Export GW150914 parameters as CSV",
      "Generate a BibTeX citation for GW170817",
      "Create a Jupyter notebook for GW150914",
    ],
  },
];

// ─── Components ─────────────────────────────────────────────────────

function CodeBlock({ children, language }: { children: string; language?: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="code-block group">
      {language && <span className="code-lang">{language}</span>}
      <button className="code-copy" onClick={handleCopy}>
        {copied ? "Copied" : "Copy"}
      </button>
      <pre><code>{children}</code></pre>
    </div>
  );
}

function ToolCard({ tool }: { tool: Tool }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="tool-card">
      <button className="tool-header" onClick={() => setOpen(!open)}>
        <div className="tool-name-row">
          <code className="tool-name">{tool.name}</code>
          <span className="tool-desc">{tool.description}</span>
        </div>
        <span className={`tool-chevron ${open ? "open" : ""}`}>&#9662;</span>
      </button>
      {open && (
        <div className="tool-body">
          <table className="param-table">
            <thead>
              <tr>
                <th>Parameter</th>
                <th>Type</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {tool.params.map((p) => (
                <tr key={p.name}>
                  <td><code>{p.name}</code></td>
                  <td><code className="type">{p.type}</code></td>
                  <td>{p.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="examples">
            <span className="examples-label">Example prompts:</span>
            <ul>
              {tool.examples.map((ex) => (
                <li key={ex}>"{ex}"</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function CLICommandCard({ cmd }: { cmd: CLICommand }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="tool-card">
      <button className="tool-header" onClick={() => setOpen(!open)}>
        <div className="tool-name-row">
          <code className="tool-name">{cmd.name}</code>
          <span className="tool-desc">{cmd.description}</span>
        </div>
        <span className={`tool-chevron ${open ? "open" : ""}`}>&#9662;</span>
      </button>
      {open && (
        <div className="tool-body">
          <CodeBlock language="bash">{cmd.usage.join("\n")}</CodeBlock>
          {cmd.flags && (
            <table className="param-table">
              <thead>
                <tr>
                  <th>Flag</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {cmd.flags.map((f) => (
                  <tr key={f.flag}>
                    <td><code>{f.flag}</code></td>
                    <td>{f.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────

function Docs() {
  const [tab, setTab] = useState<"cli" | "mcp">("mcp");

  return (
    <div className="docs-page">
      {/* Nav */}
      <nav className="docs-nav">
        <a href="/" className="nav-logo">
          WarpLab
        </a>
        <div className="nav-links">
          <a href="/app.html">App</a>
          <a
            href="https://github.com/danielcanton/warplab"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
        </div>
      </nav>

      {/* Header */}
      <header className="docs-header">
        <h1>Documentation</h1>
        <p>Programmatic access to gravitational wave data and physics tools.</p>
      </header>

      {/* Tab switcher */}
      <div className="tab-bar">
        <button
          className={`tab ${tab === "mcp" ? "active" : ""}`}
          onClick={() => setTab("mcp")}
        >
          MCP Server
        </button>
        <button
          className={`tab ${tab === "cli" ? "active" : ""}`}
          onClick={() => setTab("cli")}
        >
          CLI
        </button>
      </div>

      {/* Content */}
      <main className="docs-content">
        {tab === "mcp" ? <MCPDocs /> : <CLIDocs />}
      </main>

      {/* Footer */}
      <footer className="docs-footer">
        <p>
          Data from{" "}
          <a href="https://gwosc.org" target="_blank" rel="noopener noreferrer">
            GWOSC
          </a>{" "}
          — Gravitational Wave Open Science Center
        </p>
      </footer>
    </div>
  );
}

function MCPDocs() {
  return (
    <>
      <section className="docs-section">
        <h2>What is MCP?</h2>
        <p>
          The{" "}
          <a href="https://modelcontextprotocol.io" target="_blank" rel="noopener noreferrer">
            Model Context Protocol
          </a>{" "}
          lets AI agents call tools directly. WarpLab's MCP server gives agents like Claude
          access to the full GWOSC catalog, waveform synthesis, QNM computation, geodesic
          integration, and more — no browser needed.
        </p>
      </section>

      <section className="docs-section">
        <h2>Setup</h2>

        <h3>1. Build the server</h3>
        <CodeBlock language="bash">npm run build:server</CodeBlock>

        <h3>2. Add to Claude Code</h3>
        <p>
          Edit <code>~/.claude/claude_code_config.json</code>:
        </p>
        <CodeBlock language="json">{`{
  "mcpServers": {
    "warplab": {
      "command": "node",
      "args": ["/path/to/warp/dist-server/mcp.js"]
    }
  }
}`}</CodeBlock>

        <h3>Or Claude Desktop</h3>
        <p>
          macOS: <code>~/Library/Application Support/Claude/claude_desktop_config.json</code>
        </p>
        <CodeBlock language="json">{`{
  "mcpServers": {
    "warplab": {
      "command": "node",
      "args": ["/path/to/warp/dist-server/mcp.js"]
    }
  }
}`}</CodeBlock>
        <p className="text-white/40 text-sm mt-2">Restart Claude after editing.</p>
      </section>

      <section className="docs-section">
        <h2>Tools</h2>
        <p className="mb-6">
          8 tools available. The GWOSC catalog is fetched on first use and cached for the session.
        </p>
        <div className="tools-list">
          {mcpTools.map((tool) => (
            <ToolCard key={tool.name} tool={tool} />
          ))}
        </div>
      </section>

      <section className="docs-section">
        <h2>Data Source</h2>
        <p>
          All event data comes from the{" "}
          <a href="https://gwosc.org" target="_blank" rel="noopener noreferrer">
            Gravitational-Wave Open Science Center
          </a>{" "}
          catalog API. Events are deduplicated across GWTC-1 through GWTC-4.0 with the most
          recent catalog taking priority.
        </p>
      </section>
    </>
  );
}

function CLIDocs() {
  return (
    <>
      <section className="docs-section">
        <h2>Installation</h2>
        <CodeBlock language="bash">{`# From the repo
npm run build:server
node dist-server/cli.js help

# Or install globally
npm link
warplab help`}</CodeBlock>
      </section>

      <section className="docs-section">
        <h2>Commands</h2>
        <div className="tools-list">
          {cliCommands.map((cmd) => (
            <CLICommandCard key={cmd.name} cmd={cmd} />
          ))}
        </div>
      </section>

      <section className="docs-section">
        <h2>Examples</h2>

        <h3>Find the 5 loudest events</h3>
        <CodeBlock language="bash">warplab search --snr-min 20 --limit 5 --table</CodeBlock>

        <h3>Generate a waveform for Python analysis</h3>
        <CodeBlock language="bash">{`warplab waveform GW150914 --format csv > gw150914.csv
python3 -c "
import pandas as pd, matplotlib.pyplot as plt
df = pd.read_csv('gw150914.csv')
plt.plot(df['time'], df['h_plus'])
plt.xlabel('Time (s)'); plt.ylabel('Strain h+')
plt.savefig('gw150914.png')
"`}</CodeBlock>

        <h3>Pipe event names into a loop</h3>
        <CodeBlock language="bash">{`warplab search --type BNS | jq -r '.[].name' | while read name; do
  echo "=== $name ==="
  warplab qnm "$name"
done`}</CodeBlock>

        <h3>Export a full data package</h3>
        <CodeBlock language="bash">{`mkdir GW150914_data && cd GW150914_data
warplab export GW150914 --format json > parameters.json
warplab export GW150914 --format csv > parameters.csv
warplab export GW150914 --format bibtex > citation.bib
warplab export GW150914 --format waveform > waveform.csv
warplab export GW150914 --format notebook > analysis.ipynb`}</CodeBlock>
      </section>

      <section className="docs-section">
        <h2>Output</h2>
        <p>
          All commands output JSON by default. Use <code>--table</code> with{" "}
          <code>search</code> for human-readable tables, or <code>--format csv</code> for
          piping. Status messages go to stderr so they won't interfere with piped output.
        </p>
      </section>
    </>
  );
}

// ─── Mount ──────────────────────────────────────────────────────────

const root = createRoot(document.getElementById("root")!);
root.render(<Docs />);
