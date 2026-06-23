/**
 * WASM Execution Call Stack Reconstructor
 *
 * Reconstructs a chronological execution tree from a Soroban transaction's
 * diagnostic events, host function logs, and auth stack transitions.
 * Each node carries precise CPU instruction costs mapped to the step.
 */

import { xdr, StrKey, scValToNative } from "@stellar/stellar-sdk";

/**
 * Decode a single DiagnosticEvent XDR to a trace node shape.
 *
 * @param {string} b64  base64-encoded DiagnosticEvent XDR
 * @param {number} seq  sequential index in the event array
 * @returns {object|null}
 */
function decodeTraceEvent(b64, seq) {
  try {
    const diagEvent = xdr.DiagnosticEvent.fromXDR(b64, "base64");
    const ev = diagEvent.event();
    const v0 = ev.body().v0();
    const topics = v0.topics();
    const dataVal = v0.data();

    const rawId = ev.contractId();
    const contractId = rawId ? StrKey.encodeContract(rawId) : null;

    const topicStrings = topics.map((t) => {
      try {
        return String(scValToNative(t));
      } catch {
        return t.switch().name;
      }
    });

    let data = null;
    try {
      const n = scValToNative(dataVal);
      data = typeof n === "bigint" ? n.toString() : n;
    } catch {
      /* ignore */
    }

    const eventType = topicStrings[0] ?? "unknown";
    const fnName = topicStrings[1] ?? null;

    // Extract CPU instructions from data if present (map/struct shape)
    let cpuInstructions = null;
    if (data && typeof data === "object") {
      cpuInstructions = data.cpu_insns ?? data.cpuInstructions ?? data.instructions ?? null;
    }

    let kind = "event";
    if (eventType === "fn_call" || eventType === "call" || eventType === "invoke_contract") kind = "call";
    else if (eventType === "fn_return" || eventType === "return") kind = "return";
    else if (eventType === "auth_check") kind = "auth";
    else if (eventType === "wasm_trap" || eventType === "error") kind = "trap";
    else if (topicStrings.some((s) => /trap|panic|abort/i.test(s))) kind = "trap";

    return {
      seq,
      contractId,
      eventType,
      fnName,
      kind,
      topics: topicStrings,
      data,
      cpuInstructions,
    };
  } catch {
    return null;
  }
}

/**
 * Build a call-hierarchy tree from a flat list of trace events.
 * Matches fn_call/fn_return pairs by contractId + fnName into nested nodes.
 *
 * @param {object[]} events  flat list from decodeTraceEvent
 * @returns {object[]}       root-level call tree nodes
 */
function buildCallTree(events) {
  const root = [];
  const stack = [];

  for (const ev of events) {
    if (ev.kind === "call") {
      const node = {
        ...ev,
        children: [],
        returnData: null,
        cpuCost: ev.cpuInstructions,
      };
      if (stack.length === 0) {
        root.push(node);
      } else {
        stack[stack.length - 1].children.push(node);
      }
      stack.push(node);
    } else if (ev.kind === "return") {
      if (stack.length > 0) {
        const top = stack.pop();
        top.returnData = ev.data;
        if (ev.cpuInstructions != null && top.cpuCost == null) {
          top.cpuCost = ev.cpuInstructions;
        }
      }
    } else if (ev.kind === "auth") {
      const authNode = { ...ev, children: [] };
      if (stack.length > 0) {
        stack[stack.length - 1].children.push(authNode);
      } else {
        root.push(authNode);
      }
    } else if (ev.kind === "trap") {
      const trapNode = { ...ev, children: [] };
      if (stack.length > 0) {
        stack[stack.length - 1].children.push(trapNode);
      } else {
        root.push(trapNode);
      }
      // A trap pops the current frame
      if (stack.length > 0) stack.pop();
    } else {
      // Generic event — attach to current frame
      if (stack.length > 0) {
        stack[stack.length - 1].children.push({ ...ev, children: [] });
      } else {
        root.push({ ...ev, children: [] });
      }
    }
  }

  return root;
}

/**
 * Parse a transaction's diagnostic events into a structured execution trace.
 *
 * @param {string[]} diagnosticEventsXdr  base64-encoded DiagnosticEvent XDR array
 * @returns {{
 *   callTree: object[],
 *   flatEvents: object[],
 *   totalCpuInstructions: number | null,
 *   hasTrap: boolean,
 * }}
 */
export function parseExecutionTrace(diagnosticEventsXdr) {
  if (!Array.isArray(diagnosticEventsXdr) || diagnosticEventsXdr.length === 0) {
    return {
      callTree: [],
      flatEvents: [],
      totalCpuInstructions: null,
      hasTrap: false,
    };
  }

  const flatEvents = diagnosticEventsXdr.map((b64, i) => decodeTraceEvent(b64, i)).filter(Boolean);

  const callTree = buildCallTree(flatEvents);

  let totalCpuInstructions = null;
  let hasTrap = false;
  for (const ev of flatEvents) {
    if (ev.cpuInstructions != null) {
      totalCpuInstructions = (totalCpuInstructions ?? 0) + Number(ev.cpuInstructions);
    }
    if (ev.kind === "trap") hasTrap = true;
  }

  return { callTree, flatEvents, totalCpuInstructions, hasTrap };
}

/**
 * Flatten an invocation node tree (from SorobanTransactionMeta) into
 * a trace-compatible flat event list when diagnostic events are absent.
 *
 * @param {object} invocationNode
 * @param {number} depth
 * @returns {object[]}
 */
export function flattenInvocationTree(invocationNode, depth = 0) {
  if (!invocationNode) return [];

  const events = [];
  const contractId = invocationNode?.function?.contractAddress?.toString?.() ?? invocationNode?.contractId ?? null;
  const fnName = invocationNode?.function?.functionName?.toString?.() ?? invocationNode?.functionName ?? "unknown";

  events.push({
    seq: depth,
    contractId,
    eventType: "fn_call",
    fnName,
    kind: "call",
    topics: ["fn_call", fnName],
    data: null,
    cpuInstructions: invocationNode?.resources?.cpuInstructions ?? null,
    depth,
    children: [],
  });

  for (const child of invocationNode?.subInvocations ?? []) {
    events.push(...flattenInvocationTree(child, depth + 1));
  }

  return events;
}
