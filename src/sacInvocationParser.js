import { xdr, StrKey, scValToNative } from "@stellar/stellar-sdk";

/**
 * SAC (Stellar Asset Contract) internal invocation operations and their
 * human-readable operational tags.
 *
 * The native SAC maps directly to classic asset trustlines, so its internal
 * operations differ from standard SEP-41 user-deployed tokens.
 */
const SAC_OP_TAGS = {
  mint: "SAC Action: Minted Classic Asset to Soroban Account",
  burn: "SAC Action: Burned Soroban Balance to Classic Asset",
  transfer: "SAC Action: Transferred Classic Asset Between Accounts",
  clawback: "SAC Action: Clawback of Classic Asset Trustline Balance",
  set_admin: "SAC Action: Updated Asset Administrator",
  set_authorized: "SAC Action: Updated Asset Authorization Trustline",
  approve: "SAC Action: Approved Classic Asset Allowance",
  allowance: "SAC Action: Queried Classic Asset Allowance",
  balance: "SAC Action: Queried Classic Asset Balance",
  decimals: "SAC Action: Queried Asset Decimals",
  name: "SAC Action: Queried Asset Name",
  symbol: "SAC Action: Queried Asset Symbol",
  total_supply: "SAC Action: Queried Total Supply",
};

/**
 * Parse a SAC internal invocation from a HostFunction XDR.
 *
 * @param {string} base64Xdr - base64-encoded HostFunction XDR
 * @returns {{
 *   contractId: string,
 *   functionName: string,
 *   operationalTag: string,
 *   args: Array,
 *   isSacInternal: boolean
 * }}
 */
export function parseSacInvocation(base64Xdr) {
  const hf = xdr.HostFunction.fromXDR(base64Xdr, "base64");

  if (hf.switch().name !== "hostFunctionTypeInvokeContract") {
    throw new Error(`Expected hostFunctionTypeInvokeContract, got ${hf.switch().name}`);
  }

  const invoke = hf.invokeContract();
  const contractId = StrKey.encodeContract(invoke.contractAddress().contractId());
  const functionName = invoke.functionName().toString();
  const args = invoke.args().map((a) => {
    try {
      return scValToNative(a);
    } catch {
      return a.switch().name;
    }
  });

  const operationalTag = SAC_OP_TAGS[functionName] ?? `SAC Action: ${functionName}`;
  const isSacInternal = functionName in SAC_OP_TAGS;

  return { contractId, functionName, operationalTag, args, isSacInternal };
}

/**
 * Build a human-readable description for a SAC invocation.
 *
 * @param {string} functionName
 * @param {Array} args  decoded scVal args
 * @param {string} assetCode  classic asset code (e.g. "USDC", "XLM")
 * @returns {string}
 */
export function describeSacInvocation(functionName, args, assetCode = "asset") {
  const fmt = (addr) =>
    typeof addr === "string" && addr.length > 10 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : String(addr ?? "?");

  switch (functionName) {
    case "mint": {
      const [admin, to, amount] = args;
      return `SAC Action: Minted ${amount ?? "?"} ${assetCode} to ${fmt(to ?? admin)}`;
    }
    case "burn": {
      const [from, amount] = args;
      return `SAC Action: Burned ${amount ?? "?"} ${assetCode} from ${fmt(from)}`;
    }
    case "transfer": {
      const [from, to, amount] = args;
      return `SAC Action: Transferred ${amount ?? "?"} ${assetCode} from ${fmt(from)} to ${fmt(to)}`;
    }
    case "clawback": {
      const [admin, from, amount] = args;
      return `SAC Action: Clawback of ${amount ?? "?"} ${assetCode} from ${fmt(from)} by ${fmt(admin)}`;
    }
    case "set_admin": {
      const [admin, newAdmin] = args;
      return `SAC Action: Updated Asset Administrator from ${fmt(admin)} to ${fmt(newAdmin)}`;
    }
    case "set_authorized": {
      const [admin, trustor, authorized] = args;
      return `SAC Action: Updated Asset Authorization Trustline for ${fmt(trustor)} → ${authorized ? "authorized" : "deauthorized"} by ${fmt(admin)}`;
    }
    case "approve": {
      const [from, spender, amount, expiry] = args;
      return `SAC Action: Approved ${amount ?? "?"} ${assetCode} allowance for ${fmt(spender)} from ${fmt(from)}${expiry != null ? ` (expires ledger ${expiry})` : ""}`;
    }
    default:
      return SAC_OP_TAGS[functionName] ?? `SAC Action: ${functionName}(${args.map(String).join(", ")})`;
  }
}
