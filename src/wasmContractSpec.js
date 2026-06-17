/**
 * wasmContractSpec.js
 *
 * Parses a Soroban WASM binary and extracts the embedded ContractSpec
 * from the custom section named "contractspecv0".
 *
 * Returns a clean, human-readable list of functions and types.
 */

import { xdr } from "@stellar/stellar-sdk";
import jsXdr from "@stellar/js-xdr";
const { XdrReader } = jsXdr;

const WASM_MAGIC = 0x0061736d; // "\0asm" big-endian u32

// ── LEB128 decoder ───────────────────────────────────────────────────────────

function readLEB128(buf, offset) {
  let result = 0,
    shift = 0,
    byte;
  do {
    byte = buf[offset++];
    result |= (byte & 0x7f) << shift;
    shift += 7;
  } while (byte & 0x80);
  return { value: result, offset };
}

// ── WASM section scanner ─────────────────────────────────────────────────────

/**
 * Find and return the raw bytes of the "contractspecv0" custom section.
 * @param {Buffer|Uint8Array} wasm
 * @returns {Buffer}  raw section payload (after the name)
 * @throws if magic is wrong or section not found
 */
export function extractContractSpecSection(wasm) {
  const buf = Buffer.isBuffer(wasm) ? wasm : Buffer.from(wasm);

  if (buf.readUInt32BE(0) !== WASM_MAGIC) {
    throw new Error("Not a valid WASM binary (bad magic)");
  }

  let pos = 8; // skip magic (4) + version (4)

  while (pos < buf.length) {
    const sectionId = buf[pos++];
    const { value: sectionSize, offset: afterSize } = readLEB128(buf, pos);
    pos = afterSize;
    const sectionEnd = pos + sectionSize;

    if (sectionId === 0) {
      // Custom section: read name
      const { value: nameLen, offset: afterNameLen } = readLEB128(buf, pos);
      const name = buf.slice(afterNameLen, afterNameLen + nameLen).toString("utf8");
      if (name === "contractspecv0") {
        return buf.slice(afterNameLen + nameLen, sectionEnd);
      }
    }

    pos = sectionEnd;
  }

  throw new Error('WASM does not contain a "contractspecv0" custom section');
}

// ── XDR entry decoder ────────────────────────────────────────────────────────

/**
 * Convert a ScSpecTypeDef to a readable type string.
 */
function typeStr(typeDef) {
  const name = typeDef.switch().name;
  const MAP = {
    scSpecTypeVal: "Val",
    scSpecTypeBool: "bool",
    scSpecTypeVoid: "void",
    scSpecTypeError: "Error",
    scSpecTypeU32: "u32",
    scSpecTypeI32: "i32",
    scSpecTypeU64: "u64",
    scSpecTypeI64: "i64",
    scSpecTypeTimepoint: "Timepoint",
    scSpecTypeDuration: "Duration",
    scSpecTypeU128: "u128",
    scSpecTypeI128: "i128",
    scSpecTypeU256: "u256",
    scSpecTypeI256: "i256",
    scSpecTypeBytes: "Bytes",
    scSpecTypeString: "String",
    scSpecTypeSymbol: "Symbol",
    scSpecTypeAddress: "Address",
  };
  if (MAP[name]) return MAP[name];
  if (name === "scSpecTypeUdt") return typeDef.udt().name().toString();
  if (name === "scSpecTypeOption") return `Option<${typeStr(typeDef.option().valueType())}>`;
  if (name === "scSpecTypeVec") return `Vec<${typeStr(typeDef.vec().elementType())}>`;
  if (name === "scSpecTypeMap") return `Map<${typeStr(typeDef.map().keyType())},${typeStr(typeDef.map().valueType())}>`;
  if (name === "scSpecTypeTuple") return `(${typeDef.tuple().valueTypes().map(typeStr).join(",")})`;
  if (name === "scSpecTypeBytesN") return `BytesN<${typeDef.bytesN().n()}>`;
  if (name === "scSpecTypeResult")
    return `Result<${typeStr(typeDef.result().okType())},${typeStr(typeDef.result().errorType())}>`;
  return name;
}

function decodeEntry(entry) {
  const kind = entry.switch().name;

  if (kind === "scSpecEntryFunctionV0") {
    const fn = entry.functionV0();
    return {
      kind: "function",
      name: fn.name().toString(),
      doc: fn.doc().toString() || undefined,
      inputs: fn.inputs().map((i) => ({ name: i.name().toString(), type: typeStr(i.type()) })),
      outputs: fn.outputs().map(typeStr),
    };
  }

  if (kind === "scSpecEntryUdtStructV0") {
    const s = entry.udtStructV0();
    return {
      kind: "struct",
      name: s.name().toString(),
      doc: s.doc().toString() || undefined,
      fields: s.fields().map((f) => ({ name: f.name().toString(), type: typeStr(f.type()) })),
    };
  }

  if (kind === "scSpecEntryUdtUnionV0") {
    const u = entry.udtUnionV0();
    return {
      kind: "union",
      name: u.name().toString(),
      doc: u.doc().toString() || undefined,
      cases: u.cases().map((c) => {
        const ck = c.switch().name;
        if (ck === "scSpecUdtUnionCaseVoidV0") return { name: c.voidCase().name().toString() };
        if (ck === "scSpecUdtUnionCaseTupleV0") {
          const t = c.tupleCase();
          return { name: t.name().toString(), types: t.type().map(typeStr) };
        }
        return { name: String(c) };
      }),
    };
  }

  if (kind === "scSpecEntryUdtEnumV0") {
    const e = entry.udtEnumV0();
    return {
      kind: "enum",
      name: e.name().toString(),
      doc: e.doc().toString() || undefined,
      cases: e.cases().map((c) => ({ name: c.name().toString(), value: c.value() })),
    };
  }

  if (kind === "scSpecEntryUdtErrorEnumV0") {
    const e = entry.udtErrorEnumV0();
    return {
      kind: "error_enum",
      name: e.name().toString(),
      doc: e.doc().toString() || undefined,
      cases: e.cases().map((c) => ({ name: c.name().toString(), value: c.value() })),
    };
  }

  return { kind };
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Parse a Soroban WASM binary and return its ContractSpec entries.
 *
 * The contractspecv0 section is a concatenation of XDR-encoded ScSpecEntry
 * values. We read them sequentially until the buffer is exhausted.
 *
 * @param {Buffer|Uint8Array} wasm
 * @returns {{ functions: object[], types: object[] }}
 */
export function parseContractSpec(wasm) {
  const data = extractContractSpecSection(wasm);
  const entries = [];
  const reader = new XdrReader(data);

  while (!reader.eof) {
    entries.push(decodeEntry(xdr.ScSpecEntry.read(reader)));
  }

  return {
    functions: entries.filter((e) => e.kind === "function"),
    types: entries.filter((e) => e.kind !== "function"),
  };
}
