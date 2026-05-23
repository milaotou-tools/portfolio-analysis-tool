import { useState } from "react";

export default function UploadPanel({ file, previewUrl, isParsing, parseStatus, onFile, onParse, onDemo }) {
  const [previewFailed, setPreviewFailed] = useState(false);
  const [localStatus, setLocalStatus] = useState("");

  function startParse(selected) {
    if (isParsing) return;
    setLocalStatus("正在上传截图并解析...");
    window.setTimeout(() => {
      onParse(selected);
    }, 80);
  }

  function handleFileInput(event) {
    const selected = event.currentTarget.files && event.currentTarget.files[0];
    if (!selected) {
      setLocalStatus("没有读取到图片，请重新选择截图。");
      return;
    }

    setPreviewFailed(false);
    onFile(selected);
    setLocalStatus("已选择截图，点击“上传并解析”开始识别。");
  }

  function handleDrop(event) {
    event.preventDefault();
    const selected = event.dataTransfer.files && event.dataTransfer.files[0];
    if (!selected) {
      setLocalStatus("没有读取到图片，请重新选择截图。");
      return;
    }
    setPreviewFailed(false);
    onFile(selected);
    setLocalStatus("已选择截图，可以开始解析。");
  }

  function handleParse() {
    if (!file) {
      setLocalStatus("请先选择截图。");
      return;
    }
    startParse(file);
  }

  function blockNativeSubmit(event) {
    event.preventDefault();
    handleParse();
  }

  const visibleStatus = parseStatus || localStatus;

  return (
    <section className="page active">
      <div className="hero">
        <div className="eyebrow">手机截图 · 私密解析 · 脱敏分享</div>
        <h1>持仓分析仪</h1>
        <p>上传一张股票持仓截图，系统会自动识别持仓并生成热力图和仓位占比。截图只用于本次解析，不生成公开链接。</p>
      </div>

      <div className="upload-layout">
        <div
          className="upload-zone"
          onDragOver={event => event.preventDefault()}
          onDrop={handleDrop}
        >
          <div className="upload-input-card">
            <div className="card-title">上传截图</div>
            <form className="native-upload-form" onSubmit={blockNativeSubmit}>
              <input
                className="native-visible-upload"
                name="screenshot"
                type="file"
                accept="image/*,.heic,.heif"
                onChange={handleFileInput}
              />
              <button className="primary native-submit-btn" type="button" disabled={isParsing} onClick={handleParse}>
                {isParsing ? "解析中..." : "上传并解析"}
              </button>
            </form>
            <p className="fallback-note">选择截图后不会跳转页面；点击“上传并解析”后会在当前页面完成识别。</p>
          </div>

          {visibleStatus && <div className="parse-status upload-top-status">{visibleStatus}</div>}

          <div className="preview-panel">
            {previewUrl && !previewFailed ? (
              <img
                className="preview-img"
                src={previewUrl}
                alt="已选择的持仓截图预览"
                onError={() => setPreviewFailed(true)}
              />
            ) : file ? (
              <div className="selected-file">
                <div className="selected-mark">✓</div>
                <h2>截图已选择</h2>
                <p className="muted">{file.name || "手机相册图片"}</p>
                <p className="file-meta">{formatFileSize(file.size)} · {file.type || "手机相册格式"}</p>
                {previewFailed && <p className="file-note">当前浏览器无法预览这种图片格式，但仍可以继续解析。</p>}
              </div>
            ) : (
              <div className="upload-empty">
                <div className="upload-mark">+</div>
                <h2>选择持仓截图</h2>
                <p className="muted">支持 PNG、JPG、WebP、HEIC，建议使用手机券商 App 的完整持仓页截图。</p>
              </div>
            )}
          </div>

          {file && (
            <button
              type="button"
              className="secondary upload-parse-btn"
              disabled={isParsing}
              onClick={handleParse}
            >
              {isParsing ? "解析中..." : "重新解析"}
            </button>
          )}

          {isParsing && <div className="loading"><span className="spinner" /><span>正在安全上传并解析截图...</span></div>}
        </div>

        <div className="card">
          <div className="card-title">隐私边界</div>
          <div className="privacy-list">
            <div className="privacy-item"><span className="dot" /><span>API Key 和模型地址只读取服务端环境变量，页面源码里没有密钥。</span></div>
            <div className="privacy-item"><span className="dot" /><span>分享卡片在当前浏览器里生成，不上传到服务器。</span></div>
            <div className="privacy-item"><span className="dot" /><span>卡片默认隐藏账号、券商、完整金额，只展示股票、仓位占比和盈亏百分比。</span></div>
          </div>
          <div className="action-row">
            <button className="secondary" type="button" onClick={onDemo}>查看示例</button>
          </div>
        </div>
      </div>
    </section>
  );
}

function formatFileSize(size) {
  if (!Number.isFinite(size)) return "未知大小";
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)}MB`;
  if (size >= 1024) return `${Math.round(size / 1024)}KB`;
  return `${size}B`;
}
