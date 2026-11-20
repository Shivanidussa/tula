// Turns the raw text read from a photo into just the ingredients list.
// Pure functions only (no browser needed), so they are easy to test.

const START = /[il1|]ngred[il1|]ents?\s*[:.\-–]?/i; // also catches OCR slips like "lngredients"
const END = new RegExp(
  [
    "nutrition(al)?\\s*(information|facts|value|label)",
    "allergen",
    "contains\\s+(added\\s+)?(permitted|natural|artificial|nature)",
    "manufactured",
    "marketed",
    "packed\\s+(by|at)",
    "\\bmfd\\b",
    "best\\s*before",
    "use\\s*by",
    "store\\s*(in|at)",
    "storage",
    "net\\s*(wt|weight|qty|quantity|content)",
    "fssai",
    "batch",
    "customer\\s*care",
    "imported\\s*by",
    "per\\s*100\\s*(g|ml)",
  ].join("|"),
  "i"
);

export function cleanText(text) {
  return String(text || "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\|+/g, ",") // a stray bar is usually a misread comma
    .replace(/[_~=<>*#@^\\]/g, " ")
    .replace(/(,\s*){2,}/g, ", ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
}

export function extractIngredients(rawText) {
  const flat = cleanText(rawText);
  if (!flat) return { ingredients: "", foundKeyword: false };

  const start = flat.match(START);
  let body = flat;
  let foundKeyword = false;

  if (start) {
    foundKeyword = true;
    body = flat.slice(start.index + start[0].length);
  }

  const end = body.match(END);
  if (end && end.index > 10) body = body.slice(0, end.index);

  body = body
    .slice(0, 1200)
    .replace(/^[\s:.\-–,]+/, "")
    .replace(/[\s,;:\-–]+$/, "")
    .trim();

  return { ingredients: body, foundKeyword };
}