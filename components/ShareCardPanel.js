import { useRef, useState } from "react";
import { buildOverview, sign, weightedPnl } from "../lib/holdings";

export default function ShareCardPanel({ result, onToast }) {
  const canvasRef = useRef(null);
  const [shareUrl, setShareUrl] = useState("");
  const [shareBlob, setShareBlob] = useState(null);
  const [fallback, setFallback] = useState(false);

  async function ensureCard() {
    if (!result) {
      onToast("请先解析持仓截图。", "err");
      return null;
    }
    if (shareBlob && shareUrl) return { blob: shareBlob, url: shareUrl };

    const generated = await generateShareBlob(canvasRef.current, result);
    setShareBlob(generated.blob);
    setShareUrl(generated.url);
    return generated;
  }

  async function shareCard() {
    const generated = await ensureCard();
    if (!generated) return;

    const file = new File([generated.blob], "holdings-card.png", { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        title: "脱敏持仓概览",
        text: "我的脱敏持仓概览卡片",
        files: [file]
      });
      onToast("已打开系统分享", "ok");
      return;
    }

    setFallback(true);
    onToast("当前浏览器不支持直接分享，请保存或长按卡片。");
  }

  async function saveCard() {
    const generated = await ensureCard();
    if (!generated) return;
    const a = document.createElement("a");
    a.href = generated.url;
    a.download = "holdings-card.png";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <section className="page active">
      <div className="hero">
        <div className="eyebrow">一键分享</div>
        <h1 className="section-title">脱敏持仓卡片</h1>
        <p>卡片只在本机生成，分享动作必须由你点击按钮触发。不会分享原始截图、账号、券商或完整金额。</p>
      </div>

      <div className="card">
        <div className="card-title">卡片预览</div>
        {shareUrl && <img className="share-preview" src={shareUrl} alt="脱敏持仓分享卡片" />}
        {fallback && <p className="fallback-note">当前浏览器不支持直接调起系统分享时，可以保存图片，或在手机上长按卡片分享给微信、朋友圈或其他 App。</p>}
        <div className="action-row">
          <button className="primary" disabled={!result} onClick={shareCard}>生成并分享</button>
          <button className="secondary" disabled={!result} onClick={saveCard}>保存图片</button>
        </div>
      </div>

      <canvas ref={canvasRef} width="1080" height="1440" style={{ display: "none" }} />
    </section>
  );
}

async function generateShareBlob(canvas, result) {
  const ctx = canvas.getContext("2d");
  const { holdings, summary } = result;
  const pnl = Number(summary.estimatedPnlPct ?? weightedPnl(holdings));
  const top = holdings.slice(0, 6);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const bg = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  bg.addColorStop(0, "#06070a");
  bg.addColorStop(.58, "#111720");
  bg.addColorStop(1, "#241b0c");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "rgba(214,169,58,.18)";
  ctx.beginPath(); ctx.arc(120, 80, 230, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(47,128,237,.10)";
  ctx.beginPath(); ctx.arc(960, 1340, 260, 0, Math.PI * 2); ctx.fill();

  roundRect(ctx, 70, 80, 940, 1280, 28, "rgba(17,24,33,.94)", "rgba(214,169,58,.55)");
  ctx.fillStyle = "#d6a93a";
  ctx.font = "700 34px PingFang SC, Microsoft YaHei, sans-serif";
  ctx.fillText("脱敏持仓概览", 120, 165);
  ctx.fillStyle = "#e6edf3";
  ctx.font = "900 86px PingFang SC, Microsoft YaHei, sans-serif";
  ctx.fillText(`${sign(pnl)}${pnl.toFixed(2)}%`, 120, 265);
  ctx.fillStyle = pnl >= 0 ? "#f85149" : "#3fb950";
  ctx.font = "700 30px PingFang SC, Microsoft YaHei, sans-serif";
  ctx.fillText(pnl >= 0 ? "组合估算盈利" : "组合估算回撤", 120, 315);

  ctx.fillStyle = "#8b949e";
  ctx.font = "28px PingFang SC, Microsoft YaHei, sans-serif";
  wrapCanvasText(ctx, summary.overview || buildOverview(holdings, pnl), 120, 390, 820, 42, 3);

  let y = 560;
  top.forEach((item, index) => {
    const tone = item.pnlPct >= 0 ? "#f85149" : item.pnlPct < 0 ? "#3fb950" : "#8b949e";
    roundRect(ctx, 120, y, 840, 104, 16, "rgba(6,7,10,.48)", "rgba(214,169,58,.22)");
    ctx.fillStyle = "#e6edf3";
    ctx.font = "700 32px PingFang SC, Microsoft YaHei, sans-serif";
    ctx.fillText(`${index + 1}. ${item.name}`, 150, y + 43);
    ctx.fillStyle = "#8b949e";
    ctx.font = "24px PingFang SC, Microsoft YaHei, sans-serif";
    ctx.fillText(item.code || item.sector, 150, y + 77);
    ctx.textAlign = "right";
    ctx.fillStyle = "#e6edf3";
    ctx.font = "800 32px PingFang SC, Microsoft YaHei, sans-serif";
    ctx.fillText(`${item.weightPct.toFixed(1)}%`, 920, y + 43);
    ctx.fillStyle = tone;
    ctx.font = "700 26px PingFang SC, Microsoft YaHei, sans-serif";
    ctx.fillText(`${sign(item.pnlPct)}${item.pnlPct.toFixed(2)}%`, 920, y + 78);
    ctx.textAlign = "left";
    y += 124;
  });

  ctx.fillStyle = "#9aa7b5";
  ctx.font = "24px PingFang SC, Microsoft YaHei, sans-serif";
  ctx.fillText("已隐藏账号、券商、原始截图和完整金额", 120, 1265);
  ctx.fillStyle = "#d6a93a";
  ctx.font = "700 28px PingFang SC, Microsoft YaHei, sans-serif";
  ctx.fillText("持仓分析仪", 120, 1310);

  const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png", .95));
  return { blob, url: URL.createObjectURL(blob) };
}

function roundRect(ctx, x, y, w, h, r, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
}

function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  const chars = String(text).split("");
  let line = "";
  let lines = 0;
  for (const char of chars) {
    const test = line + char;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      line = char;
      y += lineHeight;
      lines += 1;
      if (lines >= maxLines - 1) break;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, y);
}
