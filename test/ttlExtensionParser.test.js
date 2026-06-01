/**
 * TTL Extension Parser Tests
 * Issue #63: Parse and Label StateRent & TTL Modifications
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

      const result = parseTTLExtension(operation);

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

      const result = parseTTLExtension(operation);

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
          {
            type: "extendContractInstance",
            contractId: "CONTRACT1",
            extendTo: 100500,
          },
        ],
      };

      const result = extractTTLModifications(transaction);

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
