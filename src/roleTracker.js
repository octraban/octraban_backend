/**
 * roleTracker.js
 *
 * Detects privileged role-assignment events from decoded Soroban event topics
 * and extracts (role, address) pairs for persistence.
 *
 * Recognised patterns (case-insensitive topic[0]):
 *   set_admin / admin_changed / new_admin  → role "admin"
 *   set_manager / manager_set             → role "manager"
 *   set_minter / minter_added             → role "minter"
 *   set_pauser / pauser_set               → role "pauser"
 *   role_granted / role_revoked           → role from topic[1], revoked flag
 *   role_set                              → role from topic[1]
 */

/** Map of event-name patterns → canonical role name. */
const ROLE_EVENT_MAP = {
  set_admin:       "admin",
  admin_changed:   "admin",
  new_admin:       "admin",
  admin_set:       "admin",
  set_manager:     "manager",
  manager_set:     "manager",
  set_minter:      "minter",
  minter_added:    "minter",
  set_pauser:      "pauser",
  pauser_set:      "pauser",
};

/**
 * Inspect a decoded event's topics/data and return a role assignment if found.
 *
 * @param {{ raw_topics: string[], raw_data: string }} ev  Decoded event record
 * @returns {{ role: string, address: string, revoked: boolean } | null}
 */
export function extractRoleAssignment(ev) {
  if (!Array.isArray(ev.raw_topics) || ev.raw_topics.length === 0) return null;

  const topic0 = String(ev.raw_topics[0]).toLowerCase();

  // Generic role_granted / role_revoked / role_set pattern
  // topic[0] = event name, topic[1] = role name, topic[2] = address
  if (topic0 === "role_granted" || topic0 === "role_revoked" || topic0 === "role_set") {
    const role    = ev.raw_topics[1] ? String(ev.raw_topics[1]).toLowerCase() : "unknown";
    const address = ev.raw_topics[2] ?? _parseAddress(ev.raw_data);
    if (!address) return null;
    return { role, address: String(address), revoked: topic0 === "role_revoked" };
  }

  // Named-role patterns
  const canonicalRole = ROLE_EVENT_MAP[topic0];
  if (canonicalRole) {
    // Address is typically topic[1] or topic[2]; fall back to raw_data
    const address = ev.raw_topics[1] ?? ev.raw_topics[2] ?? _parseAddress(ev.raw_data);
    if (!address) return null;
    return { role: canonicalRole, address: String(address), revoked: false };
  }

  return null;
}

/**
 * Try to pull an address string out of a raw_data JSON blob.
 * Looks for keys: address, new_admin, admin, to, account.
 */
function _parseAddress(rawData) {
  if (!rawData) return null;
  try {
    const obj = typeof rawData === "string" ? JSON.parse(rawData) : rawData;
    for (const key of ["address", "new_admin", "admin", "to", "account"]) {
      if (obj[key] && typeof obj[key] === "string") return obj[key];
    }
  } catch { /* not JSON */ }
  return null;
}
