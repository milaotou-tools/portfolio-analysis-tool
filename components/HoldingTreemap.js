"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { sign, toneClass } from "../lib/holdings";

export default function HoldingTreemap({ holdings }) {
  const ref = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const rects = useMemo(() => treemapLayout(holdings.slice(0, 12), size), [holdings, size]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;

    function updateSize() {
      const next = element.getBoundingClientRect();
      setSize(prev => {
        const width = Math.round(next.width);
        const height = Math.round(next.height);
        if (Math.abs(prev.width - width) < 2 && Math.abs(prev.height - height) < 2) return prev;
        return { width, height };
      });
    }

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="heatmap" ref={ref}>
      {rects.map(({ item, rect, metrics }) => {
        const tone = toneClass(item.pnlPct);
        const className = [
          "hm-cell",
          metrics.roomy ? "roomy" : "",
          metrics.small ? "small" : "",
          metrics.compact ? "compact" : "",
          metrics.tiny ? "tiny" : ""
        ].filter(Boolean).join(" ");
        return (
          <div
            className={className}
            key={`${item.code}-${item.name}`}
            title={`${item.name} ${item.code || item.sector} | 占比 ${item.weightPct.toFixed(1)}% | 涨跌 ${sign(item.pnlPct)}${item.pnlPct.toFixed(2)}%`}
            style={{
              left: `${rect.left}%`,
              top: `${rect.top}%`,
              width: `${rect.width}%`,
              height: `${rect.height}%`,
              background: heatColor(item.pnlPct)
            }}
          >
            <div className="hm-name">{item.name}</div>
            <div className="hm-code">{item.code || item.sector}</div>
            <div className={`hm-pct ${tone}`}>{sign(item.pnlPct)}{item.pnlPct.toFixed(2)}%</div>
            <div className="hm-meta">占比 {item.weightPct.toFixed(1)}%</div>
          </div>
        );
      })}
    </div>
  );
}

function treemapLayout(items, size) {
  const safeItems = items.map(item => ({ item, value: Math.max(item.weightPct, 0.1) }));
  const rects = [];
  const width = Math.max(size.width || 1, 1);
  const height = Math.max(size.height || width, 1);
  const layoutWidth = 100;
  const layoutHeight = Math.max(42, Math.min(190, layoutWidth * height / width));
  splitTreemap(safeItems, { x: 0, y: 0, w: layoutWidth, h: layoutHeight }, rects);

  return rects.map(({ item, rect }) => {
    const percentRect = {
      left: rect.x,
      top: rect.y / layoutHeight * 100,
      width: rect.w,
      height: rect.h / layoutHeight * 100
    };
    const pixelWidth = percentRect.width / 100 * width;
    const pixelHeight = percentRect.height / 100 * height;
    const area = pixelWidth * pixelHeight;
    return {
      item,
      rect: percentRect,
      metrics: {
        roomy: pixelWidth >= 190 && pixelHeight >= 120,
        small: pixelWidth < 150 || pixelHeight < 86 || area < 12000,
        compact: pixelWidth < 96 || pixelHeight < 62 || area < 7200,
        tiny: pixelWidth < 58 || pixelHeight < 42 || area < 3600
      }
    };
  });
}

function splitTreemap(items, rect, rects) {
  if (!items.length) return;
  if (items.length === 1) {
    rects.push({ item: items[0].item, rect });
    return;
  }

  const total = items.reduce((sum, entry) => sum + entry.value, 0);
  const half = total / 2;
  let acc = 0;
  let splitIndex = 0;

  for (let i = 0; i < items.length; i += 1) {
    if (i > 0 && Math.abs((acc + items[i].value) - half) > Math.abs(acc - half)) break;
    acc += items[i].value;
    splitIndex = i + 1;
  }

  splitIndex = Math.max(1, Math.min(splitIndex, items.length - 1));
  const first = items.slice(0, splitIndex);
  const second = items.slice(splitIndex);
  const firstTotal = first.reduce((sum, entry) => sum + entry.value, 0);
  const ratio = firstTotal / total;

  if (rect.w >= rect.h) {
    const w1 = rect.w * ratio;
    splitTreemap(first, { x: rect.x, y: rect.y, w: w1, h: rect.h }, rects);
    splitTreemap(second, { x: rect.x + w1, y: rect.y, w: rect.w - w1, h: rect.h }, rects);
  } else {
    const h1 = rect.h * ratio;
    splitTreemap(first, { x: rect.x, y: rect.y, w: rect.w, h: h1 }, rects);
    splitTreemap(second, { x: rect.x, y: rect.y + h1, w: rect.w, h: rect.h - h1 }, rects);
  }
}

function heatColor(value) {
  const strength = Math.min(Math.abs(value) / 7, 1);
  if (value > 0) {
    return `linear-gradient(180deg, rgba(117, 35, 37, ${0.72 + strength * 0.18}), rgba(73, 28, 34, ${0.74 + strength * 0.18}))`;
  }
  if (value < 0) {
    return `linear-gradient(180deg, rgba(23, 87, 61, ${0.72 + strength * 0.18}), rgba(18, 59, 49, ${0.74 + strength * 0.18}))`;
  }
  return "linear-gradient(180deg, rgba(57, 66, 78, .72), rgba(38, 47, 58, .78))";
}
