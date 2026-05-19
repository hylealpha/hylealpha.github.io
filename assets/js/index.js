// Single-strategy homepage. Loads meta + summary + holdings for the
// current production strategy (STRATEGY_ID) and renders the hero metrics
// + current-week holdings. No multi-strategy grid.

const STRATEGY_ID = "hyle-alpha-1";

(async function () {
  try {
    const [meta, summary, holdings] = await Promise.all([
      fetchJSON(`data/${STRATEGY_ID}/meta.json`),
      fetchJSON(`data/${STRATEGY_ID}/summary.json`),
      fetchJSONL(`data/${STRATEGY_ID}/holdings.jsonl`).catch(() => []),
    ]);
    renderHero(meta, summary);
    renderCurrentHoldings(holdings, meta);
    const lu = document.getElementById("last-updated");
    if (lu) lu.textContent = Fmt.date(meta.last_updated);
  } catch (err) {
    const body = document.getElementById("holdings-body");
    if (body) showError(body, err);
  }
})();

function renderHero(meta, summary) {
  const h = summary.headline || {};
  document.getElementById("hero-family").textContent = meta.family || "";
  document.getElementById("hero-name").textContent = meta.name || STRATEGY_ID;
  document.getElementById("hero-tagline").textContent = meta.description || "";

  const metrics = document.getElementById("hero-metrics");
  metrics.innerHTML = [
    metricCard("CAGR", Fmt.pct(h.cagr, 1), signClass(h.cagr)),
    metricCard("Sharpe", Fmt.num(h.sharpe), ""),
    metricCard("Max Drawdown", Fmt.pct(h.max_dd, 1), signClass(h.max_dd)),
    metricCard("Sortino", Fmt.num(h.sortino), ""),
  ].join("");
}

function metricCard(label, value, cls) {
  return `<div class="metric"><div class="label">${label}</div><div class="value ${cls}">${value}</div></div>`;
}

function renderCurrentHoldings(holdings, meta) {
  const body = document.getElementById("holdings-body");
  const metaBar = document.getElementById("holdings-meta");
  if (!holdings.length) {
    body.innerHTML = '<div class="loading">No holdings data published yet.</div>';
    return;
  }
  const snap = holdings[holdings.length - 1];
  const positions = snap.positions || [];

  metaBar.innerHTML = `
    <span class="meta-chip"><span class="label">Rebalance</span>${snap.date}</span>
    <span class="meta-chip"><span class="label">Positions</span>${snap.n_positions ?? positions.length}</span>
    <span class="meta-chip"><span class="label">Gross</span>${Fmt.pctPlain(snap.total_weight, 1)}</span>
    <span class="meta-chip"><span class="label">Rebalance freq</span>${meta.rebalance || "—"}</span>
  `;

  const rows = positions
    .slice()
    .sort((a, b) => (b.weight || 0) - (a.weight || 0))
    .map((p, i) => `
      <tr>
        <td class="rank">${i + 1}</td>
        <td class="ticker"><code>${p.ticker}</code></td>
        <td class="weight">${Fmt.pctPlain(p.weight, 2)}</td>
      </tr>
    `).join("");

  body.innerHTML = `
    <table class="holdings-table">
      <thead><tr><th>#</th><th>Ticker</th><th>Weight</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}
