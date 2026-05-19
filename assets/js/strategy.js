(async function () {
  const host = document.getElementById("strategy-content");
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  if (!id) {
    showError(host, new Error("Missing ?id= parameter"));
    return;
  }

  try {
    const [meta, summary, navText, holdings] = await Promise.all([
      fetchJSON(`data/${id}/meta.json`),
      fetchJSON(`data/${id}/summary.json`),
      fetchText(`data/${id}/nav.csv`),
      fetchJSONL(`data/${id}/holdings.jsonl`).catch(() => []),
    ]);
    document.title = `${meta.name} — Hyle Alpha`;
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
      <h1>${meta.name}</h1>
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
      ${metricCard("Total Return", Fmt.pct(h.total_return, 1), signClass(h.total_return))}
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

    ${summary.comparisons && summary.comparisons.length ? `
    <div class="panel">
      <div class="panel-head"><h2>Component Comparison</h2></div>
      ${renderComparisons(meta, summary)}
    </div>` : ""}

    <div class="panel">
      <div class="panel-head">
        <h2>Holdings — Weekly</h2>
        <div class="controls" id="holdings-controls"></div>
      </div>
      <div id="holdings-body">
        ${holdings.length ? "" : '<div class="loading">No holdings data published for this run.</div>'}
      </div>
    </div>
  `;

  // Plot the NAV chart with all available series.
  drawNavChart(nav, meta);
  drawYearlyChart(summary.yearly || []);
  drawDrawdownChart(nav, meta);

  if (holdings.length) {
    initHoldings(holdings, meta);
  }
}

function metricCard(label, value, cls) {
  return `<div class="metric"><div class="label">${label}</div><div class="value ${cls}">${value}</div></div>`;
}

function drawNavChart(nav, meta) {
  const dates = nav.rows.map((r) => r.date);
  const seriesCols = nav.header.slice(1);
  // Main strategy is the first non-date column.
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
  // Main strategy (first non-date column) only.
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

function renderComparisons(meta, summary) {
  // Always lead with the main strategy itself for context, then comparisons.
  const rows = [
    { name: meta.name, summary: summary.headline, alpha_beta: summary.alpha_beta },
    ...summary.comparisons,
  ];
  return `
    <table>
      <thead>
        <tr>
          <th>Variant</th>
          <th>Total</th>
          <th>CAGR</th>
          <th>Vol</th>
          <th>Sharpe</th>
          <th>Max DD</th>
          <th>α (ann)</th>
          <th>β</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((r) => {
          const s = r.summary || {};
          const a = r.alpha_beta || {};
          return `
          <tr>
            <td>${r.name}</td>
            <td class="${signClass(s.total_return)}">${Fmt.pct(s.total_return)}</td>
            <td class="${signClass(s.cagr)}">${Fmt.pct(s.cagr)}</td>
            <td>${Fmt.pctPlain(s.ann_vol)}</td>
            <td>${Fmt.num(s.sharpe)}</td>
            <td class="${signClass(s.max_dd)}">${Fmt.pct(s.max_dd)}</td>
            <td class="${signClass(a.alpha_annual)}">${Fmt.pct(a.alpha_annual)}</td>
            <td>${Fmt.num(a.beta)}</td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
  `;
}

// ---------- Holdings ----------

function initHoldings(holdings, meta) {
  const controls = document.getElementById("holdings-controls");
  const body = document.getElementById("holdings-body");

  // Default to most recent rebalance.
  let cursor = holdings.length - 1;

  controls.innerHTML = `
    <button id="hold-prev">←</button>
    <select id="hold-jump" class="date-jump"></select>
    <button id="hold-next">→</button>
  `;
  const select = controls.querySelector("#hold-jump");
  select.innerHTML = holdings.map((h, i) =>
    `<option value="${i}">${h.date}</option>`
  ).join("");

  function show(idx) {
    cursor = Math.max(0, Math.min(holdings.length - 1, idx));
    select.value = String(cursor);
    body.innerHTML = renderHoldingsSnapshot(holdings[cursor], meta);
  }

  controls.querySelector("#hold-prev").addEventListener("click", () => show(cursor - 1));
  controls.querySelector("#hold-next").addEventListener("click", () => show(cursor + 1));
  select.addEventListener("change", () => show(parseInt(select.value, 10)));

  show(cursor);
}

function renderHoldingsSnapshot(snap, meta) {
  const positions = snap.positions || [];
  const periodRet = snap.period_return;
  const showSleeves = positions.some((p) => Array.isArray(p.sleeves) && p.sleeves.length);

  const rows = positions.map((p) => `
    <tr>
      <td>${p.ticker}</td>
      <td>${Fmt.pctPlain(p.weight, 2)}</td>
      ${showSleeves ? `<td>${(p.sleeves || []).join(", ")}</td>` : ""}
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
    <table>
      <thead>
        <tr>
          <th>Ticker</th>
          <th>Weight</th>
          ${showSleeves ? "<th>Source</th>" : ""}
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}
