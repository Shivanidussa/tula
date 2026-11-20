import { extractIngredients } from "./labelText";

const MAX_SIDE = 1800; // phone photos are huge; shrinking makes reading faster and often better
const MIN_SIDE = 1600; // small pictures are enlarged so tiny letters become readable
const OCR_TIMEOUT_MS = 90000;

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("OCR_TIMEOUT")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function loadBitmap(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return await createImageBitmap(file); // older browsers
  }
}

// Shrink, convert to grey and stretch the contrast so printed text stands out
async function prepareImage(file) {
  const bitmap = await loadBitmap(file);
  const longSide = Math.max(bitmap.width, bitmap.height);
  const scale = longSide > MAX_SIDE ? MAX_SIDE / longSide : Math.min(3, MIN_SIDE / longSide);
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);
  if (bitmap.close) bitmap.close();

  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const hist = new Array(256).fill(0);
  for (let i = 0; i < d.length; i += 4) {
    const g = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    d[i] = d[i + 1] = d[i + 2] = g;
    hist[g] += 1;
  }

  // Ignore the darkest and brightest 2 percent, then stretch what is left
  const total = w * h;
  let low = 0, high = 255, acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= total * 0.02) { low = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= total * 0.02) { high = v; break; } }
  const range = Math.max(1, high - low);
  for (let i = 0; i < d.length; i += 4) {
    const s = Math.max(0, Math.min(255, Math.round(((d[i] - low) * 255) / range)));
    d[i] = d[i + 1] = d[i + 2] = s;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// Returns { ingredients, foundKeyword, confidence }. Throws on failure.
export async function readLabel(file, onProgress = () => {}) {
  onProgress(5, "Preparing photo…");
  const canvas = await prepareImage(file);

  onProgress(12, "Loading the reader (the first time takes a little longer)…");
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, {
    logger: (m) => {
      if (m.status === "recognizing text") {
        onProgress(35 + Math.round((m.progress || 0) * 60), "Reading the label…");
      }
    },
  });

  try {
    const { data } = await withTimeout(worker.recognize(canvas), OCR_TIMEOUT_MS);
    onProgress(100, "Done");
    const { ingredients, foundKeyword } = extractIngredients(data.text || "");
    return { ingredients, foundKeyword, confidence: Number(data.confidence) || 0 };
  } finally {
    try { await worker.terminate(); } catch { /* already closed */ }
  }
}