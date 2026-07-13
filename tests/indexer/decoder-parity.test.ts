/**
 * Regression fixture for issue #6 — consolidate the duplicated XDR decoder
 * implementations.
 *
 * `indexer/src/decoder.js` (authoritative — consumed by octraban_frontend)
 * and `src/indexer/sep41-parser.ts` (used by the API service) each render
 * human-readable SEP-41 event descriptions independently. This test asserts
 * the TS side renders byte-for-byte identical output to the fixed fixture
 * set; `indexer/tests/decoder-parity.test.js` asserts the same fixture set
 * against the JS side. If either implementation's wording drifts, its half
 * of this fixture pair fails — catching the exact risk the issue describes.
 */
import { describe, it, expect } from 'vitest';
import { SEP41_EVENTS, renderSep41Template } from '../../src/indexer/sep41-parser';
import fixtures from '../fixtures/decoder-event-parity.json';

describe('decoder parity fixtures (issue #6)', () => {
  for (const testCase of fixtures.cases) {
    it(`renders "${testCase.function}" identically to indexer/src/decoder.js`, () => {
      const def = SEP41_EVENTS[testCase.function];
      expect(def).toBeDefined();

      const fields = Object.fromEntries(
        Object.entries(testCase.values).map(([key, value]) => [
          key,
          { raw: value, formatted: String(value) },
        ]),
      );

      const rendered = renderSep41Template(
        def.humanTemplate,
        fields,
        7,
        testCase.token,
        testCase.contractName,
      );

      expect(rendered).toBe(testCase.expected);
    });
  }
});
