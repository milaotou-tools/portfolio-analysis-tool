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
    if (error.rawTail) body.rawTail = error.rawTail;
    if (error.parseError) body.parseError = error.parseError;
    if (error.finishReason) body.finishReason = error.finishReason;
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
    "",
    "## 输出规则（必须严格遵守）",
    "1. 只输出一行合法的 JSON，不要输出任何解释、问候语、Markdown、``` 或注释。",
    "2. 不要用 ```json 包裹，只输出裸 JSON。",
    "3. 不确定的字段填 null 或空字符串 \"\"，不要编造。",
    "",
    "## JSON 结构（固定）",
    "{",
    '  "holdings": [',
    "    {",
    '      "name": "证券名称",',
    '      "code": "证券代码，如 600000、AAPL。绝对不能填金额、市值。识别不到则填 \"\"",',
    '      "market": "A股 | 港股 | 美股 | 其他",',
    '      "assetClass": "股票 | ETF | 黄金 | 商品 | 现金 | 债券 | 其他",',
    '      "sector": "贵金属 | 石油 | 宽指 | 科技 | 金融 | 消费 | 其他",',
    '      "marketValue": 持仓市值（数字，单位元或美元，不要带千分位逗号。不知道填 null）',
    '      "cost": 成本价（数字。不知道填 null）',
    '      "price": 现价（数字。不知道填 null）',
    '      "weightPct": 仓位占比百分数（数字，如 12.3。不知道填 null）',
    '      "pnlPct": 盈亏百分比（数字，如 -1.2。不知道填 null）',
    "    }",
    "  ],",
    '  "summary": {',
    '    "overview": "一句话概述组合特征",',
    '    "totalPositions": 持仓数量,',
    '    "topHolding": "第一大持仓名称",',
    '    "estimatedPnlPct": 组合估算盈亏百分比或 null',
    "  },",
    '  "warnings": ["不确定的字段说明，无则为空数组"]',
    "}",
    "",
    "## 字段说明",
    "- code 只能是证券代码（如 600000、AAPL），绝对不能把市值、金额、占比填进 code。",
    "- 持仓金额填 marketValue，持仓占比填 weightPct，盈亏比例填 pnlPct。",
    "- 如果截图里某字段看不清，填 null 或 \"\"，并在 warnings 中说明。",
    "- 如果某条记录完全无法识别，就不要放入 holdings。",
    ""
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
    temperature: 0,
    max_tokens: 4096,
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

  const choice = data.choices && data.choices[0];
  const content = choice && choice.message && choice.message.content;
  const finishReason = (choice && choice.finish_reason) || "unknown";

  log("content length", String((content || "").length));
  log("finish_reason", finishReason);
  log("模型 content 前500字", String(content || "").slice(0, 500));
  log("模型 content 后500字", String(content || "").slice(-500));

  return extractJson(content, finishReason);
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
        max_tokens: 4096,
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
  const finishReason = data.stop_reason || "unknown";
  log("content length (Anthropic)", String((text || "").length));
  log("finish_reason (Anthropic)", finishReason);
  log("模型 content 前500字 (Anthropic)", String(text || "").slice(0, 500));
  log("模型 content 后500字 (Anthropic)", String(text || "").slice(-500));
  return extractJson(text, finishReason);
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

