import { test } from "node:test";
import assert from "node:assert";
import { extractPlatformVersion, formatPlatformVersion } from "../src/contractenvmetav0Extractor.js";

test("contractenvmetav0Extractor", async (t) => {
  await t.test("formatPlatformVersion returns version string", () => {
    const version = { majorVersion: 2, minorVersion: 1, patchVersion: 0 };
    const result = formatPlatformVersion(version);
    assert.strictEqual(result, "v2.1.0");
  });

  await t.test("formatPlatformVersion returns Unknown for null", () => {
    const result = formatPlatformVersion(null);
    assert.strictEqual(result, "Unknown");
  });

  await t.test("extractPlatformVersion returns null for invalid WASM", () => {
    const result = extractPlatformVersion(Buffer.from([0x00, 0x00, 0x00]));
    assert.strictEqual(result, null);
  });
});
