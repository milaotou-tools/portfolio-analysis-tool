"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Chart, ArcElement, DoughnutController, Tooltip, Legend } from "chart.js";
import HoldingTreemap from "./HoldingTreemap";
import { formatNativeValue, marketLabel, sumMarketValue } from "../lib/holdings";

Chart.register(DoughnutController, ArcElement, Tooltip, Legend);

const CHART_COLORS = ["#c65355", "#23865f", "#c9a44a", "#4d83c8", "#8b6fc9", "#5aa0a8", "#9a7650", "#7c8794"];

export default function MarketHoldingsPanel({ holdings, marketGroup, title, description }) {
  const [view, setView] = useState("chart");
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  const visibleHoldings = useMemo(
    () => holdings.filter(item => (item.marketGroup || "other") === marketGroup),
    [holdings, marketGroup]
  );
  const chartHoldings = useMemo(() => [...visibleHoldings].sort((a, b) => getChartBasis(b) - getChartBasis(a)), [visibleHoldings]);
  const chartValues = useMemo(() => chartHoldings.map(item => getChartBasis(item)), [chartHoldings]);
  const chartTotal = useMemo(() => chartValues.reduce((sum, value) => sum + value, 0), [chartValues]);
  const totalValue = useMemo(() => sumMarketValue(visibleHoldings), [visibleHoldings]);
  const topHoldings = chartHoldings.slice(0, 8);
  const marketName = marketLabel(marketGroup);

  useEffect(() => {
    if (view !== "chart" || !canvasRef.current || !chartHoldings.length) return undefined;

    if (chartRef.current) chartRef.current.destroy();

    chartRef.current = new Chart(canvasRef.current, {
      type: "doughnut",
      data: {
        labels: chartHoldings.map(item => item.name),
        datasets: [{
          data: chartValues,
          backgroundColor: chartHoldings.map((_, index) => CHART_COLORS[index % CHART_COLORS.length]),
          borderColor: "#0c1219",
          borderWidth: 3,
          hoverOffset: 5
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "62%",
        radius: "90%",
        layout: {
          padding: { top: 4, right: 6, bottom: 0, left: 6 }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => {
                const item = chartHoldings[ctx.dataIndex];
                const value = Number(ctx.parsed) || 0;
                const share = chartTotal > 0 ? (value / chartTotal) * 100 : 0;
                return ` ${ctx.label}: ${formatNativeValue(value, item?.currency || visibleHoldings[0]?.currency)} (${share.toFixed(1)}%)`;
              }
            }
          }
        }
      }
    });

    return () => {
      if (chartRef.current) chartRef.current.destroy();
      chartRef.current = null;
    };
  }, [view, chartHoldings, chartValues, chartTotal, visibleHoldings]);

  useEffect(() => {
    if (chartRef.current && view !== "chart") {
      chartRef.current.destroy();
      chartRef.current = null;
    }
  }, [view]);

  return (
    <section className="page active result-panel">
      <div className="hero result-hero">
        <div className="eyebrow">{marketName} · 持仓识别 · 热力图 / 占比</div>
        <h1>{title}</h1>
        <p>{description}</p>
        <div className="stats-row result-stats">
          <div className="stat-box">
            <div className="stat-label">持仓数</div>
            <div className="stat-val">{visibleHoldings.length}</div>
          </div>
          <div className="stat-box">
            <div className="stat-label">总市值</div>
            <div className="stat-val">{visibleHoldings.length ? formatNativeValue(totalValue, visibleHoldings[0]?.currency) : "—"}</div>
          </div>
          <div className="stat-box">
            <div className="stat-label">市场</div>
            <div className="stat-val">{marketName}</div>
          </div>
        </div>
      </div>

      <div className="card holdings-card market-card">
        {visibleHoldings.length ? (
          <>
            {view === "heatmap" ? (
              <HoldingTreemap holdings={visibleHoldings} />
            ) : (
              <div className="allocation-view">
                <div className="chart-holder">
                  <canvas ref={canvasRef} />
                  <div className="chart-center">
                    <span>持仓</span>
                    <strong>{visibleHoldings.length}</strong>
                  </div>
                </div>
                <div className="allocation-list" aria-label={`${marketName}持仓排行`}>
                  {topHoldings.map((item, index) => (
                    <div className="allocation-row" key={`${item.code}-${item.name}`}>
                      <span
                        className="allocation-swatch"
                        style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                        aria-hidden="true"
                      />
                      <span className="allocation-name">{item.name}</span>
                      <span className="allocation-weight">{formatNativeValue(getChartBasis(item), item.currency)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="holdings-view-controls">
              <div className="view-switch" role="tablist" aria-label={`${marketName}持仓视图切换`}>
                <button
                  type="button"
                  className={view === "heatmap" ? "active" : ""}
                  onClick={() => setView("heatmap")}
                >
                  热力图
                </button>
                <button
                  type="button"
                  className={view === "chart" ? "active" : ""}
                  onClick={() => setView("chart")}
                >
                  占比
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="empty-result">
            <h2>未识别到{marketName}持仓</h2>
            <p>当前这张截图里没有被识别为 {marketName} 的持仓，换一张对应市场的截图再试一次。</p>
          </div>
        )}
      </div>
    </section>
  );
}

function getChartBasis(item) {
  const marketValue = Number(item?.marketValue);
  if (Number.isFinite(marketValue) && marketValue > 0) return marketValue;
  const marketValueRmb = Number(item?.marketValueRmb);
  if (Number.isFinite(marketValueRmb) && marketValueRmb > 0) return marketValueRmb;
  const weight = Number(item?.weightPct);
  if (Number.isFinite(weight) && weight > 0) return weight;
  return 0;
}