function extractJson(text, finishReason) {
  if (!text) {
    const error = new Error("模型返回内容无法解析为完整 JSON");
    error.statusCode = 422;
    error.rawPreview = "(空内容)";
    error.rawTail = "(空)";
    error.parseError = "content 为空";
    error.finishReason = finishReason || "unknown";
    throw error;
  }

  const raw = String(text).trim();
  let cleaned = raw;

  // 移除 markdown 代码块包裹：```json ... ``` 或 ``` ... ```
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    cleaned = fenced[1].trim();
    log("JSON 提取", "从 markdown 代码块中提取");
  }

  // 找到第一个 {
  const start = cleaned.indexOf("{");
  if (start < 0) {
    const error = new Error("模型返回内容无法解析为完整 JSON");
    error.statusCode = 422;
    error.rawPreview = raw.slice(0, 500);
    error.rawTail = raw.slice(-500);
    error.parseError = "内容中没有找到 {";
    error.finishReason = finishReason || "unknown";
    throw error;
  }

  // 从 start 开始，匹配完整的 JSON 对象（跳过字符串内的括号）
  let depth = 0;
  let inString = false;
  let escape = false;
  let end = -1;

  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (ch === "\\" && inString) {
      escape = true;
      continue;
    }

    if (ch === '"' && !escape) {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }

  if (end < 0) {
    const truncated = finishReason === "length" || finishReason === "max_tokens";
    const error = new Error(truncated
      ? "模型输出可能被截断，JSON 不完整"
      : "模型返回内容无法解析为完整 JSON");
    error.statusCode = 422;
    error.rawPreview = raw.slice(0, 500);
    error.rawTail = raw.slice(-500);
    error.parseError = truncated
      ? `finish_reason=${finishReason}，JSON 括号未闭合（开 ${depth} 层）`
      : `JSON 括号未闭合（开 ${depth} 层）`;
    error.finishReason = finishReason || "unknown";
    throw error;
  }

  const jsonStr = cleaned.slice(start, end + 1);
  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (parseErr) {
    const truncated = finishReason === "length" || finishReason === "max_tokens";
    const probablyTruncated = parseErr.message && parseErr.message.includes("end of");
    const error = new Error(truncated || probablyTruncated
      ? "模型输出可能被截断，JSON 不完整"
      : "模型返回内容无法解析为完整 JSON");
    error.statusCode = 422;
    error.rawPreview = raw.slice(0, 500);
    error.rawTail = raw.slice(-500);
    error.parseError = parseErr.message || "JSON.parse 失败";
    error.finishReason = finishReason || "unknown";
    throw error;
  }

  log("JSON 解析", "成功");
  return parsed;
}

function sanitizeResult(raw) {
  const holdings = Array.isArray(raw && raw.holdings) ? raw.holdings : [];
  const validationWarnings = [];
  const safeHoldings = holdings
    .map((item, index) => {
      const rawCode = String(item.code || item.symbol || "");
      const validCode = stripText(rawCode, 20);
      // 检测 code 字段是否被误填为金额
      if (/^\d{1,3}(,\d{3})*(\.\d+)?$/.test(rawCode) && parseFloat(rawCode.replace(/,/g, "")) > 100) {
        validationWarnings.push(`第${index + 1}个持仓的 code 字段"${rawCode}"疑似为金额而非证券代码`);
      }
      return {
        name: stripText(item.name || item.stockName || item.securityName || "未命名", 40),
        code: validCode,
        market: stripText(item.market || "", 12),
        assetClass: stripText(item.assetClass || "", 12),
        sector: stripText(item.sector || item.market || "其他", 20),
        weightPct: clampNumber(item.weightPct ?? item.pct ?? item.weight_pct ?? item.positionPct, 0, 100),
        pnlPct: clampNumber(item.pnlPct ?? item.change ?? item.pnl_pct ?? item.profitPct, -1000, 1000),
        marketValue: safeNumber(item.marketValue),
        cost: safeNumber(item.cost),
        price: safeNumber(item.price)
      };
    })
    .filter(item => (item.name && item.name !== "未命名") || item.code)
    .slice(0, 50);

  const summary = raw && raw.summary && typeof raw.summary === "object" ? raw.summary : {};
  const estimatedPnl = Number(summary.estimatedPnlPct);

  if (validationWarnings.length) {
    log("字段验证 warnings", validationWarnings.join("; "));
  }

  const rawWarnings = Array.isArray(raw && raw.warnings) ? raw.warnings : [];
  const mergedWarnings = [...validationWarnings, ...rawWarnings.map(item => stripText(item, 100)).filter(Boolean)].slice(0, 8);

  return {
    holdings: safeHoldings,
    summary: {
      overview: stripText(summary.overview || "", 160),
      totalPositions: Number(summary.totalPositions) || safeHoldings.length,
      topHolding: stripText(summary.topHolding || (safeHoldings[0] && safeHoldings[0].name) || "", 40),
      estimatedPnlPct: Number.isFinite(estimatedPnl) ? estimatedPnl : estimatePnl(safeHoldings)
    },
    warnings: mergedWarnings
  };
}

function safeNumber(value) {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
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
