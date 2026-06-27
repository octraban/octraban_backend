import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { xdr } from "@stellar/stellar-sdk";
import { parseDiagnosticEvents, extractFailureReason } from "../src/diagnosticParser.js";

// ── helpers ───────────────────────────────────────────────────────────────────

function makeDiagXdr(contractIdByte, topics, data) {
  return new xdr.DiagnosticEvent({
    inSuccessfulContractCall: false,
    event: new xdr.ContractEvent({
      ext: new xdr.ExtensionPoint(0),
      contractId: Buffer.alloc(32, contractIdByte),
      type: xdr.ContractEventType.diagnostic(),
      body: new xdr.ContractEventBody(
        0,
        new xdr.ContractEventV0({ topics, data })
      ),
    }),
  }).toXDR("base64");
}

// ── fixtures ──────────────────────────────────────────────────────────────────

// Custom contract error: sceContract with code 7
const CONTRACT_ERROR_XDR = makeDiagXdr(
  0xab,
  [xdr.ScVal.scvSymbol("error")],
  xdr.ScVal.scvError(xdr.ScError.sceContract(7))
);

// Wasm VM trap: sceWasmVm
const WASM_ERROR_XDR = makeDiagXdr(
  0xcd,
  [xdr.ScVal.scvSymbol("error")],
  xdr.ScVal.scvError(xdr.ScError.sceWasmVm(xdr.ScErrorCode.scecInvalidInput()))
);

// Symbol error in topic (e.g. contract panics with a named symbol)
const SYMBOL_TOPIC_XDR = makeDiagXdr(
  0xef,
  [xdr.ScVal.scvSymbol("fn_call"), xdr.ScVal.scvSymbol("InsufficientBalance")],
  xdr.ScVal.scvVoid()
);

// String error in data
const STRING_DATA_XDR = makeDiagXdr(
  0x12,
  [xdr.ScVal.scvSymbol("log")],
  xdr.ScVal.scvString("overflow detected")
);

// Checked arithmetic overflow: topics name the checked fn and data is Void
const ARITH_OVERFLOW_XDR = makeDiagXdr(
  0x34,
  [xdr.ScVal.scvSymbol("i256_add_checked"), xdr.ScVal.scvSymbol("overflow")],
  xdr.ScVal.scvVoid()
);

// ── tests ─────────────────────────────────────────────────────────────────────

describe("parseDiagnosticEvents", () => {
  it("returns [] for empty input", () => {
    assert.deepEqual(parseDiagnosticEvents([]), []);
    assert.deepEqual(parseDiagnosticEvents(null), []);
  });

  it("extracts ContractError code from sceContract data", () => {
    const [result] = parseDiagnosticEvents([CONTRACT_ERROR_XDR]);
    assert.equal(result.error, "ContractError(7)");
    assert.ok(result.contractId, "contractId should be present");
    assert.ok(result.contractId.startsWith("C"), "contractId should be a Stellar contract address");
  });

  it("extracts WasmVmError from sceWasmVm data", () => {
    const [result] = parseDiagnosticEvents([WASM_ERROR_XDR]);
    assert.equal(result.error, "WasmVmError");
  });

  it("extracts named error symbol from topics (e.g. InsufficientBalance)", () => {
    const [result] = parseDiagnosticEvents([SYMBOL_TOPIC_XDR]);
    assert.equal(result.error, "InsufficientBalance");
  });

  it("extracts string error from data", () => {
    const [result] = parseDiagnosticEvents([STRING_DATA_XDR]);
    assert.equal(result.error, "overflow detected");
  });

  it("parses multiple events and returns all errors", () => {
    const results = parseDiagnosticEvents([CONTRACT_ERROR_XDR, WASM_ERROR_XDR, SYMBOL_TOPIC_XDR]);
    assert.equal(results.length, 3);
    assert.equal(results[0].error, "ContractError(7)");
    assert.equal(results[1].error, "WasmVmError");
    assert.equal(results[2].error, "InsufficientBalance");
  });

  it("detects checked arithmetic overflow and labels it Overflow [Void]", () => {
    const [result] = parseDiagnosticEvents([ARITH_OVERFLOW_XDR]);
    assert.equal(result.error, "Overflow [Void]");
  });

  it("skips malformed XDR without throwing", () => {
    const results = parseDiagnosticEvents(["not-valid-xdr", CONTRACT_ERROR_XDR]);
    assert.equal(results.length, 1);
    assert.equal(results[0].error, "ContractError(7)");
  });

  it("includes topics array in result", () => {
    const [result] = parseDiagnosticEvents([CONTRACT_ERROR_XDR]);
    assert.ok(Array.isArray(result.topics));
    assert.ok(result.topics.includes("error"));
  });
});

describe("extractFailureReason", () => {
  it("returns null for non-FAILED status", () => {
    assert.equal(extractFailureReason({ status: "SUCCESS" }), null);
    assert.equal(extractFailureReason(null), null);
  });

  it("returns null when no diagnostic events present", () => {
    assert.equal(extractFailureReason({ status: "FAILED", diagnosticEventsXdr: [] }), null);
  });

  it("returns first error from diagnosticEventsXdr on FAILED tx", () => {
    const reason = extractFailureReason({
      status: "FAILED",
      diagnosticEventsXdr: [SYMBOL_TOPIC_XDR],
    });
    assert.equal(reason, "InsufficientBalance");
  });

  it("returns ContractError code for sceContract failure", () => {
    const reason = extractFailureReason({
      status: "FAILED",
      diagnosticEventsXdr: [CONTRACT_ERROR_XDR],
    });
    assert.equal(reason, "ContractError(7)");
  });

  it("returns WasmVmError for wasm trap", () => {
    const reason = extractFailureReason({
      status: "FAILED",
      diagnosticEventsXdr: [WASM_ERROR_XDR],
    });
    assert.equal(reason, "WasmVmError");
  });
});
