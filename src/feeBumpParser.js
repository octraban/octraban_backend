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
 * Decode a SorobanCredentials object to a signer address string.
 * Returns null for implicit source-account authorization.
 * @param {xdr.SorobanCredentials} creds
 * @returns {string|null}
 */
function callerFromCredentials(creds) {
  if (creds.switch().name === "sorobanCredentialsSourceAccount") return null;
  try {
    const scAddr = creds.address().address();
    const addrType = scAddr.switch().name;
    if (addrType === "scAddressTypeAccount") {
      return StrKey.encodeEd25519PublicKey(scAddr.accountId().ed25519());
    }
    if (addrType === "scAddressTypeContract") {
      return StrKey.encodeContract(scAddr.contractId());
    }
    return null;
  } catch { return null; }
}

/**
 * Inspect a TransactionEnvelope for a Fee-Bump wrapper and extract the full
 * three-tier "Chain of Custody":
 *   Tier 1 — Sponsor Wallet:  outer fee-bump feeSource (pays the network fee)
 *   Tier 2 — Channel Account: inner tx sourceAccount (provides sequence number)
 *   Tier 3 — Actual Caller:   first explicit SorobanCredentials signer found
 *                              in any invokeHostFunction authorization array
 *
 * @param {xdr.TransactionEnvelope | string} envelopeXdr
 *   Accepts an already-decoded XDR object OR a base64-encoded string.
 * @returns {{ sponsor: string, channel_account: string, actual_caller: string|null } | null}
 *   Returns null when the envelope is not a fee-bump transaction.
 */
export function parseFeeBump(envelopeXdr) {
  try {
    const env =
      typeof envelopeXdr === "string"
        ? xdr.TransactionEnvelope.fromXDR(envelopeXdr, "base64")
        : envelopeXdr;

    if (env.switch() !== xdr.EnvelopeType.envelopeTypeTxFeeBump()) return null;

    const fbTx = env.feeBump().tx();
    const sponsor = muxedToGAddress(fbTx.feeSource());

    const innerTx = fbTx.innerTx().v1().tx();
    const channel_account = muxedToGAddress(innerTx.sourceAccount());

    // Walk inner operations to find the first explicit Soroban authorization signer
    let actual_caller = null;
    try {
      const ops = innerTx.operations() ?? [];
      outer: for (const op of ops) {
        const body = op.body();
        if (body.switch().name !== "invokeHostFunction") continue;
        const auths = body.invokeHostFunction().auth() ?? [];
        for (const authEntry of auths) {
          const caller = callerFromCredentials(authEntry.credentials());
          if (caller) { actual_caller = caller; break outer; }
        }
      }
    } catch { /* leave actual_caller null */ }

    return { sponsor, channel_account, actual_caller };
  } catch {
    return null;
  }
}
