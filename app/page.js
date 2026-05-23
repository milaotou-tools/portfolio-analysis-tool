"use client";

import { useEffect, useRef, useState } from "react";
import { Chart, ArcElement, DoughnutController, Tooltip, Legend } from "chart.js";
import HoldingTreemap from "../components/HoldingTreemap";
import ShareCardPanel from "../components/ShareCardPanel";
import UploadPanel from "../components/UploadPanel";
import { DEMO_RESULT } from "../lib/demoData";
import { clientLog, fileLogDetail } from "../lib/clientLog";
import { normalizeResult } from "../lib/holdings";

Chart.register(DoughnutController, ArcElement, Tooltip, Legend);

const CHART_COLORS = ["#c65355", "#23865f", "#c9a44a", "#4d83c8", "#8b6fc9", "#5aa0a8", "#9a7650", "#7c8794"];

export default function HomePage() {
  const [page, setPage] = useState("upload");
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [result, setResult] = useState(null);
  const [isDemo, setIsDemo] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [holdingView, setHoldingView] = useState("heatmap");
  const [viewportMode, setViewportMode] = useState("desktop");
  const [parseStatus, setParseStatus] = useState("");
  const [toast, setToast] = useState(null);
  const chartRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    function updateViewportMode() {
      const landscapePhone = window.innerWidth <= 920 && window.innerHeight <= 560 && window.innerWidth > window.innerHeight;
      const portraitPhone = window.innerWidth <= 760 && window.innerHeight >= window.innerWidth;
      setViewportMode(landscapePhone ? "phone-landscape" : portraitPhone ? "phone-portrait" : "desktop");
    }

    updateViewportMode();
    window.addEventListener("resize", updateViewportMode);
    window.addEventListener("orientationchange", updateViewportMode);
    return () => {
      window.removeEventListener("resize", updateViewportMode);
      window.removeEventListener("orientationchange", updateViewportMode);
    };
  }, []);

  useEffect(() => {
    const raw =
      window.sessionStorage.getItem("holdingNativeUploadResult") ||
      window.localStorage.getItem("holdingNativeUploadResult") ||
      readNativeUploadCookie();
    const params = new URLSearchParams(window.location.search);
    window.sessionStorage.removeItem("holdingNativeUploadResult");
    window.localStorage.removeItem("holdingNativeUploadResult");
    clearNativeUploadCookie();

    if (!raw) {
      if (params.get("nativeStatus") === "error") {
        setParseStatus("原生上传没有带回错误详情，请重新选择截图再试。");
        notify("原生上传没有带回错误详情。", "err");
      } else if (params.get("nativeStatus") === "ok") {
        setParseStatus("原生上传已返回，但结果没有成功写入页面。");
        notify("原生上传结果没有成功写入页面。", "err");
      }
      return;
    }

    try {
      const payload = JSON.parse(raw);
      if (payload && payload.ok) {
        setParseStatus("原生上传解析完成，正在生成持仓图。");
        receiveResult(payload.data, false);
        notify("解析完成", "ok");
      } else {
        const message = (payload && payload.error) || "原生上传解析失败。";
        setParseStatus(message);
        notify(message, "err");
      }
    } catch {
      setParseStatus("原生上传返回结果读取失败。");
      notify("原生上传返回结果读取失败。", "err");
    }
  }, []);

  useEffect(() => {
    if (!result || holdingView !== "chart" || !canvasRef.current) return;
    if (chartRef.current) chartRef.current.destroy();

    const compactChart = viewportMode === "phone-landscape";
    chartRef.current = new Chart(canvasRef.current, {
      type: "doughnut",
      data: {
        labels: result.holdings.map(item => item.name),
        datasets: [{
          data: result.holdings.map(item => item.weightPct),
          backgroundColor: result.holdings.map((_, index) => CHART_COLORS[index % CHART_COLORS.length]),
          borderColor: "#0c1219",
          borderWidth: compactChart ? 2 : 3,
          hoverOffset: compactChart ? 2 : 5
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: compactChart ? "58%" : "62%",
        radius: compactChart ? "92%" : "90%",
        layout: {
          padding: compactChart
            ? { top: 0, right: 2, bottom: 0, left: 2 }
            : { top: 4, right: 6, bottom: 0, left: 6 }
        },
        plugins: {
          legend: {
            display: false,
            position: compactChart ? "right" : "bottom",
            labels: {
              color: "#e6edf3",
              boxWidth: compactChart ? 10 : 12,
              boxHeight: compactChart ? 10 : 12,
              padding: compactChart ? 8 : 14,
              font: { size: compactChart ? 11 : 12, weight: "700" }
            }
          },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.label}: ${ctx.parsed.toFixed(1)}%`
            }
          }
        }
      }
    });

    return () => {
      if (chartRef.current) chartRef.current.destroy();
      chartRef.current = null;
    };
  }, [result, holdingView, viewportMode]);

  function notify(message, type = "") {
    setToast({ message, type });
    window.clearTimeout(notify.timer);
    notify.timer = window.setTimeout(() => setToast(null), 2600);
  }

  function handleFile(nextFile) {
    const error = validateImage(nextFile);
    if (error) {
      clientLog("page.handleFile.invalid", fileLogDetail(nextFile, { message: error }));
      notify(error, "err");
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(nextFile);
    setPreviewUrl(URL.createObjectURL(nextFile));
    setParseStatus("已选择截图，可以开始解析。");
    clientLog("page.handleFile.accepted", fileLogDetail(nextFile));
    notify("截图已选择", "ok");
  }

  function receiveResult(raw, demo = false) {
    const normalized = normalizeResult(raw);
    if (!normalized.holdings.length) {
      notify("没有识别到持仓，请换一张更清晰的截图。", "err");
      return;
    }
    setResult(normalized);
    setIsDemo(demo);
    setParseStatus("");
    setPage("result");
  }

  async function parseScreenshot(nextFile = file) {
    const error = validateImage(nextFile);
    if (error) {
      notify(error, "err");
      return;
    }

    setIsParsing(true);
    setParseStatus("正在上传截图并调用视觉模型，请稍等。");
    clientLog("page.parse.start", fileLogDetail(nextFile));
    try {
      const form = new FormData();
      form.append("screenshot", nextFile, nextFile.name || "holding-screenshot.png");
      const resp = await fetch("/api/parse-holdings", { method: "POST", body: form });
      const data = await resp.json().catch(() => ({}));
      clientLog("page.parse.response", { ok: resp.ok, status: String(resp.status) });
      if (!resp.ok) throw new Error(data.error || `解析失败 (${resp.status})`);
      setParseStatus("模型已返回结果，正在生成持仓图。");
      receiveResult(data, false);
      notify("解析完成", "ok");
    } catch (error) {
      const message = error.message || "解析失败，请稍后再试";
      setParseStatus(message);
      clientLog("page.parse.error", { message });
      notify(message, "err");
    } finally {
      setIsParsing(false);
    }
  }


  return (
    <>
      <nav className="nav" aria-label="主导航">
        {[
          ["upload", "上传"],
          ["result", "持仓"],
          ["share", "分享"]
        ].map(([key, label]) => (
          <button key={key} className={`nav-btn ${page === key ? "active" : ""}`} onClick={() => setPage(key)}>
            {label}
          </button>
        ))}
      </nav>

      <main className="shell">
        {page === "upload" && (
          <UploadPanel
            file={file}
            previewUrl={previewUrl}
            isParsing={isParsing}
            onFile={handleFile}
            onParse={parseScreenshot}
            parseStatus={parseStatus}
            onDemo={() => {
              receiveResult(DEMO_RESULT, true);
              notify("已加载示例结果", "ok");
            }}
          />
        )}

        {page === "result" && (
          <section className="page active">
            <div className="card holdings-card">
              <div className="card-title">
                <span>{holdingView === "heatmap" ? "持仓热力图" : "仓位占比"}</span>
                <div className="view-switch" role="tablist" aria-label="持仓图表切换">
                  <button
                    type="button"
                    className={holdingView === "heatmap" ? "active" : ""}
                    onClick={() => setHoldingView("heatmap")}
                  >
                    热力图
                  </button>
                  <button
                    type="button"
                    className={holdingView === "chart" ? "active" : ""}
                    onClick={() => setHoldingView("chart")}
                  >
                    占比
                  </button>
                </div>
              </div>

              {holdingView === "heatmap" ? (
                <HoldingTreemap holdings={result?.holdings || []} />
              ) : (
                <div className="allocation-view">
                  <div className="chart-holder">
                    <canvas ref={canvasRef} />
                    <div className="chart-center">
                      <span>持仓</span>
                      <strong>{result?.holdings?.length || 0}</strong>
                    </div>
                  </div>
                  <div className="allocation-list" aria-label="仓位占比图注">
                    {(result?.holdings || []).slice(0, 8).map((item, index) => (
                      <div className="allocation-row" key={`${item.code}-${item.name}`}>
                        <span
                          className="allocation-swatch"
                          style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                          aria-hidden="true"
                        />
                        <span className="allocation-name">{item.name}</span>
                        <span className="allocation-weight">{item.weightPct.toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="holdings-view-controls">
                <div className="view-switch" role="tablist" aria-label="鎸佷粨鍥捐〃鍒囨崲">
                  <button
                    type="button"
                    className={holdingView === "heatmap" ? "active" : ""}
                    onClick={() => setHoldingView("heatmap")}
                  >
                    鐑姏鍥?
                  </button>
                  <button
                    type="button"
                    className={holdingView === "chart" ? "active" : ""}
                    onClick={() => setHoldingView("chart")}
                  >
                    鍗犳瘮
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {page === "share" && (
          <ShareCardPanel result={result} onToast={notify} />
        )}
      </main>

      {toast && <div className={`toast show ${toast.type}`}>{toast.message}</div>}
    </>
  );
}

function validateImage(file) {
  if (!file) return "请选择一张截图。";
  if (!isSupportedImage(file)) return "请选择 PNG、JPG、WebP 或 HEIC 图片。";
  if (file.size > 10 * 1024 * 1024) return "图片太大了，请压缩到 10MB 以内再上传。";
  return "";
}

function isSupportedImage(file) {
  if (file.type && file.type.startsWith("image/")) return true;
  if (!file.type || file.type === "application/octet-stream") return true;
  return /\.(png|jpe?g|webp|heic|heif)$/i.test(file.name || "");
}

function readNativeUploadCookie() {
  const match = document.cookie.match(/(?:^|;\s*)holdingNativeUploadResult=([^;]+)/);
  if (!match) return "";
  try {
    const base64 = match[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    return decodeURIComponent(escape(window.atob(padded)));
  } catch {
    return "";
  }
}

function clearNativeUploadCookie() {
  document.cookie = "holdingNativeUploadResult=; Path=/; Max-Age=0; SameSite=Lax";
}
