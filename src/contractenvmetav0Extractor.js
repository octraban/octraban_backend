/**
 * contractenvmetav0Extractor.js
 *
 * Extracts the platform/SDK version from contractenvmetav0 WASM section
 */

const WASM_MAGIC = 0x0061736d; // "\0asm"

function readLEB128(buf, offset) {
  let result = 0,
    shift = 0,
    byte;
  do {
    byte = buf[offset++];
    result |= (byte & 0x7f) << shift;
    shift += 7;
  } while (byte & 0x80);
  return { value: result, offset };
}

/**
 * Extract contractenvmetav0 section from WASM binary
 * @param {Buffer|Uint8Array} wasm - WASM binary
 * @returns {object|null} { majorVersion, minorVersion, patchVersion } or null if not found
 */
export function extractPlatformVersion(wasm) {
  const buf = Buffer.isBuffer(wasm) ? wasm : Buffer.from(wasm);

  if (buf.length < 8 || buf.readUInt32BE(0) !== WASM_MAGIC) {
    return null;
  }

  let pos = 8; // skip magic (4) + version (4)

  while (pos < buf.length) {
    const sectionId = buf[pos++];
    const { value: sectionSize, offset: afterSize } = readLEB128(buf, pos);
    pos = afterSize;
    const sectionEnd = pos + sectionSize;

    // Custom section (id=0) with name
    if (sectionId === 0) {
      const { value: nameLen, offset: nameStart } = readLEB128(buf, pos);
      const nameEnd = nameStart + nameLen;
      const name = buf.toString("utf8", nameStart, nameEnd);
      const payloadStart = nameEnd;

      if (name === "contractenvmetav0" && payloadStart + 3 <= sectionEnd) {
        // Read 3 bytes: major, minor, patch
        const major = buf[payloadStart];
        const minor = buf[payloadStart + 1];
        const patch = buf[payloadStart + 2];
        return {
          majorVersion: major,
          minorVersion: minor,
          patchVersion: patch,
        };
      }
    }

    pos = sectionEnd;
  }

  return null;
}

/**
 * Format platform version as string
 * @param {object} version - { majorVersion, minorVersion, patchVersion }
 * @returns {string} e.g. "v2.1.0"
 */
export function formatPlatformVersion(version) {
  if (!version) return "Unknown";
  const { majorVersion, minorVersion, patchVersion } = version;
  return `v${majorVersion}.${minorVersion}.${patchVersion}`;
}
