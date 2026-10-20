/**
 * eval/csv.js - a small, dependency-free CSV reader (Step 10)
 *
 * WHAT THIS FILE DOES
 * Reads the evaluation files (eval/prompts.csv and friends) without any npm
 * package. It handles what spreadsheet programs actually produce:
 *   - quoted cells that contain commas, quotes ("" means ") and line breaks
 *   - Windows (CRLF) line endings and a leading byte-order mark
 *   - a missing final newline, and blank lines at the end
 *
 *   parseCsv(text) -> array of objects, one per data row, keyed by the header
 *
 * Used by eval/check-labels.js now, and by the benchmark script in Step 10b.
 */
(function () {
  function parseRows(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let inQuotes = false;
    const src = String(text || "").replace(/^\uFEFF/, "");

    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (inQuotes) {
        if (ch === '"') {
          if (src[i + 1] === '"') {
            cell += '"';
            i++;
          } // escaped quote
          else inQuotes = false;
        } else {
          cell += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(cell);
        cell = "";
      } else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && src[i + 1] === "\n") i++;
        row.push(cell);
        cell = "";
        rows.push(row);
        row = [];
      } else {
        cell += ch;
      }
    }
    if (cell !== "" || row.length) {
      row.push(cell);
      rows.push(row);
    }
    return rows;
  }

  function parseCsv(text) {
    const rows = parseRows(text).filter((r) => r.some((c) => c.trim() !== ""));
    if (rows.length === 0) return [];
    const header = rows[0].map((h) => h.trim());
    return rows.slice(1).map((r) => {
      const obj = {};
      header.forEach((h, i) => {
        obj[h] = r[i] === undefined ? "" : r[i];
      });
      return obj;
    });
  }

  const api = { parseCsv };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else globalThis.StudyGuardCsv = api;
})();
