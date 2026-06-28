import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { xdr } from "@stellar/stellar-sdk";
import { extractWasm, extractWasmHash } from "../src/wasm_extractor.js";

const WASM_HASH_BYTES = Buffer.alloc(32, 0xde);

function makeCreateContractWasm() {
  const preimage = xdr.ContractIdPreimage.contractIdPreimageFromAddress(
    new xdr.ContractIdPreimageFromAddress({
      address: xdr.ScAddress.scAddressTypeContract(Buffer.alloc(32, 0xaa)),
      salt: Buffer.alloc(32, 0),
    })
  );
  return xdr.HostFunction.hostFunctionTypeCreateContract(
    new xdr.CreateContractArgs({
      contractIdPreimage: preimage,
      executable: xdr.ContractExecutable.contractExecutableWasm(WASM_HASH_BYTES),
    })
  ).toXDR("base64");
}

function makeCreateContractStellarAsset() {
  const preimage = xdr.ContractIdPreimage.contractIdPreimageFromAddress(
    new xdr.ContractIdPreimageFromAddress({
      address: xdr.ScAddress.scAddressTypeContract(Buffer.alloc(32, 0xbb)),
      salt: Buffer.alloc(32, 0),
    })
  );
  return xdr.HostFunction.hostFunctionTypeCreateContract(
    new xdr.CreateContractArgs({
      contractIdPreimage: preimage,
      executable: xdr.ContractExecutable.contractExecutableStellarAsset(),
    })
  ).toXDR("base64");
}

function makeUploadWasm() {
  return xdr.HostFunction.hostFunctionTypeUploadContractWasm(
    Buffer.from([0x00, 0x61, 0x73, 0x6d]) // WASM magic
  ).toXDR("base64");
}

describe("extractWasm", () => {
  it("extracts wasmBytes from a WASM executable", () => {
    const result = extractWasm(makeCreateContractWasm());
    assert.equal(result.type, "wasmBytes");
    assert.ok(Array.isArray(result.value));
    assert.equal(result.value.length, 32);
    assert.ok(result.value.every((b) => b === 0xde));
  });

  it("returns stellarAsset type for Stellar asset contracts", () => {
    const result = extractWasm(makeCreateContractStellarAsset());
    assert.equal(result.type, "stellarAsset");
    assert.equal(result.value, null);
  });

  it("throws for non-CreateContract host functions", () => {
    assert.throws(() => extractWasm(makeUploadWasm()), /hostFunctionTypeCreateContract/);
  });
});

describe("extractWasmHash", () => {
  it("extracts hex-encoded WASM bytes from an upload function", () => {
    const result = extractWasmHash(makeUploadWasm());
    assert.equal(result.type, "wasmHash");
    assert.equal(result.value, "0061736d");
  });

  it("throws for non-upload host functions", () => {
    assert.throws(() => extractWasmHash(makeCreateContractWasm()), /hostFunctionTypeUploadContractWasm/);
  });
});
