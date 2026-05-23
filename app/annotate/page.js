"use client";

import { useEffect, useRef, useState } from "react";

export default function AnnotatePage() {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastRef = useRef({ x: 0, y: 0 });
  const [penColor, setPenColor] = useState("#ffd34d");
  const [penSize, setPenSize] = useState(6);

  useEffect(() => {
    function resizeCanvas() {
      const wrap = wrapRef.current;
      const canvas = canvasRef.current;
      if (!wrap || !canvas) return;
      const rect = wrap.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      const snapshot = document.createElement("canvas");
      snapshot.width = canvas.width;
      snapshot.height = canvas.height;
      snapshot.getContext("2d").drawImage(canvas, 0, 0);
      canvas.width = Math.round(rect.width * ratio);
      canvas.height = Math.round(rect.height * ratio);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      const ctx = canvas.getContext("2d");
      ctx.scale(ratio, ratio);
      if (snapshot.width && snapshot.height) {
        ctx.drawImage(snapshot, 0, 0, snapshot.width / ratio, snapshot.height / ratio, 0, 0, rect.width, rect.height);
      }
    }

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    window.addEventListener("orientationchange", resizeCanvas);
    return () => {
      window.removeEventListener("resize", resizeCanvas);
      window.removeEventListener("orientationchange", resizeCanvas);
    };
  }, []);

  function getPoint(event) {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }

  function startDraw(event) {
    event.preventDefault();
    drawingRef.current = true;
    lastRef.current = getPoint(event);
  }

  function draw(event) {
    if (!drawingRef.current) return;
    event.preventDefault();
    const next = getPoint(event);
    const ctx = canvasRef.current.getContext("2d");
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = penColor;
    ctx.lineWidth = penSize;
    ctx.beginPath();
    ctx.moveTo(lastRef.current.x, lastRef.current.y);
    ctx.lineTo(next.x, next.y);
    ctx.stroke();
    lastRef.current = next;
  }

  function stopDraw() {
    drawingRef.current = false;
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  return (
    <main className="annotate-page">
      <div className="annotate-toolbar">
        <strong>持仓页标注</strong>
        <div className="annotate-controls">
          {["#ffd34d", "#ff706b", "#4fd18b", "#5da4ff"].map(color => (
            <button
              key={color}
              className={`swatch ${penColor === color ? "active" : ""}`}
              style={{ background: color }}
              type="button"
              aria-label={`选择颜色 ${color}`}
              onClick={() => setPenColor(color)}
            />
          ))}
          <input
            aria-label="画笔粗细"
            type="range"
            min="3"
            max="16"
            value={penSize}
            onChange={event => setPenSize(Number(event.target.value))}
          />
          <button className="secondary compact-action" type="button" onClick={clearCanvas}>清空</button>
        </div>
      </div>

      <section className="annotate-board" ref={wrapRef}>
        <VisualMap />
        <canvas
          ref={canvasRef}
          className="draw-layer"
          onPointerDown={startDraw}
          onPointerMove={draw}
          onPointerUp={stopDraw}
          onPointerCancel={stopDraw}
          onPointerLeave={stopDraw}
        />
      </section>
    </main>
  );
}

function VisualMap() {
  return (
    <div className="visual-map">
      <header className="visual-map-head">
        <h1>持仓页视觉标注图</h1>
        <p>圈出你想改的位置，截屏发我</p>
      </header>

      <div className="mock-panels">
        <section className="mock-panel">
          <div className="mock-panel-top">
            <h2>热力图视图</h2>
            <Segment active="heat" />
          </div>
          <div className="mock-heatmap">
            <Cell className="big red" name="贵州茅台" code="600519" pct="+2.35%" weight="占比 18.6%" />
            <Cell className="mid green" name="宁德时代" pct="-1.18%" weight="占比 12.4%" />
            <Cell className="wide red" name="招商银行" pct="+0.82%" />
            <Cell className="small green" name="美的集团" pct="-0.64%" />
            <Cell className="small gray" name="现金" pct="0.00%" />
            <Cell className="small red" name="中芯国际" pct="+3.10%" />
            <Tag n="1" text="热力图文字" className="tag-heat-text" />
            <Tag n="2" text="红绿配色" className="tag-heat-color" />
          </div>
          <Tag n="3" text="顶部切换按钮" className="tag-switch" />
        </section>

        <section className="mock-panel">
          <div className="mock-panel-top">
            <h2>占比视图</h2>
            <Segment active="chart" />
          </div>
          <div className="mock-allocation">
            <div className="mock-donut">
              <div className="donut-ring" />
              <div className="donut-center"><span>持仓</span><strong>8</strong></div>
              <Tag n="4" text="占比环图" className="tag-donut" />
            </div>
            <div className="mock-ranking">
              {[
                ["01", "贵州茅台", "18.6%"],
                ["02", "宁德时代", "12.4%"],
                ["03", "招商银行", "9.8%"],
                ["04", "美的集团", "8.2%"]
              ].map(row => (
                <div className="mock-rank-row" key={row[0]}>
                  <span>{row[0]}</span>
                  <b>{row[1]}</b>
                  <strong>{row[2]}</strong>
                </div>
              ))}
              <Tag n="5" text="持仓排行" className="tag-ranking" />
            </div>
          </div>
          <Tag n="6" text="横竖屏/留白" className="tag-layout" />
        </section>
      </div>
    </div>
  );
}

function Segment({ active }) {
  return (
    <div className="mock-segment">
      <span className={active === "heat" ? "active" : ""}>热力图</span>
      <span className={active === "chart" ? "active" : ""}>占比</span>
    </div>
  );
}

function Cell({ className, name, code, pct, weight }) {
  return (
    <div className={`mock-cell ${className}`}>
      <b>{name}</b>
      {code && <span>{code}</span>}
      <strong>{pct}</strong>
      {weight && <em>{weight}</em>}
    </div>
  );
}

function Tag({ n, text, className }) {
  return (
    <div className={`map-tag ${className}`}>
      <span>{n}</span>
      <b>{text}</b>
    </div>
  );
}
