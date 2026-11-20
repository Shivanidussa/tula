import { useEffect, useState } from "react";
import Scanner from "./components/Scanner";
import ResultView from "./components/ResultView";
import { lookupBarcode, scoreIngredients, wakeServer } from "./api";
import { readLabel } from "./ocr";
import NutritionFields from "./components/NutritionFields";
import { buildNutriments } from "./nutrition";

const DEMOS = [
  { name: "Nutella", code: "3017620422003" },
  { name: "Coca-Cola", code: "5449000000996" },
];

function Logo() {
  return (
    <div className="logo">
      <svg viewBox="0 0 48 48" width="34" height="34" aria-hidden="true">
        <rect width="48" height="48" rx="12" fill="#16a34a" />
        <path d="M24 11v26M13 37h22M14 17h20M14 17l-5 10a5 5 0 0010 0zM34 17l-5 10a5 5 0 0010 0z"
          fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>Tula</span>
    </div>
  );
}

export default function App() {
  const [view, setView] = useState("home"); // home | scanning | loading | notfound | result
  const [manual, setManual] = useState("");
  const [barcode, setBarcode] = useState("");
  const [pending, setPending] = useState(null); // known product details when ingredients are missing
  const [ingredientsText, setIngredientsText] = useState("");
  const [result, setResult] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [ocr, setOcr] = useState(null); // { progress, label } while a photo is being read
  const [nutriValues, setNutriValues] = useState({}); // optional numbers typed by the user
  const [slow, setSlow] = useState(false); // true when the server is slow to answer

  // Wake the free server up as soon as the app opens


    // Make the phone's Back button move inside the app instead of leaving it
  const go = (next) => {
    setView(next);
    const onPage = window.history.state && window.history.state.tula === "page";
    if (!onPage) window.history.pushState({ tula: "page" }, "");
  };

  const returnHome = () => {
    setView("home");
    const onPage = window.history.state && window.history.state.tula === "page";
    if (onPage) window.history.back();
  };

  useEffect(() => {
    wakeServer(); // wake the free server up as soon as the app opens
    const onBack = () => setView("home");
    window.addEventListener("popstate", onBack);
    return () => window.removeEventListener("popstate", onBack);
  }, []);

  const goHome = (text) => {
    setNotice(text ? { type: "error", text } : null);
    returnHome();
  };

  const reset = () => {
    setManual("");
    setBarcode("");
    setPending(null);
    setIngredientsText("");
    setResult(null);
    setNotice(null);
    setOcr(null);
    setNutriValues({});
    returnHome()
  };

  async function handlePhoto(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = ""; // lets the user pick the same photo again
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setNotice({ type: "error", text: "Please choose a photo (JPG or PNG)." });
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setNotice({ type: "error", text: "That photo is too large. Please use a photo under 20 MB." });
      return;
    }

    setNotice(null);
    setOcr({ progress: 3, label: "Preparing photo…" });
    try {
      const out = await readLabel(file, (progress, label) => setOcr({ progress, label }));
      setOcr(null);
      if (!out.ingredients || out.ingredients.length < 10) {
        setNotice({
          type: "error",
          text: "We could not read enough text. Retake the photo flat, in good light, with the ingredients filling the frame. Or type them below.",
        });
        return;
      }
      setIngredientsText(out.ingredients);
      const blurry = out.confidence && out.confidence < 55 ? " The photo looked a bit blurry, so check it carefully." : "";
      setNotice({
        type: "info",
        text: out.foundKeyword
          ? `We read this from your photo. Please check it and fix any mistakes, then tap Get Tula score.${blurry}`
          : `We could not find the word "Ingredients", so this is all the text we read. Delete anything that is not an ingredient, then tap Get Tula score.${blurry}`,
      });
    } catch {
      setOcr(null);
      setNotice({ type: "error", text: "Could not read the photo. Please try again, or type the ingredients." });
    }
  }

  async function handleLookup(raw) {
    const code = String(raw || "").replace(/\D/g, "");
    if (!/^\d{8,14}$/.test(code)) {
      goHome("Please enter a valid barcode (8 to 14 digits).");
      return;
    }
    setNotice(null);
    setBarcode(code);
    setPending(null);
    go("loading");
    setSlow(false);
    const slowTimer = setTimeout(() => setSlow(true), 6000);

    const r = await lookupBarcode(code);
    clearTimeout(slowTimer);
    setSlow(false);

    if (r.networkError === "timeout") {
      goHome("The server took too long to respond. Please try again.");
    } else if (r.networkError) {
      goHome("Cannot reach the Tula server. Make sure the backend is running.");
    } else if (r.ok && r.data && r.data.found) {
      const hasScore = r.data.score && typeof r.data.score.score === "number";
      if (hasScore) {
        setResult({ product: r.data.product, score: r.data.score, barcode: code, source: "Open Food Facts" });
        setView("result");
      } else {
        // Product exists but has no usable ingredients or nutrition
        setPending(r.data.product);
        go("notfound");
      }
    } else if (r.status === 404 && r.data && r.data.error === "NOT_FOUND") {
      go("notfound");
    } else {
      goHome((r.data && r.data.message) || "Something went wrong. Please try again.");
    }
  }

  async function handleIngredients() {
    const text = ingredientsText.trim();
    if (text.length < 3) {
      setNotice({ type: "error", text: "Please enter the ingredients first." });
      return;
    }
    setNotice(null);
    setBusy(true);
    const combined = { ...(pending ? pending.nutriments : {}), ...buildNutriments(nutriValues) };
    const r = await scoreIngredients(text, combined);
    setBusy(false);

    if (r.ok && r.data && r.data.score) {
      setResult({
        product: {
          name: pending ? pending.name : "Your product",
          brand: pending ? pending.brand : "",
          quantity: pending ? pending.quantity : "",
          image: pending ? pending.image : "",
          ingredients: text,
          nutriments: combined,
          nutriscore: pending ? pending.nutriscore : null,
          nova: pending ? pending.nova : null,
        },
        score: r.data.score,
        barcode,
        source: pending ? "Open Food Facts" : "ingredients",
      });
      go("result");
    } else if (r.networkError) {
      setNotice({ type: "error", text: "Cannot reach the Tula server. Please try again." });
    } else {
      setNotice({ type: "error", text: (r.data && r.data.message) || "Could not score these ingredients." });
    }
  }

  return (
    <div className="app">
      <header className="header">
        <Logo />
        <span className="tagline">Know what you eat</span>
      </header>

      <main className="main">
        {notice && <div className={`notice notice-${notice.type}`} role="alert">{notice.text}</div>}

        {view === "home" && (
          <div className="stack">
            <section className="card hero">
              <h1>Is it healthy?<br />Scan and find out.</h1>
              <p className="muted">Scan a packet's barcode and get an honest score from 1 to 100, with the reasons.</p>
              <button className="btn btn-primary btn-big" onClick={() => { setNotice(null); go("scanning"); }}>
                📷&nbsp; Scan barcode
              </button>
              <div className="divider"><span>or type the number</span></div>
              <form className="row" onSubmit={(e) => { e.preventDefault(); handleLookup(manual); }}>
                <input
                  className="input"
                  inputMode="numeric"
                  placeholder="e.g. 3017620422003"
                  value={manual}
                  onChange={(e) => setManual(e.target.value)}
                  aria-label="Barcode number"
                />
                <button className="btn btn-dark" type="submit">Check</button>
              </form>
              <div className="chips">
                <span className="muted small">Try:</span>
                {DEMOS.map((d) => (
                  <button key={d.code} className="chip" onClick={() => handleLookup(d.code)}>{d.name}</button>
                ))}
              </div>
            </section>

            <section className="card how">
              <h3>How Tula works</h3>
              <ol>
                <li><b>Scan</b> the barcode on any packet.</li>
                <li><b>We read</b> the ingredients and nutrition.</li>
                <li><b>You get</b> a 1 to 100 score and the reasons.</li>
              </ol>
            </section>
          </div>
        )}

        {view === "scanning" && (
          <Scanner
            onDetected={handleLookup}
            onFail={(msg) => goHome(msg)}
            onCancel={() => goHome()}
          />
        )}

        {view === "loading" && (
          <section className="card center loading">
            <div className="spinner" aria-hidden="true" />
            <p>Looking up barcode {barcode}…</p>
            {slow && <p className="muted small">The free server is waking up. The first lookup can take up to a minute.</p>}
          </section>
        )}

        {view === "notfound" && (
          <section className="card stack-tight">
            <h2>{pending ? "Ingredients are missing" : "We don't have this product yet"}</h2>
            <p className="muted">
              {pending
                ? `We found ${pending.name || "this product"}, but its ingredients are not listed.`
                : `Barcode ${barcode} is not in the Open Food Facts database.`}{" "}
              Type or paste the ingredients from the back of the pack and Tula will score it.
            </p>
            <textarea
              className="input textarea"
              rows={5}
              placeholder="e.g. Refined wheat flour (maida), sugar, palm oil, salt, INS 322…"
              value={ingredientsText}
              onChange={(e) => setIngredientsText(e.target.value)}
              aria-label="Ingredients"
            />
            <NutritionFields values={nutriValues} onChange={setNutriValues} />
            <button className="btn btn-primary" onClick={handleIngredients} disabled={busy || Boolean(ocr)}>
              {busy ? "Scoring…" : "Get Tula score"}
            </button>

            <div className="divider"><span>or read it from a photo</span></div>
            <label className={ocr ? "btn btn-secondary file-btn is-disabled" : "btn btn-secondary file-btn"}>
              <input type="file" accept="image/*" capture="environment" onChange={handlePhoto} disabled={Boolean(ocr)} hidden />
              📸&nbsp; Scan the label with a photo
            </label>
            <p className="muted small">Tip: lay the pack flat, use good light, and keep only the ingredients list in the frame.</p>
            {ocr && (
              <div className="progress" role="status">
                <div className="progress-track"><div className="progress-bar" style={{ width: `${ocr.progress}%` }} /></div>
                <span className="small muted">{ocr.label}</span>
              </div>
            )}

            <button className="btn btn-ghost" onClick={reset} disabled={Boolean(ocr)}>Back</button>
          </section>
        )}

        {view === "result" && result && <ResultView data={result} onReset={reset} />}
      </main>
    </div>
  );
}