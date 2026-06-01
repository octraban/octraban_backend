/**
 * Issue #175 — Reentrancy Guard Trap & Deep Call-Stack Exception Detector
 *
 * Identifies when a Soroban transaction fails due to:
 *   1. A reentrancy violation (contract called itself recursively through the guard)
 *   2. Reaching the maximum allowed cross-contract execution depth limit
 *
 * The detector walks the diagnostic event stream and returns structured
 * findings with the exact event index where the trap occurred.
 */

import { parseDiagnosticEvents } from "./diagnosticParser.js";

// Soroban host error codes / patterns that map to reentrancy or depth violations.
// These come from host error type names and contract panic codes observed in RPC.
const REENTRANCY_PATTERNS = [
  /reentr/i,
  /reentrant/i,
  /locked/i,
  /recursive.*(call|lock)/i,
  /already.*(lock|borrow)/i,
  /mutex/i,
];

const DEPTH_PATTERNS = [
  /max.*(depth|call|stack)/i,
  /call.*(depth|stack|limit)/i,
  /depth.*(limit|exceeded|max)/i,
  /stack.*(overflow|depth|limit)/i,
  /ExceededLimit/i,
  /TooDeep/i,
  /HostContextError/i,
];

/**
 * Detect reentrancy traps and maximum call-depth violations from a failed
 * transaction's diagnostic event stream.
 *
 * @param {string[]} diagnosticEventsXdr  base64 DiagnosticEvent XDR array
 * @returns {{
 *   hasReentrancyTrap: boolean,
 *   hasMaxDepthViolation: boolean,
 *   trapEventIndex: number | null,
 *   trapMessage: string | null,
 *   callDepth: number,
 *   warning: string | null,
 *   findings: Array<{ index: number, error: string, contractId: string|null, kind: "reentrancy"|"depth"|"other" }>,
 * }}
 */
export function detectReentrancyTraps(diagnosticEventsXdr) {
  const result = {
    hasReentrancyTrap: false,
    hasMaxDepthViolation: false,
    trapEventIndex: null,
    trapMessage: null,
    callDepth: 0,
    warning: null,
    findings: [],
  };

  if (!Array.isArray(diagnosticEventsXdr) || diagnosticEventsXdr.length === 0) {
    return result;
  }

  const parsed = parseDiagnosticEvents(diagnosticEventsXdr);

  for (let i = 0; i < parsed.length; i++) {
    const ev = parsed[i];
    const { error, contractId } = ev;
    if (!error) continue;

    const isReentrancy = REENTRANCY_PATTERNS.some(re => re.test(error));
    const isDepth = DEPTH_PATTERNS.some(re => re.test(error));

    if (isReentrancy || isDepth) {
      const kind = isReentrancy ? "reentrancy" : "depth";
      result.findings.push({ index: i, error, contractId, kind });

      if (result.trapEventIndex === null) {
        result.trapEventIndex = i;
        result.trapMessage = error;
      }
      if (isReentrancy) result.hasReentrancyTrap = true;
      if (isDepth) result.hasMaxDepthViolation = true;
    }
  }

  // Depth heuristic: count call/return indicators in parsed events
  let depth = 0;
  let maxDepth = 0;
  for (const ev of parsed) {
    const indicator = (ev.type ?? ev.eventType ?? ev.topic0 ?? "").toLowerCase();
    if (indicator === "fn_call" || indicator === "call" || indicator === "invoke_contract") {
      depth++;
      maxDepth = Math.max(maxDepth, depth);
    } else if (indicator === "fn_return" || indicator === "return") {
      depth = Math.max(0, depth - 1);
    }
  }
  result.callDepth = maxDepth;

  // Flag max depth heuristically if > 15 (Soroban default limit is ~20)
  if (maxDepth >= 15 && !result.hasMaxDepthViolation) {
    result.hasMaxDepthViolation = true;
    result.findings.push({
      index: -1,
      error: `Inferred: call depth reached ${maxDepth} (approaching limit)`,
      contractId: null,
      kind: "depth",
    });
  }

  if (result.hasReentrancyTrap && result.hasMaxDepthViolation) {
    result.warning = "[Reentrancy Trap Triggered / Maximum Call Depth Reached]";
  } else if (result.hasReentrancyTrap) {
    result.warning = "[Reentrancy Trap Triggered]";
  } else if (result.hasMaxDepthViolation) {
    result.warning = "[Maximum Call Depth Reached]";
  }

  return result;
}

/**
 * Synchronous version using pre-parsed events (avoids dynamic import).
 *
 * @param {object[]} parsedEvents  output of parseDiagnosticEvents()
 * @param {number}   [observedDepth=0]  max depth from invocation tree walk
 * @returns {ReturnType<typeof detectReentrancyTraps>}
 */
export function detectReentrancyFromParsed(parsedEvents, observedDepth = 0) {
  const result = {
    hasReentrancyTrap: false,
    hasMaxDepthViolation: false,
    trapEventIndex: null,
    trapMessage: null,
    callDepth: observedDepth,
    warning: null,
    findings: [],
  };

  for (let i = 0; i < (parsedEvents ?? []).length; i++) {
    const { error, contractId } = parsedEvents[i];
    if (!error) continue;

    const isReentrancy = REENTRANCY_PATTERNS.some(re => re.test(error));
    const isDepth = DEPTH_PATTERNS.some(re => re.test(error));

    if (isReentrancy || isDepth) {
      const kind = isReentrancy ? "reentrancy" : "depth";
      result.findings.push({ index: i, error, contractId, kind });
      if (result.trapEventIndex === null) {
        result.trapEventIndex = i;
        result.trapMessage = error;
      }
      if (isReentrancy) result.hasReentrancyTrap = true;
      if (isDepth) result.hasMaxDepthViolation = true;
    }
  }

  if (observedDepth >= 15 && !result.hasMaxDepthViolation) {
    result.hasMaxDepthViolation = true;
    result.findings.push({
      index: -1,
      error: `Inferred: call depth reached ${observedDepth} (approaching limit)`,
      contractId: null,
      kind: "depth",
    });
  }

  if (result.hasReentrancyTrap && result.hasMaxDepthViolation) {
    result.warning = "[Reentrancy Trap Triggered / Maximum Call Depth Reached]";
  } else if (result.hasReentrancyTrap) {
    result.warning = "[Reentrancy Trap Triggered]";
  } else if (result.hasMaxDepthViolation) {
    result.warning = "[Maximum Call Depth Reached]";
  }

  return result;
}
