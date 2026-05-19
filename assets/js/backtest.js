// Detailed backtest page — single-strategy edition.
// Pulls everything for STRATEGY_ID and renders NAV / yearly / drawdown / α-β / top DDs.
// The holdings table is intentionally NOT shown here — it lives on the homepage.

const STRATEGY_ID = "hyle-alpha-1";

(async function () {
  const host = document.getElementById("strategy-content");
  try {
    const [meta, summary, navText, holdings] = await Promise.all([
      fetchJSON(`data/${STRATEGY_ID}/meta.json`),
      fetchJSON(`data/${STRATEGY_ID}/summary.json`),
      fetchText(`data/${STRATEGY_ID}/nav.csv`),
      fetchJSONL(`data/${STRATEGY_ID}/holdings.jsonl`).catch(() => []),
    ]);
    document.title = `Backtest — ${meta.name}`;
    document.getElementById("last-updated").textContent = Fmt.date(meta.last_updated);

    const nav = parseCSV(navText);
    render({ meta, summary, nav, holdings, host });
  } catch (err) {
    showError(host, err);
  }
})();

function render({ meta, summary, nav, holdings, host }) {
  const h = summary.headline || {};
  const spec = summary.spec || {};
  const ab = summary.alpha_beta || {};

  host.innerHTML = `
    <div class="strategy-head">
      <div class="family-label">${meta.family || ""}</div>
      <h1>${meta.name} — Backtest</h1>
      <p class="description">${meta.description || ""}</p>
      <div class="meta-row">
        <span><strong>${spec.rebalance || "—"}</strong> rebalance</span>
        <span>${Fmt.date(spec.start)} → ${Fmt.date(spec.end)}</span>
        <span><strong>${spec.years ?? "—"}</strong>y</span>
        <span><strong>${spec.n_rebalances ?? "—"}</strong> rebalances</span>
        <span>benchmark <strong>${meta.benchmark || "—"}</strong></span>
      </div>
    </div>

    <div class="metric-row">
      ${metricCard("Total Return", Fmt.totalReturn(h.total_return), signClass(h.total_return))}
      ${metricCard("CAGR", Fmt.pct(h.cagr, 1), signClass(h.cagr))}
      ${metricCard("Sharpe", Fmt.num(h.sharpe), "")}
      ${metricCard("Sortino", Fmt.num(h.sortino), "")}
      ${metricCard("Max Drawdown", Fmt.pct(h.max_dd, 1), signClass(h.max_dd))}
      ${metricCard("Calmar", Fmt.num(h.calmar), "")}
      ${metricCard("Ann Vol", Fmt.pctPlain(h.ann_vol, 1), "")}
      ${metricCard("α (annual)", Fmt.pct(ab.alpha_annual, 1), signClass(ab.alpha_annual))}
    </div>

    <div class="panel">
      <div class="panel-head">
        <h2>Net Asset Value</h2>
        <div class="controls">
          <button id="scale-linear" class="active">Linear</button>
          <button id="scale-log">Log</button>
        </div>
      </div>
      <div id="nav-chart" class="chart"></div>
    </div>

    <div class="two-col">
      <div class="panel">
        <div class="panel-head"><h2>Yearly Return</h2></div>
        <div id="yearly-chart" class="chart" style="height:300px;"></div>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>Drawdown</h2></div>
        <div id="dd-chart" class="chart" style="height:300px;"></div>
      </div>
    </div>

    <div class="two-col">
      <div class="panel">
        <div class="panel-head"><h2>Risk Decomposition vs ${meta.benchmark || "Benchmark"}</h2></div>
        ${renderAlphaBeta(summary)}
      </div>
      <div class="panel">
        <div class="panel-head"><h2>Top Drawdowns</h2></div>
        ${renderTopDrawdowns(summary.top_drawdowns || [])}
      </div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <h2>Weekly Holdings & P&L</h2>
        <div class="controls" id="holdings-controls"></div>
      </div>
      <div id="weekly-summary-chart" class="chart" style="height:200px;"></div>
      <div id="holdings-body">
        ${holdings.length ? "" : '<div class="loading">No weekly holdings history available.</div>'}
      </div>
    </div>
  `;

  drawNavChart(nav, meta);
  drawYearlyChart(summary.yearly || []);
  drawDrawdownChart(nav, meta);

  if (holdings.length) {
    drawWeeklyReturnsChart(holdings);
    initHoldings(holdings);
  }
}

