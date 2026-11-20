import { useEffect, useRef, useState } from "react";
import { createConfirmer, isValidGtin } from "../gtin";

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"];
const REQUIRED_READS = 3; // the same number must be read 3 times...
const WINDOW_MS = 2500; // ...within 2.5 seconds

function friendlyError(err) {
  const text = String(err && (err.name || "") + " " + (err && err.message ? err.message : err)).toLowerCase();
  if (text.includes("notallowed") || text.includes("permission")) {
    return "Camera permission was blocked. Allow camera access in your browser settings, or type the barcode instead.";
  }
  if (text.includes("notfound") || text.includes("devicesnotfound") || text.includes("requested device")) {
    return "No camera was found on this device. You can type the barcode number instead.";
  }
  if (text.includes("notreadable") || text.includes("trackstart")) {
    return "The camera is being used by another app. Close it and try again, or type the barcode instead.";
  }
  if (text.includes("secure") || text.includes("https")) {
    return "The camera needs a secure (HTTPS) page. It works on localhost and on the deployed site.";
  }
  return "Could not start the camera. You can type the barcode number instead.";
}

// Use the phone's built-in detector when it has one (Chrome on Android),
// otherwise the ZXing engine, which we serve ourselves so it never depends on a CDN.
async function createDetector() {
  if ("BarcodeDetector" in window) {
    try {
      const supported = await window.BarcodeDetector.getSupportedFormats();
      const usable = FORMATS.filter((f) => supported.includes(f));
      if (usable.length) return new window.BarcodeDetector({ formats: usable });
    } catch {
      /* fall through to ZXing */
    }
  }
  const { BarcodeDetector, prepareZXingModule } = await import("barcode-detector/ponyfill");
  const wasmUrl = (await import("zxing-wasm/reader/zxing_reader.wasm?url")).default;
  prepareZXingModule({
    overrides: { locateFile: (path, prefix) => (path.endsWith(".wasm") ? wasmUrl : prefix + path) },
    fireImmediately: false,
  });
  return new BarcodeDetector({ formats: FORMATS });
}

export default function Scanner({ onDetected, onFail, onCancel }) {
  const videoRef = useRef(null);
  const trackRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [candidate, setCandidate] = useState(0); // how many times the current number has been read
  const [zoomCaps, setZoomCaps] = useState(null); // { min, max, step } when the camera can zoom
  const [zoom, setZoom] = useState(1);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [waited, setWaited] = useState(0); // seconds spent scanning

  useEffect(() => {
    let cancelled = false;
    let stream = null;
    let frame = 0;
    let busy = false;
    let done = false;
    const confirmer = createConfirmer(REQUIRED_READS, WINDOW_MS);

    const stopCamera = () => {
      cancelAnimationFrame(frame);
      if (stream) stream.getTracks().forEach((t) => t.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
    };

    async function start() {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("secure https");

        // High resolution matters most: a barcode at arm's length is only a few pixels wide at 640x480
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30 },
          },
        });
        if (cancelled) return stopCamera();

        const track = stream.getVideoTracks()[0];
        trackRef.current = track;
        const caps = track.getCapabilities ? track.getCapabilities() : {};

        // Keep the picture sharp while the phone moves
        if (caps.focusMode && caps.focusMode.includes("continuous")) {
          await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] }).catch(() => {});
        }
        if (caps.zoom) {
          setZoomCaps({ min: caps.zoom.min, max: Math.min(caps.zoom.max, 5), step: caps.zoom.step || 0.1 });
          setZoom(caps.zoom.min);
        }
        if (caps.torch) setTorchSupported(true);

        const video = videoRef.current;
        video.srcObject = stream;
        await video.play();

        const detector = await createDetector();
        if (cancelled) return stopCamera();
        setReady(true);

        const tick = async () => {
          if (cancelled || done) return;
          if (!busy && video.readyState >= 2) {
            busy = true;
            try {
              const results = await detector.detect(video);
              const now = performance.now();
              let best = 0;
              for (const r of results) {
                const code = String(r.rawValue || "").trim();
                if (!isValidGtin(code)) continue; // ignore misreads that fail the check digit
                const { count, confirmed } = confirmer.add(code, now);
                best = Math.max(best, count);
                if (confirmed && !done) {
                  done = true;
                  if (navigator.vibrate) navigator.vibrate(60);
                  stopCamera();
                  onDetected(code);
                  return;
                }
              }
              setCandidate(best);
            } catch {
              /* a frame that cannot be read is simply skipped */
            } finally {
              busy = false;
            }
          }
          frame = requestAnimationFrame(tick);
        };
        tick();
      } catch (err) {
        stopCamera();
        if (!cancelled) onFail(friendlyError(err));
      }
    }

    start();
    const timer = setInterval(() => setWaited((s) => s + 1), 1000);

    return () => {
      cancelled = true;
      clearInterval(timer);
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function changeZoom(value) {
    setZoom(value);
    const track = trackRef.current;
    if (track) track.applyConstraints({ advanced: [{ zoom: value }] }).catch(() => {});
  }

  function toggleTorch() {
    const track = trackRef.current;
    const next = !torchOn;
    setTorchOn(next);
    if (track) track.applyConstraints({ advanced: [{ torch: next }] }).catch(() => setTorchOn(false));
  }

  // Tap the picture to focus again
  function refocus() {
    const track = trackRef.current;
    if (!track || !track.getCapabilities) return;
    const caps = track.getCapabilities();
    if (caps.focusMode && caps.focusMode.includes("single-shot")) {
      track
        .applyConstraints({ advanced: [{ focusMode: "single-shot" }] })
        .then(() => setTimeout(() => track.applyConstraints({ advanced: [{ focusMode: "continuous" }] }).catch(() => {}), 1200))
        .catch(() => {});
    }
  }

  return (
    <section className="card scanner-card">
      <h2>Point the camera at the barcode</h2>
      <p className="muted small">Hold the pack 15 to 20 cm away. Wait a moment until the picture is sharp, then keep still.</p>

      <div className="scanner-frame" onClick={refocus}>
        <video ref={videoRef} playsInline muted autoPlay />
        <div className="scan-guide" aria-hidden="true" />
        {!ready && <div className="scanner-loading">Starting camera…</div>}
        {ready && candidate > 0 && <div className="scan-badge">Confirming… {candidate}/{REQUIRED_READS}</div>}
      </div>

      {(zoomCaps || torchSupported) && (
        <div className="scan-controls">
          {zoomCaps && (
            <label className="zoom">
              <span>Zoom {zoom.toFixed(1)}×</span>
              <input
                type="range"
                min={zoomCaps.min}
                max={zoomCaps.max}
                step={zoomCaps.step}
                value={zoom}
                onChange={(e) => changeZoom(Number(e.target.value))}
              />
            </label>
          )}
          {torchSupported && (
            <button className="btn btn-secondary" onClick={toggleTorch}>{torchOn ? "💡 Light on" : "💡 Light"}</button>
          )}
        </div>
      )}

      {ready && waited >= 10 && (
        <p className="notice notice-info">
          Still looking. Barcode small or blurry? Move the phone back a little and use the zoom slider. Tilt the pack to avoid glare, or turn on the light.
        </p>
      )}

      <button className="btn btn-ghost" onClick={onCancel}>
        {waited >= 20 ? "Type the number instead" : "Cancel"}
      </button>
    </section>
  );
}