/**
 * templateRenderer.js
 *
 * Renders a human-readable string from an ABI function definition and its
 * decoded arguments.
 *
 * ABI function shape (stored in contracts.functions JSONB):
 *   {
 *     "name": "swap",
 *     "template": "Swapped {amt_in} {token_in} → {amt_out} {token_out} on {_contract}",
 *     "params": [
 *       { "name": "amt_in",   "type": "u128" },
 *       { "name": "token_in", "type": "Address" },
 *       { "name": "amt_out",  "type": "u128" },
 *       { "name": "token_out","type": "Address" }
 *     ]
 *   }
 *
 * Special tokens:
 *   {_contract}  — replaced with the contract name
 *   {_fn}        — replaced with the function name
 *
 * Arguments are matched positionally to params[].name, then substituted into
 * the template. Unknown tokens are left as-is.
 */

/**
 * Shorten a Stellar address for display: "GABCD…WXYZ"
 */
function fmtAddr(v) {
  const s = String(v);
  return s.length > 10 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s;
}

/**
 * Format a single argument value for display.
 * Stellar addresses (G/C prefix, 56 chars) get shortened.
 */
function fmtValue(v) {
  const s = String(v);
  if ((s.startsWith("G") || s.startsWith("C")) && s.length === 56) return fmtAddr(s);
  return s;
}

/**
 * Render a template string by substituting named {tokens} with argument values.
 *
 * @param {string}   template   - e.g. "Swapped {amt} {token} on {_contract}"
 * @param {object[]} params     - ABI param definitions: [{ name, type }, ...]
 * @param {any[]}    args       - decoded argument values, positionally aligned to params
 * @param {object}   [ctx]      - extra context: { contractName, fnName }
 * @returns {string}
 */
export function renderTemplate(template, params = [], args = [], ctx = {}) {
  // Build a lookup map: param name → formatted value
  const vars = {};
  params.forEach((p, i) => {
    if (i < args.length) vars[p.name] = fmtValue(args[i]);
  });

  // Special context tokens
  if (ctx.contractName) vars._contract = ctx.contractName;
  if (ctx.fnName)       vars._fn       = ctx.fnName;

  return template.replace(/\{(\w+)\}/g, (match, key) =>
    key in vars ? vars[key] : match
  );
}
