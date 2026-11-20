import { useEffect, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";

const ELEMENT_ID = "Tula-scanner";

function friendlyError(err) {
  const text = String(err && (err.message || err)).toLowerCase();
  if (text.includes("permission") || text.includes("notallowed")) {
    return "Camera permission was blocked. Allow camera access in your browser, or type the barcode instead.";
  }
  if (text.includes("notfound") || text.includes("no camera") || text.includes("requested device")) {
    return "No camera was found on this device. You can type the barcode number instead.";
  }
  if (text.includes("secure") || text.includes("https")) {
    return "Camera needs a secure (HTTPS) page. It works on localhost; for phones we will deploy with HTTPS.";
  }
  return "Could not start the camera. You can type the barcode number instead.";
}

export default function Scanner({ onDetected, onFail, onCancel }) {
  const handled = useRef(false);
  const [starting, setStarting] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const scanner = new Html5Qrcode(ELEMENT_ID, {
      verbose: false,
      formatsToSupport: [
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
      ],
      experimentalFeatures: { useBarCodeDetectorIfSupported: true },
    });

    const startPromise = scanner
      .start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: (w) => ({ width: Math.min(320, Math.floor(w * 0.85)), height: 150 }),
        },
        (decodedText) => {
          if (handled.current) return;
          handled.current = true;
          if (navigator.vibrate) navigator.vibrate(60);
          onDetected(decodedText);
        },
        () => {} // ignore "no barcode in this frame" messages
      )
      .then(() => {
        if (!cancelled) setStarting(false);
      })
      .catch((err) => {
        if (!cancelled) onFail(friendlyError(err));
      });

    return () => {
      cancelled = true;
      startPromise.then(() => {
        try {
          if (scanner.getState() === 2) {
            scanner.stop().then(() => scanner.clear()).catch(() => {});
          }
        } catch {
          /* camera already stopped */
        }
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="card scanner-card">
      <h2>Point the camera at the barcode</h2>
      <p className="muted">Hold the pack steady, about 15 to 20 cm away, in good light.</p>
      <div className="scanner-frame">
        <div id={ELEMENT_ID} />
        {starting && <div className="scanner-loading">Starting camera…</div>}
      </div>
      <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
    </section>
  );
}