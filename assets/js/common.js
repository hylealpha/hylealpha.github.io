// Shared utilities used by both index.js and strategy.js.

const Fmt = {
  pct(x, digits = 1) {
    if (x == null || Number.isNaN(x)) return "—";
    const sign = x > 0 ? "+" : "";
    return `${sign}${(x * 100).toFixed(digits)}%`;
  },
  pctPlain(x, digits = 1) {
    if (x == null || Number.isNaN(x)) return "—";
    return `${(x * 100).toFixed(digits)}%`;
  },
  num(x, digits = 2) {
    if (x == null || Number.isNaN(x)) return "—";
    return Number(x).toFixed(digits);
  },
  signed(x, digits = 2) {
    if (x == null || Number.isNaN(x)) return "—";
    const sign = x > 0 ? "+" : "";
    return `${sign}${Number(x).toFixed(digits)}`;
  },
  date(s) {
    if (!s) return "—";
    return s.split(" ")[0].split("T")[0];
  },
  // Cumulative-return formatter that switches from "+x.x%" to multiplier (e.g.
  // "10,568×") when the percentage gets too long to fit a metric card.
  totalReturn(x) {
    if (x == null || Number.isNaN(x)) return "—";
    if (Math.abs(x) >= 10) {
      // ≥1000% — show multiplier (1 + r) for readability
      const mult = 1 + x;
      const digits = Math.abs(mult) >= 100 ? 0 : 1;
      return `${mult.toLocaleString("en-US", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })}×`;
    }
    const sign = x > 0 ? "+" : "";
    return `${sign}${(x * 100).toFixed(1)}%`;
  },
};

// Pick a CSS class for a numeric cell based on sign.
function signClass(x) {
  if (x == null || Number.isNaN(x)) return "";
  return x > 0 ? "pos" : x < 0 ? "neg" : "";
}

// Minimal CSV parser — assumes no embedded commas/quotes, which is true for
// the publisher's output (numeric + ticker columns only).
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0].split(",");
  const rows = lines.slice(1).map((line) => {
    const cells = line.split(",");
    const obj = {};
    header.forEach((h, i) => { obj[h] = cells[i]; });
    return obj;
  });
  return { header, rows };
}

async function fetchJSON(path) {
  const r = await fetch(path, { cache: "no-cache" });
  if (!r.ok) throw new Error(`fetch ${path} → ${r.status}`);
  return r.json();
}

async function fetchText(path) {
  const r = await fetch(path, { cache: "no-cache" });
  if (!r.ok) throw new Error(`fetch ${path} → ${r.status}`);
  return r.text();
}

// Parse JSONL — one JSON object per line, blank lines ignored.
async function fetchJSONL(path) {
  const text = await fetchText(path);
  return text.split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
}

// Plotly layout defaults that match the dark theme.
const plotlyTheme = {
  paper_bgcolor: "transparent",
  plot_bgcolor: "transparent",
  font: { family: "ui-monospace, SF Mono, Menlo, monospace", color: "#e6edf3", size: 12 },
  margin: { l: 60, r: 24, t: 24, b: 48 },
  xaxis: { gridcolor: "#1f2731", linecolor: "#2a3441", zerolinecolor: "#2a3441" },
  yaxis: { gridcolor: "#1f2731", linecolor: "#2a3441", zerolinecolor: "#2a3441" },
  legend: { orientation: "h", x: 0, y: -0.18, bgcolor: "transparent" },
  hoverlabel: { bgcolor: "#11161d", bordercolor: "#2a3441", font: { family: "ui-monospace, monospace" } },
};

const PALETTE = ["#5eead4", "#fbbf24", "#a78bfa", "#f472b6", "#60a5fa"];

function showError(host, err) {
  host.innerHTML = `<div class="error-box">${err.message || err}</div>`;
  console.error(err);
}
