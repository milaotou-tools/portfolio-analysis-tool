export function normalizeResult(raw) {
  const sourceHoldings = raw.holdings || raw.positions || raw.stocks || raw.items || raw.data || [];
  const holdings = normalizeHoldings(sourceHoldings);
  const summary = raw.summary || {};
  const warnings = Array.isArray(raw.warnings) ? raw.warnings : [];
  return { holdings, summary, warnings };
}

export function normalizeHoldings(items) {
  return items
    .map(item => {
      const weight = Number(item.weightPct ?? item.pct ?? item.weight_pct ?? item.positionPct ?? 0);
      const pnl = Number(item.pnlPct ?? item.change ?? item.pnl_pct ?? item.profitPct ?? 0);
      return {
        name: String(item.name || item.stockName || item.securityName || "未命名").slice(0, 28),
        code: String(item.code || item.symbol || "").slice(0, 16),
        weightPct: Number.isFinite(weight) ? Math.max(0, Math.min(weight, 100)) : 0,
        pnlPct: Number.isFinite(pnl) ? pnl : 0,
        sector: String(item.sector || item.market || "其他").slice(0, 16)
      };
    })
    .filter(item => item.weightPct > 0 || item.name !== "未命名")
    .sort((a, b) => b.weightPct - a.weightPct)
    .slice(0, 30);
}

export function buildOverview(holdings, estimatedPnl) {
  const top = holdings[0];
  const direction = estimatedPnl >= 0 ? "小幅盈利" : "小幅回撤";
  return `识别到 ${holdings.length} 个持仓，最大仓位为 ${top.name}，组合按仓位估算今日${direction} ${Math.abs(estimatedPnl).toFixed(2)}%。`;
}

export function weightedPnl(holdings) {
  const total = holdings.reduce((sum, item) => sum + item.weightPct, 0) || 1;
  return holdings.reduce((sum, item) => sum + item.pnlPct * item.weightPct / total, 0);
}

export function sign(value) {
  return value > 0 ? "+" : "";
}

export function toneClass(value) {
  return value > 0 ? "rise" : value < 0 ? "fall" : "flat";
}
