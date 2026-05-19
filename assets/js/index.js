(async function () {
  const grid = document.getElementById("strategy-grid");
  const generatedAt = document.getElementById("generated-at");

  try {
    const registry = await fetchJSON("data/strategies.json");
    generatedAt.textContent = Fmt.date(registry.generated_at);

    if (!registry.strategies || !registry.strategies.length) {
      grid.innerHTML = '<div class="loading">No strategies published yet.</div>';
      return;
    }

    // Fetch each strategy's headline metrics for the card badges.
    const enriched = await Promise.all(
      registry.strategies.map(async (s) => {
        try {
          const summary = await fetchJSON(`data/${s.id}/summary.json`);
          return { ...s, headline: summary.headline || {} };
        } catch (e) {
          return { ...s, headline: {} };
        }
      })
    );

    grid.innerHTML = enriched.map(renderCard).join("");
  } catch (err) {
    showError(grid, err);
  }
})();

function renderCard(s) {
  const h = s.headline || {};
  const tags = (s.tags || []).map((t) => `<span class="tag">${t}</span>`).join("");
  return `
    <a class="strategy-card" href="strategy.html?id=${encodeURIComponent(s.id)}">
      <div class="card-family">${s.family || ""}</div>
      <h3 class="card-name">${s.name}</h3>
      <p class="card-desc">${s.description || ""}</p>
      <div class="metric-row" style="margin:16px 0 0;grid-template-columns:repeat(3,1fr);gap:8px;">
        <div class="metric" style="padding:10px 12px;">
          <div class="label">Sharpe</div>
          <div class="value" style="font-size:16px;">${Fmt.num(h.sharpe)}</div>
        </div>
        <div class="metric" style="padding:10px 12px;">
          <div class="label">CAGR</div>
          <div class="value ${signClass(h.cagr)}" style="font-size:16px;">${Fmt.pct(h.cagr)}</div>
        </div>
        <div class="metric" style="padding:10px 12px;">
          <div class="label">Max DD</div>
          <div class="value ${signClass(h.max_dd)}" style="font-size:16px;">${Fmt.pct(h.max_dd)}</div>
        </div>
      </div>
      <div class="card-tags" style="margin-top:14px;">${tags}</div>
      <div class="card-footer">
        <span>${s.rebalance || ""}</span>
        <span>updated ${Fmt.date(s.last_updated)}</span>
      </div>
    </a>
  `;
}
