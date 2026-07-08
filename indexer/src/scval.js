import { StrKey } from "@stellar/stellar-sdk";

/**
 * Convert any ScVal XDR object to a typed JavaScript value using ABI type
 * information to resolve custom struct/enum/union names.
 *
 * @param {xdr.ScVal} val  - The raw ScVal to decode
 * @param {string|null} typeHint - The ABI type string for this value (e.g. "MyStruct", "MyEnum")
 * @param {Map<string, object>} typeIndex - Map from type name → parsed spec entry
 *   (built from the `types` array returned by parseContractSpec)
 * @returns {*} native JS value with proper field names for structs/enums
 */
export function scValToJsTyped(val, typeHint, typeIndex) {
  if (!val) return null;
  if (!typeHint || !typeIndex || typeIndex.size === 0) return scValToJs(val);

  const typeDef = typeIndex.get(typeHint);
  if (!typeDef) return scValToJs(val);

  const scType = val.switch().name;

  // ── Struct: encoded as ScvMap (named fields) or ScvVec (tuple struct) ──────
  if (typeDef.kind === "struct") {
    if (scType === "scvMap") {
      // Named struct: map keys are field name symbols, values are field values
      const result = {};
      const entries = val.map() ?? [];
      for (const entry of entries) {
        const rawKey = scValToJs(entry.key());
        const fieldName = String(rawKey);
        // Find the field definition to get its type for recursive decoding
        const fieldDef = typeDef.fields?.find((f) => f.name === fieldName);
        result[fieldName] = fieldDef ? scValToJsTyped(entry.val(), fieldDef.type, typeIndex) : scValToJs(entry.val());
      }
      return result;
    }
    if (scType === "scvVec") {
      // Tuple struct: positional fields mapped by index order
      const items = val.vec() ?? [];
      const fields = typeDef.fields ?? [];
      if (fields.length > 0 && items.length === fields.length) {
        const result = {};
        items.forEach((item, i) => {
          const fieldDef = fields[i];
          result[fieldDef.name] = scValToJsTyped(item, fieldDef.type, typeIndex);
        });
        return result;
      }
      // Fallback: decode as plain array
      return items.map((item) => scValToJs(item));
    }
  }

  // ── Enum (integer discriminant): encoded as ScvU32 ────────────────────────
  if (typeDef.kind === "enum") {
    if (scType === "scvU32") {
      const discriminant = val.u32();
      const matchedCase = typeDef.cases?.find((c) => c.value === discriminant);
      if (matchedCase) {
        return {
          _type: typeHint,
          variant: matchedCase.name,
          value: discriminant,
        };
      }
      return {
        _type: typeHint,
        variant: `Unknown(${discriminant})`,
        value: discriminant,
      };
    }
  }

  // ── Union (tagged variant): encoded as ScvVec([symbol, ...data]) ──────────
  if (typeDef.kind === "union") {
    if (scType === "scvVec") {
      const items = val.vec() ?? [];
      if (items.length === 0) return scValToJs(val);

      const tagVal = items[0];
      const tag = tagVal.switch().name === "scvSymbol" ? tagVal.sym().toString() : String(scValToJs(tagVal));

      const matchedCase = typeDef.cases?.find((c) => c.name === tag);

      if (!matchedCase) {
        return {
          _type: typeHint,
          variant: tag,
          data: items.slice(1).map(scValToJs),
        };
      }

      // Void variant: no payload
      if (!matchedCase.types || matchedCase.types.length === 0) {
        return { _type: typeHint, variant: tag };
      }

      // Tuple variant: decode each payload item with its declared type
      const data = items.slice(1).map((item, i) => {
        const payloadType = matchedCase.types[i] ?? null;
        return scValToJsTyped(item, payloadType, typeIndex);
      });

      return {
        _type: typeHint,
        variant: tag,
        data: data.length === 1 ? data[0] : data,
      };
    }

    // Void variant encoded as a bare symbol
    if (scType === "scvSymbol") {
      const tag = val.sym().toString();
      return { _type: typeHint, variant: tag };
    }
  }

  // ── error_enum: same shape as enum ────────────────────────────────────────
  if (typeDef.kind === "error_enum") {
    if (scType === "scvU32") {
      const discriminant = val.u32();
      const matchedCase = typeDef.cases?.find((c) => c.value === discriminant);
      if (matchedCase) {
        return { _type: typeHint, error: matchedCase.name, code: discriminant };
      }
      return {
        _type: typeHint,
        error: `Unknown(${discriminant})`,
        code: discriminant,
      };
    }
  }

  // Fallback to generic decoder
  return scValToJs(val);
}

