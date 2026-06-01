import { xdr, StrKey, scValToNative } from "@stellar/stellar-sdk";

/**
 * Extract a human-readable error label from an ScError XDR value.
 * Soroban encodes contract panics as scErrorTypeWasm and custom errors
 * as scErrorTypeContract with a numeric code.
 *
 * @param {xdr.ScError} err
 * @returns {string}
 */
function scErrorToLabel(err) {
  const kind = err.switch().name; // e.g. "sceContract", "sceWasmVm", "sceValue"
  switch (kind) {
    case "sceContract": {
      // Custom contract error — numeric code defined by the contract author
      // XDR arm is `contractCode` (Uint32), not `code`
      const code = err.contractCode();
      return `ContractError(${code})`;
    }
    case "sceWasmVm":
      return "WasmVmError";
    case "sceValue":
      return "ValueError";
    case "sceAuth":
      return "AuthError";
    case "sceArith":
      return "ArithmeticError";
    default:
      return kind ?? "UnknownError";
  }
}

/**
 * Attempt to extract a symbolic error name from an ScVal.
 * Contracts often emit the error symbol as a scvSymbol or scvString topic,
 * or as an scvError data value.
 *
 * @param {xdr.ScVal} val
 * @returns {string|null}
 */
function extractErrorFromScVal(val) {
  if (!val) return null;
  const type = val.switch().name;
  if (type === "scvSymbol") return val.sym().toString();
  if (type === "scvString") return val.str().toString();
  if (type === "scvError") return scErrorToLabel(val.error());
  return null;
}

/**
 * Parse DiagnosticEvents from a failed Soroban transaction's result XDR.
 *
 * Soroban RPC returns `diagnosticEventsXdr` as an array of base64-encoded
 * `DiagnosticEvent` XDR strings when `ENABLE_SOROBAN_DIAGNOSTIC_EVENTS=1`
 * is set on the RPC node, or when fetched via `getTransaction` with
 * `diagnosticEventsXdr` in the response.
 *
 * @param {string[]} diagnosticEventsXdr  Array of base64 DiagnosticEvent XDR strings
 * @returns {{ contractId: string|null, error: string, topics: string[], data: any }[]}
 */
export function parseDiagnosticEvents(diagnosticEventsXdr) {
  if (!Array.isArray(diagnosticEventsXdr) || diagnosticEventsXdr.length === 0) return [];

  const results = [];

  for (const b64 of diagnosticEventsXdr) {
    try {
      const diagEvent = xdr.DiagnosticEvent.fromXDR(b64, "base64");
      const ev = diagEvent.event();
      const v0 = ev.body().v0();
      const topics = v0.topics();
      const dataVal = v0.data();

      const rawId = ev.contractId();
      const contractId = rawId ? StrKey.encodeContract(rawId) : null;

      // Generic topic markers that are not error labels
      const SKIP = new Set(["fn_call", "fn_return", "log", "error", "diagnostic"]);

      // 1. Check data first for scvError (most reliable source)
      let error = null;
      if (dataVal?.switch?.().name === "scvError") {
        error = extractErrorFromScVal(dataVal);
      }

      // 2. Walk topics for a named error symbol (skip generic markers)
      if (!error) {
        for (const t of topics) {
          const kind = t?.switch?.().name;
          // Always extract scvError from topics
          if (kind === "scvError") { error = extractErrorFromScVal(t); break; }
          // Accept scvSymbol/scvString only if not a generic marker
          if (kind === "scvSymbol" || kind === "scvString") {
            const label = extractErrorFromScVal(t);
            if (label && !SKIP.has(label)) { error = label; break; }
          }
        }
      }

      // 3. Fall back to data string/symbol
      if (!error) error = extractErrorFromScVal(dataVal);

      // 4. Detect checked 256-bit arithmetic overflows and override
      // error labels that are actually the arithmetic function name.
      try {
        const ARITH_FN_RE = /(i256|u256).*(add|sub|mul|pow)|checked.*(add|sub|mul|pow)|\b(add|sub|mul|pow)\b.*(i256|u256)/i;
        const hasArithFn = topics.some(t => {
          try { const s = scValToNative(t); return ARITH_FN_RE.test(String(s)); } catch { return false; }
        });

        const hasOverflowWord = topics.some(t => {
          try { const s = scValToNative(t); return /overflow/i.test(String(s)); } catch { return false; }
        });

        const dataIsVoid = dataVal?.switch?.().name === 'scvVoid';
        const dataIsOverflowString = dataVal?.switch?.().name === 'scvString' && /overflow/i.test(dataVal.str().toString());

        // Only classify as `Overflow [Void]` when the overflow is coming from
        // arithmetic host functions that returned Void (checked ops), or when
        // the topics explicitly include an overflow marker alongside an
        // arithmetic function name. Do not override plain string messages.
        if ((hasArithFn && (dataIsVoid || hasOverflowWord))) {
          error = 'Overflow [Void]';
        }
      } catch { /* ignore detection errors */ }

      // Last resort: check if data is a native error object
      if (!error) {
        try {
          const native = scValToNative(dataVal);
          if (native && typeof native === "object" && "error" in native) {
            error = String(native.error);
          }
        } catch { /* ignore */ }
      }

      if (!error) continue; // not an error event — skip

      results.push({
        contractId,
        error,
        topics: topics.map(t => {
          try { return String(scValToNative(t)); } catch { return "?"; }
        }),
        data: (() => {
          try {
            const n = scValToNative(dataVal);
            return typeof n === "bigint" ? n.toString() : n;
          } catch { return null; }
        })(),
      });
    } catch { /* malformed XDR — skip */ }
  }

  return results;
}

/**
 * Convenience wrapper: given a `getTransaction` RPC response for a failed tx,
 * return the first error label found in its diagnostic events, or null.
 *
 * @param {object} txResult  Response from SorobanRpc.getTransaction()
 * @returns {string|null}
 */
export function extractFailureReason(txResult) {
  if (txResult?.status !== "FAILED") return null;
  const events = parseDiagnosticEvents(txResult.diagnosticEventsXdr ?? []);
  return events[0]?.error ?? null;
}
