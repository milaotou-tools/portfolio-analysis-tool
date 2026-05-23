import dns from "node:dns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

try {
  dns.setDefaultResultOrder("ipv4first");
} catch {}

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const IRRELEVANT_FIELDS = [
  "icloudNoNotificationsEnabled",
  "icloudNoPushNotificationsEnabled",
  "icloudNoAutoUpdateEnabled",
  "icloudNoBackgroundAppRefreshEnabled",
  "icloudNoDarkModeEnabled",
  "icloudNoThemeType"
];

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
    if (error.endpointHint) body.endpointHint = error.endpointHint;
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
  const apiKey = (process.env.AI_API_KEY || process.env.DASHSCOPE_API_KEY || "").trim();
  const model = process.env.AI_MODEL || DEFAULT_MODEL;
  const apiUrl = (process.env.AI_BASE_URL || BASE_URL).trim();
  const provider = (process.env.AI_PROVIDER || "openai").toLowerCase();

  log("AI_BASE_URL", apiUrl);
  log("AI_MODEL", model);
  log("AI_PROVIDER", provider);

  if (!apiKey) {
    const error = new Error("服务端未配置 AI_API_KEY。请在服务器环境变量中配置 AI_API_KEY 后重新部署。");
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
    "4. 只输出 holdings 和 warnings 两个顶层字段，绝对不要输出其他字段。",
    "",
    "## 绝对禁止输出的字段（一旦出现就算违规）",
    "禁止输出任何与系统设置、通知、主题、自动更新、后台刷新、暗黑模式、iCloud 相关的字段，",
    "包括但不限于：icloudNoNotificationsEnabled, icloudNoPushNotificationsEnabled,",
    "icloudNoAutoUpdateEnabled, icloudNoBackgroundAppRefreshEnabled,",
    "icloudNoDarkModeEnabled, icloudNoThemeType。",
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
    '      "weightPct": 仓位占比百分数（数字，如 12.3。不知道填 null）',
    '      "pnlPct": 盈亏百分比（数字，如 -1.2。不知道填 null）',
    "    }",
    "  ],",
    '  "warnings": ["不确定的字段说明，无则为空数组"]',
    "}",
    "",
    "## 字段说明",
    "- code 只能是证券代码（如 600000、AAPL），绝对不能把市值、金额、占比填进 code。",
    "- 持仓金额填 marketValue，持仓占比填 weightPct，盈亏比例填 pnlPct。",
    "- 如果截图里某字段看不清，填 null 或 \"\"，并在 warnings 中说明。",
    "- 如果某条记录完全无法识别，就不要放入 holdings。",
    "- 不要输出 summary、cost、price 等字段，这些不需要你生成。",
    ""
  ].join("\n");

  try {
    const result = provider === "anthropic"
      ? await callAnthropic(apiUrl, apiKey, model, file.contentType, base64, prompt)
      : await callOpenAICompatible(apiUrl, apiKey, model, file.contentType, base64, prompt);
    return result;
  } catch (error) {
    if (error.statusCode === 422 && error.rawFull) {
      log("首次解析失败，尝试 JSON 修复", error.parseError || "");
      try {
        const repaired = await repairJson(error.rawFull, apiUrl, apiKey, model, provider);
        log("JSON 修复成功", "");
        return repaired;
      } catch (repairError) {
        log("JSON 修复也失败了", repairError.message);
      }
    }
    throw error;
  }
}

