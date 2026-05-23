const MARKET_LABELS = {
  cn: "A股",
  us: "美股",
  hk: "港股",
  other: "其他"
};

const MARKET_CURRENCY = {
  cn: "CNY",
  us: "USD",
  hk: "CNY",
  other: "CNY"
};

const CURRENCY_SYMBOL = {
  CNY: "¥",
  USD: "$",
  HKD: "HK$",
  OTHER: ""
};

const SECTOR_ALIASES = [
  [/^cash(?: equivalents?)?$/i, "现金"],
  [/^(cash\s*&\s*equivalents?|money\s*market|mmf)$/i, "现金"],
  [/(^|[\s/])cash($|[\s/])/i, "现金"],
  [/^(etf|fund)$/i, "ETF"],
  [/^(index|broad index|wide index|broad market)$/i, "宽指"],
  [/^(metal|metals|materials)$/i, "金属"],
  [/^(oil|energy)$/i, "石油"]
];

const SECTOR_SECURITY_RULES = [
  [/\b(spy|voo|ivv|vti|qqq|iwm|dia|splg|schx|schb|vt)\b/i, "宽指"],
  [/(spdr s&p 500|s&p 500|标普500|nasdaq 100|纳指100|russell 2000|罗素2000|total market|broad market|broad index|wide index|core s&p|宽基|宽指|大盘指数|指数基金)/i, "宽指"],
  [/\b(cper|slv|iau|gld|gdx|gldm|gold trust|dbb|dbc|pdbc)\b/i, "金属"],
  [/(黄金|白银|铜|贵金属|金属|materials?|基础金属)/i, "金属"],
  [/\b(xle|uso|uco|dbo|oih)\b/i, "石油"],
  [/(oil|energy|石油|能源)/i, "石油"]
];

const DEFAULT_USD_CNY_RATE = Number(process.env.NEXT_PUBLIC_USD_CNY_RATE || 7.2);

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
      const market = stripText(item.market || "", 24);
      const marketGroup = inferMarketGroup({
        market,
        code: item.code || item.symbol || "",
        name: item.name || item.stockName || item.securityName || ""
      });
      const currency = inferCurrency(item.currency, marketGroup, item.marketValue);
      const marketValue = safeNum(item.marketValue);

      return {
        name: stripText(item.name || item.stockName || item.securityName || "未命名", 40),
        code: stripText(item.code || item.symbol || "", 20),
        market,
        marketGroup,
        marketLabel: MARKET_LABELS[marketGroup] || MARKET_LABELS.other,
        currency,
        assetClass: stripText(item.assetClass || "", 12),
        sector: resolveSectorLabel(item),
        weightPct: Number.isFinite(weight) ? Math.max(0, Math.min(weight, 100)) : 0,
        pnlPct: Number.isFinite(pnl) ? pnl : 0,
        marketValue,
        marketValueRmb: convertToRmb(marketValue, marketGroup, currency)
      };
    })
    .filter(item => item.weightPct > 0 || item.name !== "未命名")
    .sort((a, b) => b.weightPct - a.weightPct)
    .slice(0, 30);
}

