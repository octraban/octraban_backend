/**
 * TTL Extension Parser Tests
 * Issue #63: Parse and Label StateRent & TTL Modifications
 */

const {
  parseTTLExtension,
  extractTTLModifications,
  calculateRentPaid,
} = require("../src/ttlExtensionParser");

describe("TTL Extension Parser", () => {
  describe("parseTTLExtension", () => {
    test("parses ExtendCurrentContractInstance operation", () => {
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

      expect(result.operationType).toBe("ExtendCurrentContractInstance");
      expect(result.targetKey).toBe("CONTRACT123");
      expect(result.extendToLedger).toBe(100000);
      expect(result.costXlm).toBeCloseTo(0.0015, 5);
    });

    test("parses ExtendCurrentContractCode operation", () => {
      const operation = {
        type: "extendContractCode",
        codeHash: "HASH123",
        extendTo: 150000,
      };

      const result = parseTTLExtension(operation);

      expect(result.operationType).toBe("ExtendCurrentContractCode");
      expect(result.targetKey).toBe("HASH123");
      expect(result.extendToLedger).toBe(150000);
    });

    test("returns empty result for invalid operation", () => {
      const result = parseTTLExtension(null);

      expect(result.operationType).toBeNull();
      expect(result.targetKey).toBeNull();
    });
  });

  describe("extractTTLModifications", () => {
    test("extracts all TTL modifications from transaction", () => {
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

      expect(result).toHaveLength(2);
      expect(result[0].operationType).toBe("ExtendCurrentContractCode");
      expect(result[1].operationType).toBe("ExtendCurrentContractInstance");
    });
  });

  describe("calculateRentPaid", () => {
    test("calculates rent paid in stroops", () => {
      const extensionOp = { costXlm: 0.5 };
      const rent = calculateRentPaid(extensionOp);

      expect(rent).toBe(5_000_000);
    });

    test("returns 0 for missing cost", () => {
      const rent = calculateRentPaid({});
      expect(rent).toBe(0);
    });
  });
});
