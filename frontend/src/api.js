// All calls to the Tula backend live here.
// Every function ALWAYS returns { ok, status, data, networkError } and never throws.

// Empty in development (Vite forwards /api to the backend).
// In production it is the Render URL, set as VITE_API_URL on Vercel.
const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");

// The free server sleeps when unused, so the first request can take up to a minute.
const TIMEOUT_MS = 65000;

async function request(path, options = {}, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}${path}`, { ...options, signal: controller.signal });
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* response was not JSON */
    }
    return { ok: res.ok, status: res.status, data, networkError: null };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      data: null,
      networkError: err && err.name === "AbortError" ? "timeout" : "network",
    };
  } finally {
    clearTimeout(timer);
  }
}

// Called once when the app opens, so a sleeping server starts waking up early
export function wakeServer() {
  request("/api/health", {}, 65000);
}

export function lookupBarcode(barcode) {
  return request(`/api/product/${encodeURIComponent(barcode)}`);
}

export function scoreIngredients(ingredients, nutriments) {
  return request("/api/score", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ingredients, nutriments }),
  });
}