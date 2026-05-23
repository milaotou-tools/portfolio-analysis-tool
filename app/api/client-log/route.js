export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const payload = await request.json().catch(() => ({}));
    const safePayload = {
      event: safeText(payload.event, 80),
      detail: sanitizeDetail(payload.detail),
      path: safeText(payload.path, 120),
      at: new Date().toISOString()
    };

    console.log("[client-log]", JSON.stringify(safePayload));
    return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.log("[client-log-error]", error && error.message ? error.message : error);
    return Response.json({ ok: false }, { status: 200, headers: { "cache-control": "no-store" } });
  }
}

function sanitizeDetail(detail) {
  if (!detail || typeof detail !== "object") return {};
  return {
    message: safeText(detail.message, 180),
    fileName: safeText(detail.fileName, 120),
    fileType: safeText(detail.fileType, 80),
    fileSize: Number.isFinite(Number(detail.fileSize)) ? Number(detail.fileSize) : undefined,
    status: safeText(detail.status, 40),
    ok: typeof detail.ok === "boolean" ? detail.ok : undefined
  };
}

function safeText(value, maxLength) {
  return String(value == null ? "" : value).replace(/[\r\n\t]+/g, " ").slice(0, maxLength);
}
