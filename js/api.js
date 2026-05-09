export async function apiJson(path, opts = {}) {
  let res;
  try {
    res = await fetch(path, {
      headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
      ...opts,
    });
  } catch {
    // Network error (offline, server down)
    const err = new Error("Сервер холбогдохгүй байна. Интернэт холболтоо шалгана уу.");
    err.status = 0;
    throw err;
  }

  const isJson = (res.headers.get("content-type") || "").includes("application/json");
  const data   = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    const msg = (typeof data === "object" && data?.error?.message) || `Алдаа (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.data   = data;
    throw err;
  }

  return data;
}