async function callOpenAICompatible(apiUrl, apiKey, model, mime, base64, prompt) {
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

  const urls = buildOpenAIEndpointCandidates(apiUrl);
  log("请求 URL 候选", urls.join(" | "));

  const doFetch = async (url) => {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "authorization": `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      signal: AbortSignal.timeout(30000),
      body
    });
    const data = await resp.json().catch(() => ({}));
    return { resp, data };
  };

  let resp, data;
  let lastError;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      for (const url of urls) {
        try {
          const result = await doFetch(url);
          resp = result.resp;
          data = result.data;
          lastError = null;
          log("本次命中 URL", url);
          break;
        } catch (err) {
          lastError = err;
          log(`请求失败 (${url})`, err.message);
        }
      }
      if (!lastError) break;
    } catch (err) {
      lastError = err;
      log(`第${attempt + 1}次请求失败`, err.message);
      if (attempt < 2) {
        const delay = attempt === 0 ? 800 : 1500;
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  if (lastError) {
    log("3次请求均失败", lastError.message);
    const error = new Error("AI 服务连接失败");
    error.statusCode = 502;
    error.detail = lastError.message;
    error.causeDetail = lastError.cause?.message || "";
    error.endpointHint = urls.join(" | ");
    throw error;
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
  let lastError;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await doFetch();
      resp = result.resp;
      data = result.data;
      lastError = null;
      break;
    } catch (err) {
      lastError = err;
      log(`第${attempt + 1}次请求失败 (Anthropic)`, err.message);
      if (attempt < 2) {
        const delay = attempt === 0 ? 800 : 1500;
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  if (lastError) {
    log("3次请求均失败 (Anthropic)", lastError.message);
    const error = new Error("AI 服务连接失败");
    error.statusCode = 502;
    error.detail = lastError.message;
    error.causeDetail = lastError.cause?.message || "";
    throw error;
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

function buildOpenAIEndpointCandidates(url) {
  const normalized = normalizeOpenAIEndpoint(url);
  const parsed = safeUrl(normalized);
  if (!parsed) return [normalized];

  const urls = [normalized];
  const host = parsed.hostname.toLowerCase();

  const regionalHosts = {
    "dashscope.aliyuncs.com": [
      "dashscope-us.aliyuncs.com",
      "dashscope-intl.aliyuncs.com"
    ],
    "dashscope-us.aliyuncs.com": [
      "dashscope.aliyuncs.com",
      "dashscope-intl.aliyuncs.com"
    ],
    "dashscope-intl.aliyuncs.com": [
      "dashscope-us.aliyuncs.com",
      "dashscope.aliyuncs.com"
    ]
  };

  for (const nextHost of regionalHosts[host] || []) {
    const next = new URL(parsed.toString());
    next.hostname = nextHost;
    urls.push(next.toString().replace(/\/$/, ""));
  }

  return [...new Set(urls)];
}

function safeUrl(url) {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function normalizeAnthropicEndpoint(url) {
  const trimmed = String(url || "").replace(/\/+$/, "");
  if (trimmed.endsWith("/messages")) return trimmed;
  if (trimmed.endsWith("/v1")) return `${trimmed}/messages`;
  return `${trimmed}/v1/messages`;
}

async function repairJson(rawContent, apiUrl, apiKey, model, provider) {
  log("修复请求", "开始发送 JSON 修复请求");

  const repairPrompt = "请把下面内容修复为合法 JSON，只保留 holdings 和 warnings 字段，删除任何无关字段，不要补充解释。\n\n" + String(rawContent).slice(0, 8000);

  if (provider === "anthropic") {
    const url = normalizeAnthropicEndpoint(apiUrl);
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
        messages: [{ role: "user", content: repairPrompt }]
      })
    });
    const data = await resp.json().catch(() => ({}));
    log("修复 Anthropic HTTP status", String(resp.status));
    if (!resp.ok) {
      throw new Error(data.error?.message || `修复请求失败 ${resp.status}`);
    }
    const text = Array.isArray(data.content) ? data.content.map(p => p.text || "").join("\n") : "";
    log("修复 content 前500字 (Anthropic)", String(text || "").slice(0, 500));
    return extractJson(text, data.stop_reason || "unknown");
  }

  const url = normalizeOpenAIEndpoint(apiUrl);
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 4096,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: repairPrompt }]
    })
  });
  const data = await resp.json().catch(() => ({}));
  log("修复 OpenAI HTTP status", String(resp.status));
  if (!resp.ok) {
    throw new Error(data.error?.message || `修复请求失败 ${resp.status}`);
  }
  const choice = data.choices?.[0];
  const content = choice?.message?.content || "";
  log("修复 content 前500字 (OpenAI)", String(content || "").slice(0, 500));
  return extractJson(content, choice?.finish_reason || "unknown");
}

function extractJson(text, finishReason) {
  if (!text) {
    const error = new Error("模型返回内容无法解析为完整 JSON");
    error.statusCode = 422;
    error.rawPreview = "(空内容)";
    error.rawTail = "(空)";
    error.rawFull = "(空)";
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
    error.rawFull = raw;
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
    error.rawFull = raw;
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
    error.rawFull = raw;
    error.parseError = parseErr.message || "JSON.parse 失败";
    error.finishReason = finishReason || "unknown";
    throw error;
  }

  log("JSON 解析", "成功");
  return parsed;
}

function stripIrrelevantFields(parsed) {
  if (!parsed || typeof parsed !== "object") return parsed;
  for (const key of Object.keys(parsed)) {
    if (IRRELEVANT_FIELDS.includes(key) || /^icloud/i.test(key)) {
      delete parsed[key];
      log("stripIrrelevantFields", `已删除无关字段: ${key}`);
    }
  }
  return parsed;
}

function sanitizeResult(raw) {
  stripIrrelevantFields(raw);

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
        marketValue: safeNumber(item.marketValue)
      };
    })
    .filter(item => (item.name && item.name !== "未命名") || item.code)
    .slice(0, 50);

  if (validationWarnings.length) {
    log("字段验证 warnings", validationWarnings.join("; "));
  }

  const rawWarnings = Array.isArray(raw && raw.warnings) ? raw.warnings : [];
  const mergedWarnings = [...validationWarnings, ...rawWarnings.map(item => stripText(item, 100)).filter(Boolean)].slice(0, 8);

  return {
    holdings: safeHoldings,
    summary: {
      overview: buildSummaryOverview(safeHoldings),
      totalPositions: safeHoldings.length,
      topHolding: safeHoldings[0]?.name || "",
      estimatedPnlPct: estimatePnl(safeHoldings)
    },
    warnings: mergedWarnings
  };
}

function buildSummaryOverview(holdings) {
  if (!holdings.length) return "未识别到持仓";
  const top = holdings[0];
  const pnl = estimatePnl(holdings);
  const direction = pnl >= 0 ? "盈利" : "回撤";
  return `${top.name} 为第一大持仓，共 ${holdings.length} 个标的，组合估算${direction} ${Math.abs(pnl).toFixed(2)}%。`;
}

function safeNumber(value) {
  if (value === null || value === undefined) return null;
  const num = parseFlexibleNumber(value);
  return Number.isFinite(num) ? num : null;
}

function stripText(value, maxLength) {
  return String(value == null ? "" : value).replace(/[\r\n\t]+/g, " ").trim().slice(0, maxLength);
}

function clampNumber(value, min, max) {
  const num = parseFlexibleNumber(value);
  if (!Number.isFinite(num)) return 0;
  return Math.min(max, Math.max(min, num));
}

function estimatePnl(holdings) {
  const total = holdings.reduce((sum, item) => sum + item.weightPct, 0) || 1;
  return holdings.reduce((sum, item) => sum + item.pnlPct * item.weightPct / total, 0);
}

function parseFlexibleNumber(value) {
  if (value === null || value === undefined || value === "") return NaN;
  if (typeof value === "number") return value;

  const text = String(value).trim();
  if (!text) return NaN;

  const normalized = text
    .replace(/[￥¥$,\s]/g, "")
    .replace(/^\((.*)\)$/, "-$1")
    .replace(/[^\d.-]/g, "");

  const num = Number(normalized);
  return Number.isFinite(num) ? num : NaN;
}
