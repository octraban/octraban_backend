import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { xdr } from "@stellar/stellar-sdk";
import { extractContractSpecSection, parseContractSpec } from "../src/wasmContractSpec.js";

// ── WASM builder helpers ──────────────────────────────────────────────────────

function leb128(n) {
  const bytes = [];
  do {
    let b = n & 0x7f;
    n >>>= 7;
    if (n) b |= 0x80;
    bytes.push(b);
  } while (n);
  return Buffer.from(bytes);
}

function makeWasm(sectionName, payload) {
  const magic   = Buffer.from([0x00, 0x61, 0x73, 0x6d]);
  const version = Buffer.from([0x01, 0x00, 0x00, 0x00]);
  const nameBytes = Buffer.from(sectionName);
  const body = Buffer.concat([leb128(nameBytes.length), nameBytes, payload]);
  return Buffer.concat([magic, version, Buffer.from([0x00]), leb128(body.length), body]);
}

// ── XDR spec entry builders ───────────────────────────────────────────────────

function makeFnEntry(name, inputs = [], outputs = []) {
  return xdr.ScSpecEntry.scSpecEntryFunctionV0(
    new xdr.ScSpecFunctionV0({ doc: "", name, inputs, outputs })
  ).toXDR();
}

function makeInput(name, type) {
  return new xdr.ScSpecFunctionInputV0({ doc: "", name, type });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("extractContractSpecSection", () => {
  it("extracts the contractspecv0 payload", () => {
    const payload = Buffer.from([0xca, 0xfe]);
    const wasm = makeWasm("contractspecv0", payload);
    assert.deepEqual(extractContractSpecSection(wasm), payload);
  });

  it("throws on bad WASM magic", () => {
    assert.throws(() => extractContractSpecSection(Buffer.from([0x00, 0x00, 0x00, 0x00])),
      /bad magic/);
  });

  it("throws when section is absent", () => {
    const wasm = makeWasm("other_section", Buffer.from([0x01]));
    assert.throws(() => extractContractSpecSection(wasm), /contractspecv0/);
  });
});

describe("parseContractSpec", () => {
  it("parses a single function with inputs and output", () => {
    const xdrBuf = makeFnEntry(
      "swap",
      [makeInput("amt", xdr.ScSpecTypeDef.scSpecTypeU128()),
       makeInput("to",  xdr.ScSpecTypeDef.scSpecTypeAddress())],
      [xdr.ScSpecTypeDef.scSpecTypeBool()]
    );
    const wasm = makeWasm("contractspecv0", xdrBuf);
    const { functions, types } = parseContractSpec(wasm);

    assert.equal(functions.length, 1);
    assert.equal(types.length, 0);

    const fn = functions[0];
    assert.equal(fn.name, "swap");
    assert.deepEqual(fn.inputs, [{ name: "amt", type: "u128" }, { name: "to", type: "Address" }]);
    assert.deepEqual(fn.outputs, ["bool"]);
  });

  it("parses multiple entries", () => {
    const buf = Buffer.concat([
      makeFnEntry("init",     [], []),
      makeFnEntry("transfer", [makeInput("amount", xdr.ScSpecTypeDef.scSpecTypeU64())], []),
    ]);
    const { functions } = parseContractSpec(makeWasm("contractspecv0", buf));
    assert.equal(functions.length, 2);
    assert.equal(functions[0].name, "init");
    assert.equal(functions[1].name, "transfer");
    assert.equal(functions[1].inputs[0].type, "u64");
  });

  it("parses a struct type", () => {
    const entry = xdr.ScSpecEntry.scSpecEntryUdtStructV0(
      new xdr.ScSpecUdtStructV0({
        doc: "",
        lib: "",
        name: "SwapParams",
        fields: [
          new xdr.ScSpecUdtStructFieldV0({ doc: "", name: "amount", type: xdr.ScSpecTypeDef.scSpecTypeU128() }),
        ],
      })
    ).toXDR();
    const { types } = parseContractSpec(makeWasm("contractspecv0", entry));
    assert.equal(types.length, 1);
    assert.equal(types[0].kind, "struct");
    assert.equal(types[0].name, "SwapParams");
    assert.deepEqual(types[0].fields, [{ name: "amount", type: "u128" }]);
  });

  it("renders Option<u32> type correctly", () => {
    const xdrBuf = makeFnEntry(
      "maybe",
      [makeInput("x", xdr.ScSpecTypeDef.scSpecTypeOption(
        new xdr.ScSpecTypeOption({ valueType: xdr.ScSpecTypeDef.scSpecTypeU32() })
      ))],
      []
    );
    const { functions } = parseContractSpec(makeWasm("contractspecv0", xdrBuf));
    assert.equal(functions[0].inputs[0].type, "Option<u32>");
  });

  it("renders Vec<Address> type correctly", () => {
    const xdrBuf = makeFnEntry(
      "batch",
      [makeInput("addrs", xdr.ScSpecTypeDef.scSpecTypeVec(
        new xdr.ScSpecTypeVec({ elementType: xdr.ScSpecTypeDef.scSpecTypeAddress() })
      ))],
      []
    );
    const { functions } = parseContractSpec(makeWasm("contractspecv0", xdrBuf));
    assert.equal(functions[0].inputs[0].type, "Vec<Address>");
  });
});
