/**
 * TTL Extension Parser Tests — Protocol 26
 */

import {
  parseTTLExtension,
  extractTTLModifications,
  calculateRentPaid,
} from "../src/ttlExtensionParser.js";
import assert from "node:assert/strict";
import test from "node:test";

test("TTL Extension Parser: parseTTLExtension - parses ExtendCurrentContractInstance operation", () => {
      const operation = {
        ext: { v: 1 },
        contractId: "CONTRACT123",
        extendTo: 100000,
        meta: {
          result: {
            costOuter: { cpuInstrs: 1000, memBytes: 500 },
          },
        },
      };

    expect(result).not.toBeNull();
    expect(result.fn_name).toBe("extend_contract_instance_ttl");
    expect(result.extend_to).toBe(500000);
    expect(result.min_extension).toBe(17280);
    expect(result.max_extension).toBe(34560);
  });

      assert.equal(result.operationType, "ExtendCurrentContractInstance");
      assert.equal(result.targetKey, "CONTRACT123");
      assert.equal(result.extendToLedger, 100000);
      assert.ok(Math.abs(result.costXlm - 0.0015) < 1e-5);
    });

    test("TTL Extension Parser: parseTTLExtension - parses ExtendCurrentContractCode operation", () => {
      const operation = {
        type: "extendContractCode",
        codeHash: "HASH123",
        extendTo: 150000,
      };

  test("parses generic extend_ttl alias", () => {
    const result = parseTTLHostFunction({
      function_name: "extend_ttl",
      args: { extend_to: 400000, min_extension: 5000, max_extension: 10000 },
    });

      assert.equal(result.operationType, "ExtendCurrentContractCode");
      assert.equal(result.targetKey, "HASH123");
      assert.equal(result.extendToLedger, 150000);
    });

    test("TTL Extension Parser: parseTTLExtension - returns empty result for invalid operation", () => {
      const result = parseTTLExtension(null);

      assert.equal(result.operationType, null);
      assert.equal(result.targetKey, null);
    });

    test("TTL Extension Parser: extractTTLModifications - extracts all TTL modifications from transaction", () => {
      const transaction = {
        ledger: 50000,
        hash: "TXHASH123",
        timestamp: Date.now(),
        operations: [
          {
            type: "extendContractCode",
            codeHash: "HASH1",
            extendTo: 100000,
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

      assert.equal(result.length, 2);
      assert.equal(result[0].operationType, "ExtendCurrentContractCode");
      assert.equal(result[1].operationType, "ExtendCurrentContractInstance");
    });

    test("TTL Extension Parser: calculateRentPaid - calculates rent paid in stroops", () => {
      const extensionOp = { costXlm: 0.5 };
      const rent = calculateRentPaid(extensionOp);

      assert.equal(rent, 5_000_000);
    });

    test("TTL Extension Parser: calculateRentPaid - returns 0 for missing cost", () => {
      const rent = calculateRentPaid({});
      assert.equal(rent, 0);
    });
