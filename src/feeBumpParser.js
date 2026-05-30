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
 * Inspect a TransactionEnvelope for a Fee-Bump wrapper.
 *
 * A Stellar Fee-Bump transaction encloses an inner transaction so that an
 * external account (the sponsor) pays the network fee instead of the inner
 * transaction's source account (the caller).  We extract both parties so the
 * explorer can display:
 *   "Paid by Sponsor: GABC… on behalf of Caller: GXYZ…"
 *
 * @param {xdr.TransactionEnvelope | string} envelopeXdr
 *   Accepts an already-decoded XDR object OR a base64-encoded string.
 * @returns {{ sponsor: string, inner_source: string } | null}
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
    const inner_source = muxedToGAddress(innerTx.sourceAccount());

    return { sponsor, inner_source };
  } catch {
    return null;
  }
}
