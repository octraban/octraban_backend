import { xdr, StrKey } from "@stellar/stellar-sdk";

/**
 * Decode an XDR MuxedAccount to a plain G-address string.
 * Handles both simple ed25519 and muxed ed25519 account types.
 * @param {xdr.MuxedAccount} ma
 * @returns {string}
 */
function muxedToGAddress(ma) {
  if (ma.switch() === xdr.CryptoKeyType.keyTypeMuxedEd25519()) {
    return StrKey.encodeEd25519PublicKey(ma.med25519().ed25519());
  }
  return StrKey.encodeEd25519PublicKey(ma.ed25519());
}

/**
 * Extract the actual caller from the first Soroban authorization entry in the
 * inner transaction's operations.
 *
 * In a high-throughput pipeline the inner transaction's source account is a
 * channel account used only to provide a sequence number.  The real signing
 * identity is recorded in the SorobanAuthorizationEntry credentials attached
 * to the InvokeHostFunction operation.
 *
 * @param {xdr.Transaction} innerTx  Already-decoded inner transaction XDR object
 * @returns {string | null}  G-address of the actual caller, or null if not found
 */
function extractActualCaller(innerTx) {
  try {
    for (const op of innerTx.operations()) {
      if (op.body().switch().name !== "invokeHostFunction") continue;
      const auths = op.body().invokeHostFunctionOp().auth();
      for (const entry of auths) {
        const creds = entry.credentials();
        if (creds.switch().name === "sorobanCredentialsSourceAccount") continue;
        const scAddr = creds.address().address();
        if (scAddr.switch().name === "scAddressTypeAccount") {
          return StrKey.encodeEd25519PublicKey(scAddr.accountId().ed25519());
        }
        if (scAddr.switch().name === "scAddressTypeContract") {
          return StrKey.encodeContract(scAddr.contractId());
        }
      }
    }
  } catch {
    /* auth not present or malformed */
  }
  return null;
}

/**
 * Inspect a TransactionEnvelope for a Fee-Bump wrapper and extract the full
 * three-tier chain of custody:
 *
 *   Sponsor       — outer fee-paying account (who paid the gas)
 *   inner_source  — inner transaction source account (channel account used
 *                   solely to provide a sequence number for parallel execution)
 *   actual_caller — signing identity from Soroban auth credentials (who
 *                   actually authorised the contract logic)
 *
 * @param {xdr.TransactionEnvelope | string} envelopeXdr
 *   Accepts an already-decoded XDR object OR a base64-encoded string.
 * @returns {{ sponsor: string, inner_source: string, actual_caller: string | null } | null}
 *   Returns null when the envelope is not a fee-bump transaction.
 */
export function parseFeeBump(envelopeXdr) {
  try {
    const env = typeof envelopeXdr === "string" ? xdr.TransactionEnvelope.fromXDR(envelopeXdr, "base64") : envelopeXdr;

    if (env.switch() !== xdr.EnvelopeType.envelopeTypeTxFeeBump()) return null;

    const fbTx = env.feeBump().tx();
    const sponsor = muxedToGAddress(fbTx.feeSource());

    const innerTx = fbTx.innerTx().v1().tx();
    const inner_source = muxedToGAddress(innerTx.sourceAccount());
    const actual_caller = extractActualCaller(innerTx);

    return { sponsor, inner_source, actual_caller };
  } catch {
    return null;
  }
}
