"use client";

import { useEffect, useRef, useState } from "react";
import MarketHoldingsPanel from "../components/MarketHoldingsPanel";
import SectorOverviewPanel from "../components/SectorOverviewPanel";
import ShareCardPanel from "../components/ShareCardPanel";
import UploadPanel from "../components/UploadPanel";
import { DEMO_RESULT } from "../lib/demoData";
import { clientLog, fileLogDetail } from "../lib/clientLog";
import { normalizeResult, splitHoldingsByMarket } from "../lib/holdings";

const MAX_UPLOAD_FILES = 2;

export default function HomePage() {
  const [page, setPage] = useState("upload");
  const [files, setFiles] = useState([]);
  const [previewUrls, setPreviewUrls] = useState([]);
  const [result, setResult] = useState(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseStatus, setParseStatus] = useState("");
  const [toast, setToast] = useState(null);
  const [debugInfo, setDebugInfo] = useState(null);
  const notifyTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      previewUrls.forEach(url => URL.revokeObjectURL(url));
      if (notifyTimerRef.current) window.clearTimeout(notifyTimerRef.current);
    };
  }, [previewUrls]);

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
        setParseStatus("原生上传解析完成，正在生成持仓视图。");
        receiveResult(payload.data);
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

  function notify(message, type = "") {
    setToast({ message, type });
    if (notifyTimerRef.current) window.clearTimeout(notifyTimerRef.current);
    notifyTimerRef.current = window.setTimeout(() => setToast(null), 2600);
  }

  function handleFiles(nextFiles) {
    const selected = normalizeFileInput(nextFiles);
    if (!selected.length) {
      setParseStatus("请先选择 1 到 2 张截图。");
      notify("请先选择 1 到 2 张截图。", "err");
      return;
    }

    const valid = [];
    for (const file of selected) {
      const error = validateImage(file);
      if (error) {
        clientLog("page.handleFile.invalid", fileLogDetail(file, { message: error }));
        notify(error, "err");
        continue;
      }
      valid.push(file);
    }

    if (!valid.length) {
      setParseStatus("请选择 PNG、JPG、WebP 或 HEIC 图片。");
      return;
    }

    if (selected.length > MAX_UPLOAD_FILES) {
      notify("最多只能上传两张图，已保留前两张。", "ok");
    }

    setPreviewUrls(prev => {
      prev.forEach(url => URL.revokeObjectURL(url));
      return valid.map(file => URL.createObjectURL(file));
    });
    setFiles(valid);
    setParseStatus(valid.length > 1 ? "已选择两张截图，可以开始解析。" : "已选择截图，可以开始解析。");
    valid.forEach(file => clientLog("page.handleFile.accepted", fileLogDetail(file)));
    notify(valid.length > 1 ? "已选择两张截图" : "截图已选择", "ok");
  }

  function receiveResult(raw) {
    const normalized = normalizeResult(raw);
    if (!normalized.holdings.length) {
      setParseStatus("接口已返回，但没有识别到可生成图表的持仓数据。");
      setDebugInfo({
        topKeys: Object.keys(raw || {}).join(", ") || "(空)",
        holdingsCount: String(normalized.holdings.length),
        rawPreview: JSON.stringify(raw || {}).slice(0, 500)
      });
      notify("没有识别到持仓数据，请换一张更清晰的截图。", "err");
      return;
    }

    const buckets = splitHoldingsByMarket(normalized.holdings);
    const nextPage = buckets.cn.length ? "cn" : buckets.us.length ? "us" : "sector";

    setResult(normalized);
    setDebugInfo(null);
    setParseStatus("");
    setPage(nextPage);
  }

  async function parseScreenshot(nextFiles = files) {
    const fileList = normalizeFileInput(nextFiles);
    if (!fileList.length) {
      notify("请先选择 1 到 2 张截图。", "err");
      return;
    }

    setDebugInfo(null);
    setIsParsing(true);
    setParseStatus(
      fileList.length > 1
        ? "正在上传两张截图并合并结果，请稍等。"
        : "正在上传截图并调用视觉模型，请稍等。"
    );

    try {
      clientLog("page.parse.start", {
        count: fileList.length,
        files: fileList.map(file => fileLogDetail(file))
      });

      const parsedResults = [];
      for (let index = 0; index < fileList.length; index += 1) {
        const file = fileList[index];
        setParseStatus(
          fileList.length > 1
            ? `正在解析第 ${index + 1}/${fileList.length} 张截图：${file.name || "截图"}`
            : "正在解析截图，请稍等。"
        );

        try {
          const data = await parseSingleScreenshot(file, index, fileList.length);
          parsedResults.push(normalizeResult(data));
        } catch (error) {
          if (error.debugInfo) {
            setDebugInfo(error.debugInfo);
          }
          const name = file.name || `第 ${index + 1} 张截图`;
          throw new Error(`${name}：${error.message || "解析失败"}`);
        }
      }

      const merged = mergeParsedResults(parsedResults);
      setParseStatus(
        fileList.length > 1
          ? "两张截图都已解析完成，正在生成合并结果。"
          : "模型已返回结果，正在生成持仓视图。"
      );
      receiveResult(merged);
      notify(fileList.length > 1 ? "两张截图解析完成" : "解析完成", "ok");
    } catch (error) {
      const message = error.message || "解析失败，请稍后再试。";
      setParseStatus(message);
      if (error.debugInfo) {
        setDebugInfo(error.debugInfo);
      }
      clientLog("page.parse.error", { message, count: fileList.length });
      notify(message, "err");
    } finally {
      setIsParsing(false);
    }
  }

  const hasResult = Boolean(result && result.holdings && result.holdings.length);

  return (
    <>
      <nav className="nav" aria-label="主导航">
        {[
          ["upload", "上传"],
          ["cn", "A股"],
          ["us", "美股"],
          ["sector", "板块"],
          ["share", "分享"]
        ].map(([key, label]) => (
          <button
            key={key}
            className={`nav-btn ${page === key ? "active" : ""}`}
            onClick={() => setPage(key)}
            disabled={!hasResult && key !== "upload"}
            type="button"
          >
            {label}
          </button>
        ))}
      </nav>

      <main className="shell">
        {page === "upload" && (
          <>
            <UploadPanel
              files={files}
              previewUrls={previewUrls}
              isParsing={isParsing}
              onFiles={handleFiles}
              onParse={parseScreenshot}
              parseStatus={parseStatus}
              onDemo={() => {
                receiveResult(DEMO_RESULT);
                notify("已加载示例结果", "ok");
              }}
            />
            {debugInfo && (
              <div className="card" style={{ marginTop: 14 }}>
                <div className="card-title">调试信息（仅开发环境可见）</div>
                <div style={{ fontSize: 12, color: "#8b949e", display: "grid", gap: 6 }}>
                  {debugInfo.finishReason && <div>finish_reason: <code>{debugInfo.finishReason}</code></div>}
                  {debugInfo.parseError && <div>JSON 解析错误: <code style={{ color: "#f85149" }}>{debugInfo.parseError}</code></div>}
                  <div>response 顶层字段: {debugInfo.topKeys}</div>
                  <div>holdings 数量: {debugInfo.holdingsCount}</div>
                  <div>原始输出（前500字）:</div>
                  <pre style={{ background: "#161b22", padding: 10, borderRadius: 6, fontSize: 11, color: "#e6edf3", overflow: "auto", maxHeight: 160, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{debugInfo.rawPreview}</pre>
                  {debugInfo.rawTail && (
                    <>
                      <div>原始输出（后500字）:</div>
                      <pre style={{ background: "#161b22", padding: 10, borderRadius: 6, fontSize: 11, color: "#e6edf3", overflow: "auto", maxHeight: 160, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{debugInfo.rawTail}</pre>
                    </>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {page === "cn" && (
          <MarketHoldingsPanel
            holdings={result?.holdings || []}
            marketGroup="cn"
            title="A股持仓"
            description="和原来的持仓页一样，显示热力图和仓位占比，只筛选 A 股。"
          />
        )}

        {page === "us" && (
          <MarketHoldingsPanel
            holdings={result?.holdings || []}
            marketGroup="us"
            title="美股持仓"
            description="和 A 股持仓页保持同样的展示方式，只显示美股持仓。"
          />
        )}

        {page === "sector" && (
          <SectorOverviewPanel
            holdings={result?.holdings || []}
            title="A股 + 美股板块总览"
            description="用环状图先看各板块总价值，金额统一按人民币折算；点击某个板块后，在右侧展开这个板块里的具体股票和对应价值。"
          />
        )}

        {page === "share" && (
          <ShareCardPanel result={result} onToast={notify} />
        )}
      </main>

      {toast && <div className={`toast show ${toast.type}`}>{toast.message}</div>}
    </>
  );
}

async function parseSingleScreenshot(nextFile, index, total) {
  const error = validateImage(nextFile);
  if (error) {
    throw new Error(error);
  }

  clientLog("page.parse.file", fileLogDetail(nextFile, { index: index + 1, total }));

  const form = new FormData();
  form.append("screenshot", nextFile, nextFile.name || `holding-screenshot-${index + 1}.png`);

  const resp = await fetch("/api/parse-holdings", { method: "POST", body: form });
  const data = await resp.json().catch(() => ({}));

  clientLog("page.parse.response", {
    ok: resp.ok,
    status: String(resp.status),
    index: String(index + 1),
    total: String(total)
  });

  if (!resp.ok) {
    let msg = data.error || `解析失败 (${resp.status})`;
    if (data.detail) msg += ` - ${data.detail}`;
    if (data.cause) msg += ` (${data.cause})`;
    const error = new Error(data.rawPreview ? `${msg} | 模型原始输出见下方调试信息` : msg);
    if (data.rawPreview) {
      error.debugInfo = {
        topKeys: "(解析失败)",
        holdingsCount: "0",
        rawPreview: data.rawPreview || "",
        rawTail: data.rawTail || "",
        parseError: data.parseError || "",
        finishReason: data.finishReason || ""
      };
    }
    throw error;
  }

  return data;
}

function mergeParsedResults(results) {
  const holdings = [];
  const warnings = [];

  for (const item of results) {
    if (Array.isArray(item?.holdings)) holdings.push(...item.holdings);
    if (Array.isArray(item?.warnings)) warnings.push(...item.warnings);
  }

  return {
    holdings,
    warnings
  };
}

function normalizeFileInput(input) {
  if (!input) return [];
  if (Array.isArray(input)) return input.filter(Boolean).slice(0, MAX_UPLOAD_FILES);
  if (typeof FileList !== "undefined" && input instanceof FileList) {
    return Array.from(input).filter(Boolean).slice(0, MAX_UPLOAD_FILES);
  }
  return [input].filter(Boolean).slice(0, MAX_UPLOAD_FILES);
}

function validateImage(file) {
  if (!file) return "请选择 1 到 2 张截图。";
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
