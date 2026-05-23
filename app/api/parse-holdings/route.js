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
    return json(sanitizeResult(parsed), 200);
  } catch (error) {
    const message = error && error.message ? error.message : "解析失败，请稍后再试。";
    return json({ error: message }, error.statusCode || 500);
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

async function callVisionModel(file) {
  const apiKey = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL || "qwen-plus";
  const apiUrl = process.env.AI_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1";
  const provider = (process.env.AI_PROVIDER || "openai").toLowerCase();

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
  const resp = await fetch(normalizeOpenAIEndpoint(apiUrl), {
    method: "POST",
    headers: {
      "authorization": `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages: [{
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: `data:${mime};base64,${base64}` } }
        ]
      }]
    })
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const error = new Error(data.error && data.error.message ? data.error.message : `AI 接口返回 ${resp.status}`);
    error.statusCode = 502;
    throw error;
  }
  return parseJsonText(data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content);
}

async function callAnthropic(apiUrl, apiKey, model, mime, base64, prompt) {
  const resp = await fetch(normalizeAnthropicEndpoint(apiUrl), {
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
  if (!resp.ok) {
    const error = new Error(data.error && data.error.message ? data.error.message : `AI 接口返回 ${resp.status}`);
    error.statusCode = 502;
    throw error;
  }
  const text = Array.isArray(data.content) ? data.content.map(part => part.text || "").join("\n") : "";
  return parseJsonText(text);
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

function parseJsonText(text) {
  if (!text) throw new Error("AI 没有返回可解析内容。");
  const cleaned = String(text).replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("AI 返回内容不是 JSON。");
  return JSON.parse(cleaned.slice(start, end + 1));
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