export function splitHoldingsByMarket(holdings) {
  return holdings.reduce((acc, item) => {
    const key = item.marketGroup || "other";
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, { cn: [], us: [], hk: [], other: [] });
}

export function buildSectorGroups(holdings) {
  const groups = new Map();

  for (const item of holdings) {
    const name = stripText(item.sector || item.assetClass || item.market || "其他", 24) || "其他";
    const group = groups.get(name) || {
      name,
      holdings: [],
      count: 0,
      totalValue: 0,
      totalWeight: 0,
      totalValueRmb: 0,
      valueByCurrency: { CNY: 0, USD: 0, HKD: 0, OTHER: 0 },
      marketCounts: { cn: 0, us: 0, hk: 0, other: 0 },
      primaryCurrency: "CNY"
    };

    const value = safeNum(item.marketValue) || 0;
    const valueRmb = safeNum(item.marketValueRmb) ?? convertToRmb(value, item.marketGroup, item.currency);
    const currency = item.currency || inferCurrency(null, item.marketGroup, item.marketValue);

    group.holdings.push(item);
    group.count += 1;
    group.totalValue += value;
    group.totalWeight += Number(item.weightPct) || 0;
    group.totalValueRmb += valueRmb;
    group.valueByCurrency[currency] = (group.valueByCurrency[currency] || 0) + value;
    group.marketCounts[item.marketGroup || "other"] = (group.marketCounts[item.marketGroup || "other"] || 0) + 1;

    if ((group.valueByCurrency[currency] || 0) >= (group.valueByCurrency[group.primaryCurrency] || 0)) {
      group.primaryCurrency = currency;
    }

    groups.set(name, group);
  }

  const list = Array.from(groups.values()).map(group => ({
    ...group,
    basisValue: group.totalValueRmb > 0 ? group.totalValueRmb : Math.max(group.totalWeight, 0.1)
  }));

  const totalBasis = list.reduce((sum, item) => sum + item.basisValue, 0) || 1;

  return list
    .sort((a, b) => b.basisValue - a.basisValue)
    .map((group, index) => ({
      ...group,
      sharePct: group.basisValue / totalBasis * 100,
      paletteIndex: index
    }));
}

export function sumMarketValue(holdings) {
  return holdings.reduce((sum, item) => sum + (safeNum(item.marketValue) || 0), 0);
}

export function sumMarketValueRmb(holdings) {
  return holdings.reduce((sum, item) => sum + (safeNum(item.marketValueRmb) || 0), 0);
}

export function convertToRmb(value, marketGroup, currency) {
  const num = safeNum(value) || 0;
  if (!num) return 0;
  if (marketGroup === "us" || currency === "USD") return num * DEFAULT_USD_CNY_RATE;
  return num;
}

export function formatNativeValue(value, currency = "CNY") {
  const num = Number(value);
  if (!Number.isFinite(num) || num === 0) return "—";

  const abs = Math.abs(num);
  const symbol = CURRENCY_SYMBOL[currency] || CURRENCY_SYMBOL.OTHER;
  const unit = abs >= 100000000 ? "亿" : abs >= 10000 ? "万" : "";
  const scaled = unit === "亿" ? num / 100000000 : unit === "万" ? num / 10000 : num;
  const precision = unit ? 2 : 0;

  return `${symbol}${scaled.toFixed(precision)}${unit}`;
}

export function formatRmbValue(value) {
  return formatNativeValue(value, "CNY");
}

export function marketLabel(marketGroup) {
  return MARKET_LABELS[marketGroup] || MARKET_LABELS.other;
}

export function currencySymbol(currency) {
  return CURRENCY_SYMBOL[currency] || CURRENCY_SYMBOL.OTHER;
}

export function weightedPnl(holdings) {
  const total = holdings.reduce((sum, item) => sum + item.weightPct, 0) || 1;
  return holdings.reduce((sum, item) => sum + item.pnlPct * item.weightPct / total, 0);
}

export function buildOverview(holdings, estimatedPnl) {
  const top = holdings[0];
  if (!top) return "未识别到持仓";
  const direction = estimatedPnl >= 0 ? "小幅盈利" : "小幅回撤";
  return `识别到 ${holdings.length} 个持仓，最大仓位为 ${top.name}，组合按仓位估算今日${direction} ${Math.abs(estimatedPnl).toFixed(2)}%。`;
}

export function sign(value) {
  return value > 0 ? "+" : "";
}

export function toneClass(value) {
  return value > 0 ? "rise" : value < 0 ? "fall" : "flat";
}

function inferMarketGroup({ market, code, name }) {
  const raw = `${market || ""} ${code || ""} ${name || ""}`.toLowerCase();

  if (/(美股|us|usa|nyse|nasdaq|amex|spdr|dow|s&p|vanguard|ishares|schwab)/i.test(raw)) return "us";
  if (/(港股|hk|hong\s*kong|hkg)/i.test(raw)) return "hk";
  if (/(a股|沪|深|shanghai|shenzhen|cn|china|内地)/i.test(raw)) return "cn";
  if (/^\d{6}$/.test(String(code || ""))) return "cn";
  if (/^[A-Z0-9.\-]+$/.test(String(code || "")) && /[A-Z]/.test(String(code || ""))) return "us";

  return "other";
}

function inferCurrency(explicitCurrency, marketGroup, marketValue) {
  const currency = stripText(explicitCurrency || "", 8).toUpperCase();
  if (currency === "CNY" || currency === "RMB" || currency === "¥") return "CNY";
  if (currency === "USD" || currency === "$") return "USD";
  if (currency === "HKD" || currency === "HK$") return "CNY";

  if (marketGroup && MARKET_CURRENCY[marketGroup]) return MARKET_CURRENCY[marketGroup];
  if (Number.isFinite(Number(marketValue)) && Number(marketValue) > 0) return "CNY";
  return "CNY";
}

function normalizeSectorLabel(value) {
  const text = stripText(value, 24) || "其他";
  for (const [pattern, replacement] of SECTOR_ALIASES) {
    if (pattern.test(text)) return replacement;
  }
  return text;
}

function resolveSectorLabel(item) {
  const raw = `${item.name || ""} ${item.code || ""} ${item.symbol || ""} ${item.sector || ""} ${item.assetClass || ""}`.toLowerCase();

  for (const [pattern, label] of SECTOR_SECURITY_RULES) {
    if (pattern.test(raw)) return label;
  }

  const explicit = normalizeSectorLabel(item.sector || item.assetClass || item.market || "");
  if (explicit && explicit !== "ETF") return explicit;
  if (explicit === "ETF") return "ETF";
  return explicit || "其他";
}

function safeNum(value) {
  if (value === null || value === undefined || value === "") return null;
  const num = parseFlexibleNumber(value);
  return Number.isFinite(num) ? num : null;
}

function stripText(value, maxLength) {
  return String(value == null ? "" : value).replace(/[\r\n\t]+/g, " ").trim().slice(0, maxLength);
}

function parseFlexibleNumber(value) {
  if (value === null || value === undefined || value === "") return NaN;
  if (typeof value === "number") return value;

  const text = String(value).trim();
  if (!text) return NaN;

  const normalized = text
    .replace(/[￥¥$,\s]/g, "")
    .replace(/^\((.*)\)$/, "-$1")
    .replace(/[^\d.-]/g, "");

  const num = Number(normalized);
  return Number.isFinite(num) ? num : NaN;
}