/**
 * Build a Map<typeName, specEntry> from the types array returned by
 * parseContractSpec(). Pass this as the typeIndex to scValToJsTyped().
 *
 * @param {object[]} types - Array of { kind, name, fields?, cases? }
 * @returns {Map<string, object>}
 */
export function buildTypeIndex(types) {
  const index = new Map();
  for (const t of types ?? []) {
    if (t.name) index.set(t.name, t);
  }
  return index;
}

/**
 * Convert any ScVal XDR object to a native JavaScript value.
 * Uses BigInt for i64/u64/i128/u128 to prevent precision loss.
 *
 * @param {xdr.ScVal} val
 * @returns {*} native JS primitive, object, or array
 */
export function scValToJs(val) {
  if (!val) return null;

  const type = val.switch().name;

  switch (type) {
    case "scvBool":
      return val.b();

    case "scvVoid":
      return null;

    case "scvError":
      return { error: val.error().toString() };

    case "scvU32":
      return val.u32();

    case "scvI32":
      return val.i32();

    case "scvU64":
      return BigInt(val.u64().toString());

    case "scvI64":
      return BigInt(val.i64().toString());

    case "scvTimepoint":
      return BigInt(val.timepoint().toString());

    case "scvDuration":
      return BigInt(val.duration().toString());

    case "scvU128": {
      const u = val.u128();
      return (BigInt(u.hi().toString()) << 64n) | BigInt(u.lo().toString());
    }

    case "scvI128": {
      const i = val.i128();
      return (BigInt(i.hi().toString()) << 64n) | BigInt(i.lo().toString());
    }

    case "scvU256": {
      const u = val.u256();
      return (
        (BigInt(u.hiHi().toString()) << 192n) |
        (BigInt(u.hiLo().toString()) << 128n) |
        (BigInt(u.loHi().toString()) << 64n) |
        BigInt(u.loLo().toString())
      );
    }

    case "scvI256": {
      const i = val.i256();
      return (
        (BigInt(i.hiHi().toString()) << 192n) |
        (BigInt(i.hiLo().toString()) << 128n) |
        (BigInt(i.loHi().toString()) << 64n) |
        BigInt(i.loLo().toString())
      );
    }

    case "scvBytes":
      return Buffer.from(val.bytes()).toString("hex");

    case "scvString":
      return val.str().toString();

    case "scvSymbol":
      return val.sym().toString();

    case "scvVec":
      return (val.vec() ?? []).map(scValToJs);

    case "scvMap": {
      const obj = {};
      for (const entry of val.map() ?? []) {
        const k = scValToJs(entry.key());
        obj[String(k)] = scValToJs(entry.val());
      }
      return obj;
    }

    case "scvAddress": {
      const addr = val.address();
      const addrType = addr.switch().name;
      if (addrType === "scAddressTypeAccount") {
        return StrKey.encodeEd25519PublicKey(addr.accountId().ed25519());
      }
      if (addrType === "scAddressTypeContract") {
        return StrKey.encodeContract(addr.contractId());
      }
      return addr.toString();
    }

    case "scvLedgerKeyContractInstance":
      return { type: "ledgerKeyContractInstance" };

    case "scvLedgerKeyNonce":
      return {
        type: "ledgerKeyNonce",
        nonce: BigInt(val.nonceKey().nonce().toString()),
      };

    case "scvContractInstance":
      return { type: "contractInstance" };

    default:
      return String(val);
  }
}
