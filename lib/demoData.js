export const DEMO_RESULT = {
  holdings: [
    { name: "原油 ETF", code: "BWET", weightPct: 35, pnlPct: 4.13, sector: "能源" },
    { name: "白银 ETF", code: "ZSL", weightPct: 20, pnlPct: -2.85, sector: "金属" },
    { name: "中国反向 ETF", code: "YANG", weightPct: 15, pnlPct: -1.00, sector: "宽基" },
    { name: "黄金 ETF", code: "DGZ", weightPct: 12, pnlPct: -0.92, sector: "金属" },
    { name: "纳指 ETF", code: "QQQM", weightPct: 8, pnlPct: -0.54, sector: "宽基" },
    { name: "标普 ETF", code: "SH", weightPct: 5, pnlPct: -0.40, sector: "宽基" },
    { name: "道指 ETF", code: "DIA", weightPct: 5, pnlPct: -0.36, sector: "宽基" }
  ],
  summary: {
    overview: "高仓位集中在能源和贵金属，对冲型 ETF 占比较高；今日组合估算小幅波动。",
    totalPositions: 7,
    topHolding: "原油 ETF",
    estimatedPnlPct: 0.52
  },
  warnings: ["示例数据仅用于预览页面效果，不构成投资建议。"]
};
