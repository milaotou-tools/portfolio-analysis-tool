export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("screenshot");

    if (!file || typeof file === "string") {
      return json({ error: "没有找到 screenshot 图片字段。" }, 400);
    }
    const contentType = normalizeImageContentType(file);
    if (!contentType) {
      return json({ error: "请上传 PNG、JPG、WebP 或 HEIC 图片。" }, 415);
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return json({ error: "图片太大了，请压缩到 10MB 以内。" }, 413);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await callVisionModel({ buffer, contentType });
    const result = sanitizeResult(parsed);
    log("sanitizeResult 顶层字段", Object.keys(result).join(", "));
    log("holdings 数量", String(result.holdings.length));
    return json(result, 200);
  } catch (error) {
    log("最终错误", error.message);
    const status = error.statusCode || 500;
    const body = { error: error.message || "解析失败，请稍后再试。" };
    if (error.rawPreview) body.rawPreview = error.rawPreview;
    if (error.detail) body.detail = error.detail;
    if (error.causeDetail) body.cause = error.causeDetail;
    return json(body, status);
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "cache-control": "no-store"
    }
  });
}

function json(payload, status) {
  return Response.json(payload, {
    status,
    headers: {
      "cache-control": "no-store"
    }
  });
}

function normalizeImageContentType(file) {
  if (file.type && file.type.startsWith("image/")) return file.type;

  const name = String(file.name || "").toLowerCase();
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".heic")) return "image/heic";
  if (name.endsWith(".heif")) return "image/heif";
  if (!file.type || file.type === "application/octet-stream") return "image/jpeg";
  return "";
}

const BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const DEFAULT_MODEL = "qwen-plus";

function log(label, value) {
  const line = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  console.error(`[parse-holdings] ${label}: ${line}`);
}

async function callVisionModel(file) {
  const apiKey = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL || DEFAULT_MODEL;
  const apiUrl = process.env.AI_BASE_URL || BASE_URL;
  const provider = (process.env.AI_PROVIDER || "openai").toLowerCase();

  log("AI_BASE_URL", apiUrl);
  log("AI_MODEL", model);
  log("AI_PROVIDER", provider);

  if (!apiKey) {
    const error = new Error("服务端未配置 AI_API_KEY。请在 Vercel 环境变量中配置后重新部署。");
    error.statusCode = 500;
    throw error;
  }

  const base64 = file.buffer.toString("base64");
  const prompt = [
    "你是一个股票持仓截图 OCR 和结构化解析器。",
    "只从截图中提取可见持仓信息，不要编造金额、账号或券商。",
    "返回严格 JSON 对象，格式为：",
    '{"holdings":[{"name":"股票名称","code":"代码","weightPct":12.3,"pnlPct":-1.2,"sector":"行业或市场"}],"summary":{"overview":"一句中文概览","totalPositions":3,"topHolding":"名称","estimatedPnlPct":0.3},"warnings":["无法确认的信息"]}',
    "weightPct 是仓位占比百分数；pnlPct 是盈亏或当日涨跌百分数。如果截图没有明确字段，用 0 并在 warnings 中说明。",
    "不要返回账号、手机号、券商名称、完整金额、原始截图内容或 Markdown。"
  ].join("\n");

  if (provider === "anthropic") {
    return callAnthropic(apiUrl, apiKey, model, file.contentType, base64, prompt);
  }
  return callOpenAICompatible(apiUrl, apiKey, model, file.contentType, base64, prompt);
}

