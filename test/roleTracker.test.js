import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractRoleAssignment } from "../src/roleTracker.js";

function ev(topics, rawData = null) {
  return {
    raw_topics: topics,
    raw_data: rawData ? JSON.stringify(rawData) : null,
  };
}

const ADDR = "GABC1234567890ABCDEF";

describe("extractRoleAssignment", () => {
  // ── Named-role events ──────────────────────────────────────────────────────

  it("detects set_admin with address in topic[1]", () => {
    const result = extractRoleAssignment(ev(["set_admin", ADDR]));
    assert.deepEqual(result, { role: "admin", address: ADDR, revoked: false });
  });

  it("detects admin_changed with address in topic[1]", () => {
    const result = extractRoleAssignment(ev(["admin_changed", ADDR]));
    assert.deepEqual(result, { role: "admin", address: ADDR, revoked: false });
  });

  it("detects new_admin with address in topic[2]", () => {
    const result = extractRoleAssignment(ev(["new_admin", "old_addr", ADDR]));
    assert.deepEqual(result, { role: "admin", address: "old_addr", revoked: false });
  });

  it("detects set_minter", () => {
    const result = extractRoleAssignment(ev(["set_minter", ADDR]));
    assert.deepEqual(result, { role: "minter", address: ADDR, revoked: false });
  });

  it("detects minter_added", () => {
    const result = extractRoleAssignment(ev(["minter_added", ADDR]));
    assert.deepEqual(result, { role: "minter", address: ADDR, revoked: false });
  });

  it("detects set_manager", () => {
    const result = extractRoleAssignment(ev(["set_manager", ADDR]));
    assert.deepEqual(result, { role: "manager", address: ADDR, revoked: false });
  });

  it("detects set_pauser", () => {
    const result = extractRoleAssignment(ev(["set_pauser", ADDR]));
    assert.deepEqual(result, { role: "pauser", address: ADDR, revoked: false });
  });

  // ── Generic role_granted / role_revoked / role_set ─────────────────────────

  it("detects role_granted with role and address in topics", () => {
    const result = extractRoleAssignment(ev(["role_granted", "minter", ADDR]));
    assert.deepEqual(result, { role: "minter", address: ADDR, revoked: false });
  });

  it("detects role_revoked and sets revoked=true", () => {
    const result = extractRoleAssignment(ev(["role_revoked", "admin", ADDR]));
    assert.deepEqual(result, { role: "admin", address: ADDR, revoked: true });
  });

  it("detects role_set", () => {
    const result = extractRoleAssignment(ev(["role_set", "manager", ADDR]));
    assert.deepEqual(result, { role: "manager", address: ADDR, revoked: false });
  });

  // ── Address fallback from raw_data ─────────────────────────────────────────

  it("falls back to raw_data.address when topic[1] is missing", () => {
    const result = extractRoleAssignment(ev(["set_admin"], { address: ADDR }));
    assert.deepEqual(result, { role: "admin", address: ADDR, revoked: false });
  });

  it("falls back to raw_data.new_admin", () => {
    const result = extractRoleAssignment(ev(["admin_changed"], { new_admin: ADDR }));
    assert.deepEqual(result, { role: "admin", address: ADDR, revoked: false });
  });

  // ── Non-role events return null ────────────────────────────────────────────

  it("returns null for unrelated events", () => {
    assert.equal(extractRoleAssignment(ev(["transfer", ADDR, "GDEST", "100"])), null);
  });

  it("returns null for empty topics", () => {
    assert.equal(extractRoleAssignment(ev([])), null);
  });

  it("returns null when address cannot be resolved", () => {
    assert.equal(extractRoleAssignment(ev(["set_admin"])), null);
  });

  it("returns null for role_granted with no address topic", () => {
    assert.equal(extractRoleAssignment(ev(["role_granted", "admin"])), null);
  });
});