// ---------- Weekly Holdings + P&L ----------

function drawWeeklyReturnsChart(holdings) {
  const x = holdings.map((h) => h.date);
  const y = holdings.map((h) => h.period_return);
  const colors = y.map((r) => (r == null ? "#5a6573" : r >= 0 ? "#4ade80" : "#f87171"));
  const text = y.map((r) => (r == null ? "ongoing" : Fmt.pct(r, 2)));
  const trace = {
    x, y, type: "bar",
    marker: { color: colors },
    hovertemplate: "%{x}<br>%{customdata}<extra></extra>",
    customdata: text,
  };
  const layout = {
    ...plotlyTheme,
    yaxis: { ...plotlyTheme.yaxis, tickformat: ".1%", title: "Period Return" },
    margin: { l: 60, r: 24, t: 10, b: 36 },
    showlegend: false,
  };
  Plotly.newPlot("weekly-summary-chart", [trace], layout, { displayModeBar: false, responsive: true });
}

function initHoldings(holdings) {
  const controls = document.getElementById("holdings-controls");
  const body = document.getElementById("holdings-body");
  let cursor = holdings.length - 1; // default to most recent

  controls.innerHTML = `
    <button id="hold-prev" title="Previous week">←</button>
    <select id="hold-jump" class="date-jump"></select>
    <button id="hold-next" title="Next week">→</button>
  `;
  const select = controls.querySelector("#hold-jump");
  select.innerHTML = holdings.map((h, i) => {
    const ret = h.period_return == null ? "ongoing" : Fmt.pct(h.period_return, 2);
    return `<option value="${i}">${h.date}  ·  ${ret}</option>`;
  }).join("");

  function show(idx) {
    cursor = Math.max(0, Math.min(holdings.length - 1, idx));
    select.value = String(cursor);
    body.innerHTML = renderHoldingsSnapshot(holdings[cursor]);
  }

  controls.querySelector("#hold-prev").addEventListener("click", () => show(cursor - 1));
  controls.querySelector("#hold-next").addEventListener("click", () => show(cursor + 1));
  select.addEventListener("change", () => show(parseInt(select.value, 10)));

  show(cursor);
}