async function callOpenAICompatible(apiUrl, apiKey, model, mime, base64, prompt) {
  const url = normalizeOpenAIEndpoint(apiUrl);
  log("请求 URL", url);

  const body = JSON.stringify({
    model,
    response_format: { type: "json_object" },
    messages: [{
      role: "user",
      content: [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: `data:${mime};base64,${base64}` } }
      ]
    }]
  });

  const doFetch = async () => {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "authorization": `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body
    });
    const data = await resp.json().catch(() => ({}));
    return { resp, data };
  };

  let resp, data;
  try {
    const result = await doFetch();
    resp = result.resp;
    data = result.data;
  } catch (firstError) {
    log("首次请求失败", firstError.message);
    log("首次请求 cause", firstError.cause?.message || "(none)");
    await new Promise(r => setTimeout(r, 800));
    try {
      const result = await doFetch();
      resp = result.resp;
      data = result.data;
      log("重试成功", `status=${resp.status}`);
    } catch (secondError) {
      log("重试仍失败", secondError.message);
      const error = new Error("AI 服务连接失败");
      error.statusCode = 502;
      error.detail = secondError.message;
      error.causeDetail = secondError.cause?.message || "";
      throw error;
    }
  }

  log("DashScope HTTP status", String(resp.status));
  log("DashScope 返回体前500字", JSON.stringify(data).slice(0, 500));

  if (!resp.ok) {
    const message = data.error && data.error.message ? data.error.message : `AI 接口返回 ${resp.status}`;
    log("DashScope 错误", message);
    const error = new Error(message);
    error.statusCode = 502;
    throw error;
  }

  const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  log("模型 content 前500字", String(content || "").slice(0, 500));

  return extractJson(content);
}

async function callAnthropic(apiUrl, apiKey, model, mime, base64, prompt) {
  const url = normalizeAnthropicEndpoint(apiUrl);
  log("请求 URL (Anthropic)", url);

  const doFetch = async () => {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": process.env.ANTHROPIC_VERSION || "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mime, data: base64 } },
            { type: "text", text: prompt }
          ]
        }]
      })
    });
    const data = await resp.json().catch(() => ({}));
    return { resp, data };
  };

  let resp, data;
  try {
    const result = await doFetch();
    resp = result.resp;
    data = result.data;
  } catch (firstError) {
    log("首次请求失败 (Anthropic)", firstError.message);
    await new Promise(r => setTimeout(r, 800));
    try {
      const result = await doFetch();
      resp = result.resp;
      data = result.data;
    } catch (secondError) {
      log("重试仍失败 (Anthropic)", secondError.message);
      const error = new Error("AI 服务连接失败");
      error.statusCode = 502;
      error.detail = secondError.message;
      error.causeDetail = secondError.cause?.message || "";
      throw error;
    }
  }

  log("Anthropic HTTP status", String(resp.status));
  log("Anthropic 返回体前500字", JSON.stringify(data).slice(0, 500));

  if (!resp.ok) {
    const message = data.error && data.error.message ? data.error.message : `AI 接口返回 ${resp.status}`;
    const error = new Error(message);
    error.statusCode = 502;
    throw error;
  }
  const text = Array.isArray(data.content) ? data.content.map(part => part.text || "").join("\n") : "";
  log("模型 content 前500字 (Anthropic)", String(text || "").slice(0, 500));
  return extractJson(text);
}

function normalizeOpenAIEndpoint(url) {
  const trimmed = String(url || "").replace(/\/+$/, "");
  if (trimmed.endsWith("/chat/completions")) return trimmed;
  if (trimmed.endsWith("/v1")) return `${trimmed}/chat/completions`;
  return `${trimmed}/v1/chat/completions`;
}

function normalizeAnthropicEndpoint(url) {
  const trimmed = String(url || "").replace(/\/+$/, "");
  if (trimmed.endsWith("/messages")) return trimmed;
  if (trimmed.endsWith("/v1")) return `${trimmed}/messages`;
  return `${trimmed}/v1/messages`;
}

function extractJson(text) {
  if (!text) {
    const error = new Error("模型返回内容无法解析为持仓数据");
    error.statusCode = 422;
    error.rawPreview = "(空内容)";
    throw error;
  }

  const raw = String(text).trim();
  let cleaned = raw;

  // 移除 markdown 代码块包裹：```json ... ``` 或 ``` ... ```
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    cleaned = fenced[1].trim();
  }

  // 找到第一个 { 和对应的 }
  const start = cleaned.indexOf("{");
  if (start < 0) {
    const error = new Error("模型返回内容无法解析为持仓数据");
    error.statusCode = 422;
    error.rawPreview = raw.slice(0, 500);
    throw error;
  }

  // 从 start 开始，匹配完整的 JSON 对象
  let depth = 0;
  let end = -1;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }

  if (end < 0) {
    const error = new Error("模型返回内容无法解析为持仓数据");
    error.statusCode = 422;
    error.rawPreview = raw.slice(0, 500);
    throw error;
  }

  let parsed;
  try {
    parsed = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    const error = new Error("模型返回内容无法解析为持仓数据");
    error.statusCode = 422;
    error.rawPreview = raw.slice(0, 500);
    throw error;
  }

  return parsed;
}

function sanitizeResult(raw) {
  const holdings = Array.isArray(raw && raw.holdings) ? raw.holdings : [];
  const safeHoldings = holdings
    .map(item => ({
      name: stripText(item.name || item.stockName || item.securityName || "未命名", 40),
      code: stripText(item.code || item.symbol || "", 20),
      weightPct: clampNumber(item.weightPct ?? item.pct ?? item.weight_pct ?? item.positionPct, 0, 100),
      pnlPct: clampNumber(item.pnlPct ?? item.change ?? item.pnl_pct ?? item.profitPct, -1000, 1000),
      sector: stripText(item.sector || item.market || "其他", 20)
    }))
    .filter(item => (item.name && item.name !== "未命名") || item.code)
    .slice(0, 50);

  const summary = raw && raw.summary && typeof raw.summary === "object" ? raw.summary : {};
  const estimatedPnl = Number(summary.estimatedPnlPct);

  return {
    holdings: safeHoldings,
    summary: {
      overview: stripText(summary.overview || "", 160),
      totalPositions: Number(summary.totalPositions) || safeHoldings.length,
      topHolding: stripText(summary.topHolding || (safeHoldings[0] && safeHoldings[0].name) || "", 40),
      estimatedPnlPct: Number.isFinite(estimatedPnl) ? estimatedPnl : estimatePnl(safeHoldings)
    },
    warnings: Array.isArray(raw && raw.warnings) ? raw.warnings.map(item => stripText(item, 100)).filter(Boolean).slice(0, 8) : []
  };
}

function stripText(value, maxLength) {
  return String(value == null ? "" : value).replace(/[\r\n\t]+/g, " ").trim().slice(0, maxLength);
}

function clampNumber(value, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.min(max, Math.max(min, num));
}

function estimatePnl(holdings) {
  const total = holdings.reduce((sum, item) => sum + item.weightPct, 0) || 1;
  return holdings.reduce((sum, item) => sum + item.pnlPct * item.weightPct / total, 0);
}
