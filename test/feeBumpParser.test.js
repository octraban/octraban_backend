import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { xdr, StrKey } from "@stellar/stellar-sdk";
import { parseFeeBump } from "../src/feeBumpParser.js";

// ── Key fixtures ──────────────────────────────────────────────────────────────

const SPONSOR_KEY  = Buffer.alloc(32, 0xaa);
const CHANNEL_KEY  = Buffer.alloc(32, 0xbb);
const CALLER_KEY   = Buffer.alloc(32, 0xcc);
const CONTRACT_KEY = Buffer.alloc(32, 0x01);

const SPONSOR_ADDR  = StrKey.encodeEd25519PublicKey(SPONSOR_KEY);
const CHANNEL_ADDR  = StrKey.encodeEd25519PublicKey(CHANNEL_KEY);
const CALLER_ADDR   = StrKey.encodeEd25519PublicKey(CALLER_KEY);

// ── XDR builders ─────────────────────────────────────────────────────────────

/** Build a SorobanAuthorizationEntry with address credentials for CALLER_KEY. */
function makeCallerAuthEntry() {
  const invocation = new xdr.SorobanAuthorizedInvocation({
    function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
      new xdr.InvokeContractArgs({
        contractAddress: xdr.ScAddress.scAddressTypeContract(CONTRACT_KEY),
        functionName: "swap",
        args: [],
      })
    ),
    subInvocations: [],
  });

  return new xdr.SorobanAuthorizationEntry({
    credentials: xdr.SorobanCredentials.sorobanCredentialsAddress(
      new xdr.SorobanAddressCredentials({
        address: xdr.ScAddress.scAddressTypeAccount(
          xdr.AccountId.publicKeyTypeEd25519(CALLER_KEY)
        ),
        nonce: xdr.Int64.fromString("0"),
        signatureExpirationLedger: 0,
        signature: xdr.ScVal.scvVoid(),
      })
    ),
    rootInvocation: invocation,
  });
}

/** Build a minimal InvokeHostFunction operation with the given auth entries. */
function makeInvokeOp(authEntries) {
  return new xdr.Operation({
    sourceAccount: null,
    body: xdr.OperationBody.invokeHostFunction(
      new xdr.InvokeHostFunctionOp({
        hostFunction: xdr.HostFunction.hostFunctionTypeInvokeContract(
          new xdr.InvokeContractArgs({
            contractAddress: xdr.ScAddress.scAddressTypeContract(CONTRACT_KEY),
            functionName: "swap",
            args: [],
          })
        ),
        auth: authEntries,
      })
    ),
  });
}

/** Build a fee-bump envelope wrapping an inner v1 transaction. */
function makeFeeBumpEnvelope({ withCallerAuth = true } = {}) {
  const authEntries = withCallerAuth ? [makeCallerAuthEntry()] : [];

  const innerTx = new xdr.Transaction({
    sourceAccount: xdr.MuxedAccount.keyTypeEd25519(CHANNEL_KEY),
    fee: 100,
    seqNum: xdr.SequenceNumber.fromString("1"),
    cond: xdr.Preconditions.precondNone(),
    memo: xdr.Memo.memoNone(),
    operations: [makeInvokeOp(authEntries)],
    ext: new xdr.TransactionExt(0),
  });

  const innerEnv = xdr.FeeBumpTransactionInnerTx.envelopeTypeTx(
    new xdr.TransactionV1Envelope({ tx: innerTx, signatures: [] })
  );

  const fbTx = new xdr.FeeBumpTransaction({
    feeSource: xdr.MuxedAccount.keyTypeEd25519(SPONSOR_KEY),
    fee: xdr.Int64.fromString("1000"),
    innerTx: innerEnv,
    ext: new xdr.FeeBumpTransactionExt(0),
  });

  return xdr.TransactionEnvelope.envelopeTypeTxFeeBump(
    new xdr.FeeBumpTransactionEnvelope({ tx: fbTx, signatures: [] })
  ).toXDR("base64");
}

/** Build a plain (non-fee-bump) v1 envelope. */
function makePlainEnvelope() {
  const tx = new xdr.Transaction({
    sourceAccount: xdr.MuxedAccount.keyTypeEd25519(CHANNEL_KEY),
    fee: 100,
    seqNum: xdr.SequenceNumber.fromString("1"),
    cond: xdr.Preconditions.precondNone(),
    memo: xdr.Memo.memoNone(),
    operations: [],
    ext: new xdr.TransactionExt(0),
  });

  return xdr.TransactionEnvelope.envelopeTypeTx(
    new xdr.TransactionV1Envelope({ tx, signatures: [] })
  ).toXDR("base64");
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("parseFeeBump", () => {
  it("returns null for a non-fee-bump envelope", () => {
    assert.equal(parseFeeBump(makePlainEnvelope()), null);
  });

  it("returns null for invalid input", () => {
    assert.equal(parseFeeBump("not-valid-xdr"), null);
    assert.equal(parseFeeBump(null), null);
  });

  it("extracts sponsor from the outer fee-bump feeSource", () => {
    const result = parseFeeBump(makeFeeBumpEnvelope());
    assert.equal(result.sponsor, SPONSOR_ADDR);
  });

  it("extracts inner_source (channel account) from the inner tx sourceAccount", () => {
    const result = parseFeeBump(makeFeeBumpEnvelope());
    assert.equal(result.inner_source, CHANNEL_ADDR);
  });

  it("extracts actual_caller from Soroban auth credentials", () => {
    const result = parseFeeBump(makeFeeBumpEnvelope({ withCallerAuth: true }));
    assert.equal(result.actual_caller, CALLER_ADDR);
  });

  it("sets actual_caller to null when no Soroban auth credentials are present", () => {
    const result = parseFeeBump(makeFeeBumpEnvelope({ withCallerAuth: false }));
    assert.equal(result.actual_caller, null);
  });

  it("returns all three tiers as distinct addresses", () => {
    const result = parseFeeBump(makeFeeBumpEnvelope());
    assert.notEqual(result.sponsor, result.inner_source);
    assert.notEqual(result.inner_source, result.actual_caller);
    assert.notEqual(result.sponsor, result.actual_caller);
  });

  it("accepts a pre-decoded XDR object (not just base64 string)", () => {
    const env = xdr.TransactionEnvelope.fromXDR(makeFeeBumpEnvelope(), "base64");
    const result = parseFeeBump(env);
    assert.equal(result.sponsor, SPONSOR_ADDR);
    assert.equal(result.inner_source, CHANNEL_ADDR);
    assert.equal(result.actual_caller, CALLER_ADDR);
  });
});