function renderHoldingsSnapshot(snap) {
  const positions = (snap.positions || []).slice().sort((a, b) => (b.weight || 0) - (a.weight || 0));
  const periodRet = snap.period_return;

  const rows = positions.map((p, i) => `
    <tr>
      <td class="rank">${i + 1}</td>
      <td class="ticker"><code>${p.ticker}</code></td>
      <td class="weight">${Fmt.pctPlain(p.weight, 2)}</td>
    </tr>
  `).join("");

  return `
    <div class="holdings-meta">
      <div class="item"><span class="label">Rebalance</span>${snap.date}</div>
      <div class="item"><span class="label">Positions</span>${snap.n_positions ?? positions.length}</div>
      <div class="item"><span class="label">Gross Weight</span>${Fmt.pctPlain(snap.total_weight, 1)}</div>
      <div class="item"><span class="label">Period Return</span>
        <span class="${signClass(periodRet)}">${periodRet == null ? "in progress" : Fmt.pct(periodRet, 2)}</span>
      </div>
    </div>
    <table class="holdings-table">
      <thead><tr><th>#</th><th>Ticker</th><th>Weight</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function metricCard(label, value, cls) {
  return `<div class="metric"><div class="label">${label}</div><div class="value ${cls}">${value}</div></div>`;
}

function drawNavChart(nav, meta) {
  const dates = nav.rows.map((r) => r.date);
  const seriesCols = nav.header.slice(1);
  const traces = seriesCols.map((col, i) => ({
    x: dates,
    y: nav.rows.map((r) => parseFloat(r[col])),
    type: "scatter",
    mode: "lines",
    name: col,
    line: { color: PALETTE[i % PALETTE.length], width: i === 0 ? 2.2 : 1.4 },
    opacity: i === 0 ? 1 : 0.75,
  }));
  const layout = { ...plotlyTheme, yaxis: { ...plotlyTheme.yaxis, title: "NAV (×)" } };
  Plotly.newPlot("nav-chart", traces, layout, { displayModeBar: false, responsive: true });

  document.getElementById("scale-linear").addEventListener("click", (e) => {
    Plotly.relayout("nav-chart", { "yaxis.type": "linear" });
    setActive(e.target);
  });
  document.getElementById("scale-log").addEventListener("click", (e) => {
    Plotly.relayout("nav-chart", { "yaxis.type": "log" });
    setActive(e.target);
  });
}

function setActive(btn) {
  btn.parentElement.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
}

function drawYearlyChart(yearly) {
  if (!yearly.length) return;
  const x = yearly.map((y) => String(y.year));
  const ret = yearly.map((y) => y.total_return);
  const colors = ret.map((r) => (r >= 0 ? "#4ade80" : "#f87171"));
  const trace = {
    x, y: ret, type: "bar",
    marker: { color: colors },
    text: ret.map((r) => Fmt.pct(r, 0)),
    textposition: "outside",
    hovertemplate: "%{x}: %{y:.1%}<extra></extra>",
  };
  const layout = {
    ...plotlyTheme,
    yaxis: { ...plotlyTheme.yaxis, tickformat: ".0%" },
    showlegend: false,
  };
  Plotly.newPlot("yearly-chart", [trace], layout, { displayModeBar: false, responsive: true });
}

function drawDrawdownChart(nav, meta) {
  const dates = nav.rows.map((r) => r.date);
  const mainCol = nav.header[1];
  const series = nav.rows.map((r) => parseFloat(r[mainCol]));
  let running = -Infinity;
  const dd = series.map((v) => {
    if (Number.isNaN(v)) return 0;
    running = Math.max(running, v);
    return running > 0 ? v / running - 1 : 0;
  });
  const trace = {
    x: dates, y: dd, type: "scatter", mode: "lines",
    fill: "tozeroy", fillcolor: "rgba(248, 113, 113, 0.2)",
    line: { color: "#f87171", width: 1.2 }, name: "Drawdown",
  };
  const layout = {
    ...plotlyTheme,
    yaxis: { ...plotlyTheme.yaxis, tickformat: ".0%" },
    showlegend: false,
  };
  Plotly.newPlot("dd-chart", [trace], layout, { displayModeBar: false, responsive: true });
}

function renderAlphaBeta(summary) {
  const ab = summary.alpha_beta || {};
  const bench = summary.benchmark || {};
  return `
    <table>
      <tbody>
        <tr><th>Annual α</th><td class="${signClass(ab.alpha_annual)}">${Fmt.pct(ab.alpha_annual)}</td></tr>
        <tr><th>β</th><td>${Fmt.num(ab.beta)}</td></tr>
        <tr><th>R²</th><td>${Fmt.num(ab.r_squared)}</td></tr>
        <tr><th>α t-stat (≈)</th><td>${Fmt.signed(ab.ann_alpha_t_stat_approx)}</td></tr>
        <tr><th>Observations</th><td>${ab.n_obs ?? "—"}</td></tr>
        <tr><th>Benchmark CAGR</th><td class="${signClass(bench.cagr)}">${Fmt.pct(bench.cagr)}</td></tr>
        <tr><th>Benchmark Sharpe</th><td>${Fmt.num(bench.sharpe)}</td></tr>
        <tr><th>Benchmark Max DD</th><td class="${signClass(bench.max_dd)}">${Fmt.pct(bench.max_dd)}</td></tr>
      </tbody>
    </table>
  `;
}

function renderTopDrawdowns(dds) {
  if (!dds.length) return '<div class="loading">No drawdown data.</div>';
  return `
    <table>
      <thead><tr><th>Start</th><th>Trough</th><th>End</th><th>Depth</th><th>Days</th></tr></thead>
      <tbody>
        ${dds.map((d) => `
          <tr>
            <td>${Fmt.date(d.start)}</td>
            <td>${Fmt.date(d.trough)}</td>
            <td>${Fmt.date(d.end)}</td>
            <td class="neg">${Fmt.pct(d.depth, 1)}</td>
            <td>${d.duration_days ?? "—"}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}
