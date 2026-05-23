export function clientLog(event, detail = {}) {
  if (typeof window === "undefined") return;

  fetch("/api/client-log", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      event,
      detail,
      path: window.location.pathname
    }),
    keepalive: true
  }).catch(() => {});
}

export function fileLogDetail(file, extra = {}) {
  return {
    ...extra,
    fileName: file && file.name,
    fileType: file && file.type,
    fileSize: file && file.size
  };
}
