import { useState } from "react";

const MAX_UPLOAD_FILES = 2;

export default function UploadPanel({
  files = [],
  previewUrls = [],
  isParsing,
  parseStatus,
  onFiles,
  onParse,
  onDemo
}) {
  const [localStatus, setLocalStatus] = useState("");
  const [previewErrors, setPreviewErrors] = useState({});

  function startParse(selectedFiles) {
    if (isParsing) return;
    if (!selectedFiles.length) {
      setLocalStatus("请先选择 1 到 2 张截图。");
      return;
    }

    setLocalStatus(selectedFiles.length > 1 ? "正在上传两张截图并解析..." : "正在上传截图并解析...");
    window.setTimeout(() => {
      onParse(selectedFiles);
    }, 80);
  }

  function handleFileInput(event) {
    const selected = extractFiles(event.currentTarget.files);
    if (!selected.length) {
      setLocalStatus("没有读取到图片，请重新选择截图。");
      return;
    }

    setPreviewErrors({});
    onFiles(selected);
    event.currentTarget.value = "";
    setLocalStatus(selected.length > 1 ? "已选择两张截图，可以开始识别。" : "已选择截图，可以开始识别。");
  }

  function handleDrop(event) {
    event.preventDefault();
    const selected = extractFiles(event.dataTransfer.files);
    if (!selected.length) {
      setLocalStatus("没有读取到图片，请重新选择截图。");
      return;
    }

    setPreviewErrors({});
    onFiles(selected);
    setLocalStatus(selected.length > 1 ? "已选择两张截图，可以开始解析。" : "已选择截图，可以开始解析。");
  }

  function handleParse() {
    startParse(files);
  }

  function blockNativeSubmit(event) {
    event.preventDefault();
    handleParse();
  }

  const visibleStatus = parseStatus || localStatus;
  const fileCount = files.length;
  const buttonLabel = fileCount > 1 ? `上传并解析 ${fileCount} 张图` : "上传并解析";

  return (
    <section className="page active">
      <div className="hero">
        <div className="eyebrow">手机截图 · 私密解析 · 脱敏分享</div>
        <h1>持仓分析仪</h1>
        <p>上传一到两张股票持仓截图，系统会自动识别持仓并生成热力图和仓位占比。截图只用于本次解析，不生成公开链接。</p>
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
                multiple
                onChange={handleFileInput}
              />
              <button className="primary native-submit-btn" type="button" disabled={isParsing} onClick={handleParse}>
                {isParsing ? "解析中..." : buttonLabel}
              </button>
            </form>
            <p className="fallback-note">选中后不会跳转页面，点击按钮后会在当前页面完成识别。</p>
          </div>

          {visibleStatus && <div className="parse-status upload-top-status">{visibleStatus}</div>}

          <div className="preview-panel">
            {fileCount > 0 ? (
              <div className="selected-files-grid">
                {files.map((file, index) => {
                  const previewUrl = previewUrls[index];
                  const failed = Boolean(previewErrors[index]);
                  return (
                    <article className="selected-file selected-file-multi" key={`${file.name}-${file.size}-${index}`}>
                      {previewUrl && !failed ? (
                        <img
                          className="preview-img preview-img-multi"
                          src={previewUrl}
                          alt={`第 ${index + 1} 张已选截图预览`}
                          onError={() => setPreviewErrors(prev => ({ ...prev, [index]: true }))}
                        />
                      ) : (
                        <div className="selected-file-fallback">
                          <div className="selected-mark">✓</div>
                          <h2>第 {index + 1} 张截图</h2>
                          <p className="muted">{file.name || "手机相册图片"}</p>
                          <p className="file-meta">{formatFileSize(file.size)} · {file.type || "手机相册格式"}</p>
                          {failed && <p className="file-note">当前浏览器无法预览这种图片格式，但仍然可以继续解析。</p>}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="upload-empty">
                <div className="upload-mark">+</div>
                <h2>选择持仓截图</h2>
                <p className="muted">支持 PNG、JPG、WebP、HEIC，建议使用手机券商 App 的完整持仓页截图。</p>
              </div>
            )}
          </div>

          {fileCount > 0 && (
            <button
              type="button"
              className="secondary upload-parse-btn"
              disabled={isParsing}
              onClick={handleParse}
            >
              {isParsing ? "解析中..." : "重新解析"}
            </button>
          )}

          {isParsing && (
            <div className="loading">
              <span className="spinner" />
              <span>正在安全上传并解析截图...</span>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-title">隐私边界</div>
          <div className="privacy-list">
            <div className="privacy-item"><span className="dot" /><span>API Key 和模型地址只读取服务器端环境变量，页面源码里没有密钥。</span></div>
            <div className="privacy-item"><span className="dot" /><span>分享卡片在当前浏览器里生成，不上传到服务器。</span></div>
            <div className="privacy-item"><span className="dot" /><span>卡片默认隐藏账号、券商、完整金额，只显示股票、仓位占比和盈亏百分比。</span></div>
          </div>
          <div className="action-row">
            <button className="secondary" type="button" onClick={onDemo}>查看示例</button>
          </div>
        </div>
      </div>
    </section>
  );
}

function extractFiles(list) {
  return Array.from(list || [])
    .filter(Boolean)
    .slice(0, MAX_UPLOAD_FILES);
}

function formatFileSize(size) {
  if (!Number.isFinite(size)) return "未知大小";
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)}MB`;
  if (size >= 1024) return `${Math.round(size / 1024)}KB`;
  return `${size}B`;
}
