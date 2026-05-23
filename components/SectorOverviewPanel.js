"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArcElement, Chart, DoughnutController, Legend, Tooltip } from "chart.js";
import { buildSectorGroups, marketLabel, formatRmbValue, convertToRmb } from "../lib/holdings";

Chart.register(DoughnutController, ArcElement, Tooltip, Legend);

const SECTOR_COLORS = [
  "#4a86ff",
  "#d7a947",
  "#e68d53",
  "#57c38c",
  "#8c7dff",
  "#ff6c72",
  "#5ac7d8",
  "#9aa7b5"
];

export default function SectorOverviewPanel({ holdings, title, description }) {
  const chartRef = useRef(null);
  const canvasRef = useRef(null);
  const [activeName, setActiveName] = useState("");

  const groups = useMemo(() => {
    return buildSectorGroups(holdings)
      .map(group => {
        const holdingsRmb = group.holdings.map(item => {
          const marketValueRmb = Number.isFinite(Number(item.marketValueRmb))
            ? Number(item.marketValueRmb)
            : convertToRmb(item.marketValue, item.marketGroup, item.currency);

          return {
            ...item,
            marketValueRmb
          };
        });

        const valueRmbByMarketGroup = holdingsRmb.reduce((acc, item) => {
          const key = item.marketGroup || "other";
          acc[key] = (acc[key] || 0) + (Number(item.marketValueRmb) || 0);
          return acc;
        }, { cn: 0, us: 0, hk: 0, other: 0 });

        const totalValueRmb = holdingsRmb.reduce((sum, item) => sum + (Number(item.marketValueRmb) || 0), 0);

        return {
          ...group,
          holdings: holdingsRmb,
          totalValueRmb,
          valueRmbByMarketGroup,
          basisValue: totalValueRmb || group.basisValue
        };
      })
      .sort((a, b) => b.basisValue - a.basisValue);
  }, [holdings]);

  useEffect(() => {
    if (!groups.length) {
      setActiveName("");
      return;
    }

    setActiveName(prev => (prev && groups.some(group => group.name === prev) ? prev : groups[0].name));
  }, [groups]);

  const activeGroup = groups.find(group => group.name === activeName) || groups[0] || null;
  const totalHoldings = holdings.length;

  useEffect(() => {
    if (!canvasRef.current || !groups.length) return undefined;

    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }

    chartRef.current = new Chart(canvasRef.current, {
      type: "doughnut",
      data: {
        labels: groups.map(group => group.name),
        datasets: [{
          data: groups.map(group => group.basisValue),
          backgroundColor: groups.map((_, index) => SECTOR_COLORS[index % SECTOR_COLORS.length]),
          borderColor: "#0b1016",
          borderWidth: 4,
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "68%",
        radius: "92%",
        animation: { duration: 480 },
        onClick: (_, elements) => {
          if (!elements.length) return;
          const index = elements[0].index;
          const next = groups[index];
          if (next) setActiveName(next.name);
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: context => {
                const group = groups[context.dataIndex];
                return ` ${group.name}: ${formatRmbValue(group.totalValueRmb)}`;
              }
            }
          }
        }
      }
    });

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [groups]);

  useEffect(() => {
    if (chartRef.current && activeGroup) {
      chartRef.current.setActiveElements([{ datasetIndex: 0, index: groups.findIndex(group => group.name === activeGroup.name) }]);
      chartRef.current.update();
    }
  }, [activeGroup, groups]);

  const selectedDetails = activeGroup ? buildSelectedBreakdown(activeGroup) : [];

  return (
    <section className="page active result-panel">
      <div className="hero result-hero">
        <div className="eyebrow">A股 + 美股 · 板块环状图 · 点击查看明细</div>
        <h1>{title}</h1>
        <p>{description}</p>
        <div className="stats-row result-stats">
          <div className="stat-box">
            <div className="stat-label">板块数</div>
            <div className="stat-val">{groups.length}</div>
          </div>
          <div className="stat-box">
            <div className="stat-label">持仓数</div>
            <div className="stat-val">{totalHoldings}</div>
          </div>
          <div className="stat-box">
            <div className="stat-label">当前板块</div>
            <div className="stat-val">{activeGroup ? formatRmbValue(activeGroup.totalValueRmb) : "—"}</div>
          </div>
        </div>
      </div>

      <div className="card sector-card sector-overview-card">
        {groups.length ? (
          <div className="sector-overview-shell">
            <div className="sector-chart-panel">
              <div className="sector-chart-stage">
                <canvas ref={canvasRef} />
                <div className="chart-center sector-center">
                  <span>当前板块</span>
                  <strong>{activeGroup?.name || "—"}</strong>
                  <small>{activeGroup ? formatRmbValue(activeGroup.totalValueRmb) : "点击板块切换"}</small>
                </div>
              </div>

              <div className="sector-chip-list" aria-label="板块切换">
                {groups.map((group, index) => (
                  <button
                    key={group.name}
                    type="button"
                    className={`sector-chip ${activeName === group.name ? "active" : ""}`}
                    onClick={() => setActiveName(group.name)}
                    title={group.name}
                  >
                    <span className="sector-chip-dot" style={{ backgroundColor: SECTOR_COLORS[index % SECTOR_COLORS.length] }} />
                    <span className="sector-chip-name">{group.name}</span>
                    <span className="sector-chip-value">{formatRmbValue(group.totalValueRmb)}</span>
                  </button>
                ))}
              </div>
            </div>

            <aside className="sector-detail-panel">
              {activeGroup ? (
                <>
                  <div className="sector-detail-head">
                    <div className="sector-detail-title-wrap">
                      <div className="sector-detail-kicker">板块明细</div>
                      <h2>{activeGroup.name}</h2>
                      <p>{activeGroup.count} 只持仓 · {marketSummary(activeGroup)}</p>
                    </div>
                    <div className="sector-detail-total">{formatRmbValue(activeGroup.totalValueRmb)}</div>
                  </div>

                  <div className="sector-detail-metrics">
                    {selectedDetails.map(item => (
                      <div className="sector-detail-metric" key={item.label}>
                        <span>{item.label}</span>
                        <strong>{item.value}</strong>
                      </div>
                    ))}
                  </div>

                  <div className="sector-stock-list" aria-label={`${activeGroup.name} 股票明细`}>
                    {activeGroup.holdings.map((item, index) => (
                      <article className="sector-stock-row" key={`${item.code}-${item.name}-${index}`}>
                        <div className="sector-stock-main">
                          <div className="sector-stock-name">{item.name}</div>
                          <div className="sector-stock-meta">
                            {item.code || "—"} · {marketLabel(item.marketGroup)}
                          </div>
                        </div>
                        <div className="sector-stock-value">
                          {formatRmbValue(item.marketValueRmb)}
                        </div>
                      </article>
                    ))}
                  </div>
                </>
              ) : (
                <div className="empty-result">
                  <h2>还没有可展示的板块</h2>
                  <p>当前结果里没有识别到可分组的板块信息，先换一张更完整的持仓截图再看这一页。</p>
                </div>
              )}
            </aside>
          </div>
        ) : (
          <div className="empty-result">
            <h2>还没有可展示的板块</h2>
            <p>当前结果里没有识别到可分组的板块信息，先换一张更完整的持仓截图再看这一页。</p>
          </div>
        )}
      </div>
    </section>
  );
}

function marketSummary(group) {
  const parts = [];
  if (group.marketCounts.cn) parts.push(`A股 ${group.marketCounts.cn} 只`);
  if (group.marketCounts.us) parts.push(`美股 ${group.marketCounts.us} 只`);
  if (group.marketCounts.hk) parts.push(`港股 ${group.marketCounts.hk} 只`);
  return parts.length ? parts.join(" · ") : "暂无市场分类";
}

function buildSelectedBreakdown(group) {
  const rows = [];
  if (group.valueRmbByMarketGroup.cn > 0) rows.push({ label: "A股人民币", value: formatRmbValue(group.valueRmbByMarketGroup.cn) });
  if (group.valueRmbByMarketGroup.us > 0) rows.push({ label: "美股人民币", value: formatRmbValue(group.valueRmbByMarketGroup.us) });
  if (group.valueRmbByMarketGroup.hk > 0) rows.push({ label: "港股人民币", value: formatRmbValue(group.valueRmbByMarketGroup.hk) });
  if (!rows.length) rows.push({ label: "总权重", value: `${group.totalWeight.toFixed(1)}%` });
  return rows;
}
