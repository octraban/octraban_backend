/**
 * TTL Extension Parser Tests — Protocol 26
 */

const {
  parseTTLHostFunction,
  extractTTLExtensions,
  formatTTLExtension,
} = require("../src/ttlExtensionParser");

describe("parseTTLHostFunction", () => {
  test("parses Protocol 26 extend_contract_instance_ttl with all three fields", () => {
    const result = parseTTLHostFunction({
      function_name: "extend_contract_instance_ttl",
      args: { extend_to: 500000, min_extension: 17280, max_extension: 34560 },
    });

    expect(result).not.toBeNull();
    expect(result.fn_name).toBe("extend_contract_instance_ttl");
    expect(result.extend_to).toBe(500000);
    expect(result.min_extension).toBe(17280);
    expect(result.max_extension).toBe(34560);
  });

  test("parses Protocol 26 extend_contract_code_ttl with top-level fields", () => {
    const result = parseTTLHostFunction({
      function_name: "extend_contract_code_ttl",
      extend_to: 600000,
      min_extension: 8640,
      max_extension: 17280,
    });

    expect(result).not.toBeNull();
    expect(result.extend_to).toBe(600000);
    expect(result.min_extension).toBe(8640);
    expect(result.max_extension).toBe(17280);
  });

  test("parses generic extend_ttl alias", () => {
    const result = parseTTLHostFunction({
      function_name: "extend_ttl",
      args: { extend_to: 400000, min_extension: 5000, max_extension: 10000 },
    });

    expect(result).not.toBeNull();
    expect(result.fn_name).toBe("extend_ttl");
  });

  test("accepts camelCase field aliases (extendTo, minExtension, maxExtension)", () => {
    const result = parseTTLHostFunction({
      function_name: "extend_ttl",
      extendTo: 300000,
      minExtension: 1000,
      maxExtension: 2000,
    });

    expect(result).not.toBeNull();
    expect(result.extend_to).toBe(300000);
    expect(result.min_extension).toBe(1000);
    expect(result.max_extension).toBe(2000);
  });

  test("returns null for non-TTL host function", () => {
    expect(parseTTLHostFunction({ function_name: "transfer", args: {} })).toBeNull();
  });

  test("returns null when no Protocol 26 fields are present", () => {
    // Has the right name but no actual parameters — not a valid record
    expect(parseTTLHostFunction({ function_name: "extend_ttl" })).toBeNull();
  });

  test("returns null for null input", () => {
    expect(parseTTLHostFunction(null)).toBeNull();
  });

  test("handles partial fields — only extend_to present", () => {
    const result = parseTTLHostFunction({
      function_name: "extend_ttl",
      args: { extend_to: 200000 },
    });

    expect(result).not.toBeNull();
    expect(result.extend_to).toBe(200000);
    expect(result.min_extension).toBeNull();
    expect(result.max_extension).toBeNull();
  });
});

describe("extractTTLExtensions", () => {
  test("extracts Protocol 26 TTL extension from transaction operations", () => {
    const tx = {
      ledger: 50000,
      hash: "TXHASH123",
      timestamp: Date.now(),
      operations: [
        {
          hostFunction: {
            function_name: "extend_contract_instance_ttl",
            args: { extend_to: 500000, min_extension: 17280, max_extension: 34560 },
          },
        },
      ],
    };

    const results = extractTTLExtensions(tx);

    expect(results).toHaveLength(1);
    expect(results[0].extend_to).toBe(500000);
    expect(results[0].min_extension).toBe(17280);
    expect(results[0].max_extension).toBe(34560);
    expect(results[0].ledger).toBe(50000);
    expect(results[0].tx_hash).toBe("TXHASH123");
  });

  test("extracts multiple TTL extensions from one transaction", () => {
    const tx = {
      ledger: 60000,
      hash: "TXHASH456",
      operations: [
        {
          hostFunction: {
            function_name: "extend_contract_instance_ttl",
            args: { extend_to: 500000, min_extension: 17280, max_extension: 34560 },
          },
        },
        {
          hostFunction: {
            function_name: "extend_contract_code_ttl",
            args: { extend_to: 510000, min_extension: 17280, max_extension: 34560 },
          },
        },
      ],
    };

    expect(extractTTLExtensions(tx)).toHaveLength(2);
  });

  test("handles legacy extendContractCode operation shape", () => {
    const tx = {
      ledger: 40000,
      hash: "LEGACY",
      operations: [{ type: "extendContractCode", extendTo: 100000 }],
    };

    const results = extractTTLExtensions(tx);

    expect(results).toHaveLength(1);
    expect(results[0].extend_to).toBe(100000);
    expect(results[0].min_extension).toBeNull();
  });

  test("returns empty array for transaction with no TTL operations", () => {
    const tx = {
      ledger: 1,
      hash: "X",
      operations: [{ type: "transfer", amount: 100 }],
    };

    expect(extractTTLExtensions(tx)).toHaveLength(0);
  });

  test("returns empty array for null input", () => {
    expect(extractTTLExtensions(null)).toHaveLength(0);
  });
});

describe("formatTTLExtension", () => {
  test("formats all three Protocol 26 fields", () => {
    const label = formatTTLExtension({ extend_to: 500000, min_extension: 17280, max_extension: 34560 });

    expect(label).toBe("Action: TTL Extension | Requested: +17280 Ledgers | Enforced Clamp: 34560 Ledgers | Extend To: 500000");
  });

  test("omits absent fields", () => {
    const label = formatTTLExtension({ extend_to: null, min_extension: 17280, max_extension: null });

    expect(label).toBe("Action: TTL Extension | Requested: +17280 Ledgers");
  });

  test("returns base label when all fields are null", () => {
    expect(formatTTLExtension({ extend_to: null, min_extension: null, max_extension: null }))
      .toBe("Action: TTL Extension");
  });
});
