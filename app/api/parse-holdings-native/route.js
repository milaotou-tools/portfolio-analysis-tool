export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request) {
  try {
    const formData = await request.formData();
    const resp = await fetch(new URL("/api/parse-holdings", request.url), {
      method: "POST",
      body: formData
    });
    const data = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      return htmlBridge({
        ok: false,
        error: data.error || `解析失败 (${resp.status})`
      });
    }

    return htmlBridge({ ok: true, data });
  } catch (error) {
    return htmlBridge({
      ok: false,
      error: error && error.message ? error.message : "解析失败，请稍后再试。"
    });
  }
}

function htmlBridge(payload) {
  const json = JSON.stringify(payload).replace(/</g, "\\u003c");
  const fallbackText = payload.ok ? "解析完成，正在准备持仓视图。" : payload.error;
  const cookieValue = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const nativeStatus = payload.ok ? "ok" : "error";
  const returnUrl = `/?nativeStatus=${nativeStatus}`;

  return new Response(`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>正在返回持仓分析仪</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: #0b0f14;
      color: #edf2f7;
      font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
    }
    main {
      width: min(100% - 32px, 420px);
      border: 1px solid #26313d;
      border-radius: 8px;
      background: #111821;
      padding: 18px;
      line-height: 1.7;
      box-shadow: 0 14px 34px rgba(0, 0, 0, .28);
    }
    .status {
      display: inline-flex;
      margin-bottom: 12px;
      padding: 4px 10px;
      border-radius: 999px;
      background: ${payload.ok ? "rgba(21,164,106,.16)" : "rgba(231,82,79,.16)"};
      color: ${payload.ok ? "#5ce1a6" : "#ff8b87"};
      font-size: 13px;
      font-weight: 800;
    }
    p {
      color: #9aa7b5;
      margin: 10px 0 0;
    }
    a {
      display: block;
      margin-top: 14px;
      min-height: 44px;
      border-radius: 6px;
      background: #2f80ed;
      color: #fff;
      text-align: center;
      line-height: 44px;
      text-decoration: none;
      font-weight: 800;
    }
  </style>
</head>
<body>
  <main>
    <div class="status">${payload.ok ? "解析成功" : "解析失败"}</div>
    <strong>${escapeHtml(fallbackText)}</strong>
    <p>${payload.ok ? "点击下方按钮查看热力图和仓位占比。" : "请返回后换一张更清晰的截图，或稍后再试。"}</p>
    <a href="${returnUrl}">${payload.ok ? "查看持仓结果" : "返回重新上传"}</a>
  </main>
  <script>
    (function () {
      var payload = ${json};
      try { sessionStorage.setItem("holdingNativeUploadResult", JSON.stringify(payload)); } catch (err) {}
      try { localStorage.setItem("holdingNativeUploadResult", JSON.stringify(payload)); } catch (err) {}
    }());
  </script>
</body>
</html>`, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "set-cookie": `holdingNativeUploadResult=${cookieValue}; Path=/; Max-Age=300; SameSite=Lax`
    }
  });
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
