/**
 * Key Manager — Admin Service Layer
 *
 * Business-logic functions for managing api_keys records.
 * These are pure service functions (not Express route handlers).
 *
 * All functions throw on validation failure or unexpected DB errors.
 * Callers (route handlers) are responsible for mapping errors to HTTP responses.
 */

import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const BCRYPT_COST = 12;
const VALID_TIERS = ['unauthenticated', 'free', 'pro', 'enterprise'];
const UPDATABLE_FIELDS = [
  'name',
  'tier',
  'rate_limit',
  'allowed_ips',
  'allowed_endpoints',
  'expires_at',
  'revoked',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Generate a cryptographically random API key as URL-safe base64.
 * 32 bytes → 43 characters (no padding).
 * @returns {string}
 */
function generateRawKey() {
  return crypto
    .randomBytes(32)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Strip `key_hash` from a database row before returning it to callers.
 * @param {object} row
 * @returns {object}
 */
function stripKeyHash(row) {
  if (!row) return row;
  const { key_hash, ...rest } = row; // eslint-disable-line no-unused-vars
  return rest;
}

// ── listKeys ──────────────────────────────────────────────────────────────────

/**
 * Return a paginated list of API keys (excluding `key_hash`).
 *
 * @param {number} [page=1]
 * @param {number} [limit=50]
 * @returns {Promise<{ data: object[], total: number, page: number, limit: number }>}
 */
async function listKeys(page = 1, limit = 50) {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(Math.max(1, Number(limit) || 50), 200);
  const offset = (safePage - 1) * safeLimit;

  const [{ rows }, { rows: countRows }] = await Promise.all([
    pool.query(
      `SELECT id, name, key_prefix, tier, rate_limit,
              allowed_ips, allowed_endpoints, expires_at,
              revoked, last_used_at, usage_count, created_at, updated_at
       FROM api_keys
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [safeLimit, offset],
    ),
    pool.query('SELECT COUNT(*)::INT AS total FROM api_keys'),
  ]);

  return {
    data: rows,
    total: countRows[0].total,
    page: safePage,
    limit: safeLimit,
  };
}

// ── createKey ─────────────────────────────────────────────────────────────────

/**
 * Create a new API key.
 *
 * @param {object} data
 * @param {string} data.name            — required, non-empty
 * @param {string} [data.tier='free']
 * @param {number} [data.rate_limit]
 * @param {string[]} [data.allowed_ips]
 * @param {string[]} [data.allowed_endpoints]
 * @param {string} [data.expires_at]   — ISO-8601 timestamp
 * @returns {Promise<{ key: string, record: object }>}
 */
async function createKey(data) {
  const { name, tier = 'free', rate_limit, allowed_ips, allowed_endpoints, expires_at } = data ?? {};

  // Validate required fields.
  if (!name || typeof name !== 'string' || name.trim() === '') {
    throw new Error('name is required and must be a non-empty string');
  }

  if (!VALID_TIERS.includes(tier)) {
    throw new Error(`tier must be one of: ${VALID_TIERS.join(', ')}`);
  }

  if (rate_limit !== undefined && rate_limit !== null) {
    const rateNum = Number(rate_limit);
    if (!Number.isInteger(rateNum) || rateNum <= 0) {
      throw new Error('rate_limit must be a positive integer');
    }
  }

  // Generate key material.
  const rawKey = generateRawKey();
  const keyPrefix = rawKey.slice(0, 8);
  const keyHash = await bcrypt.hash(rawKey, BCRYPT_COST);

  const { rows } = await pool.query(
    `INSERT INTO api_keys
       (name, key_hash, key_prefix, tier, rate_limit, allowed_ips, allowed_endpoints, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, name, key_prefix, tier, rate_limit,
               allowed_ips, allowed_endpoints, expires_at,
               revoked, last_used_at, usage_count, created_at, updated_at`,
    [
      name.trim(),
      keyHash,
      keyPrefix,
      tier,
      rate_limit ?? null,
      allowed_ips ? JSON.stringify(allowed_ips) : null,
      allowed_endpoints ? JSON.stringify(allowed_endpoints) : null,
      expires_at ?? null,
    ],
  );

  return { key: rawKey, record: rows[0] };
}

// ── updateKey ─────────────────────────────────────────────────────────────────

/**
 * Update allowed metadata fields on an existing key.
 *
 * @param {string} id   — UUID
 * @param {object} updates — subset of updatable fields
 * @returns {Promise<object>} updated record (without key_hash)
 */
async function updateKey(id, updates) {
  if (!id) throw new Error('id is required');
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    throw new Error('updates must be a non-null object');
  }

  // Filter to only allowed fields to prevent injection.
  const filtered = {};
  for (const field of UPDATABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(updates, field)) {
      filtered[field] = updates[field];
    }
  }

  if (Object.keys(filtered).length === 0) {
    throw new Error(`No updatable fields provided. Allowed fields: ${UPDATABLE_FIELDS.join(', ')}`);
  }

  // Validate tier if provided.
  if (filtered.tier !== undefined && !VALID_TIERS.includes(filtered.tier)) {
    throw new Error(`tier must be one of: ${VALID_TIERS.join(', ')}`);
  }

  // Build SET clause dynamically.
  const setClauses = [];
  const params = [];

  for (const [field, value] of Object.entries(filtered)) {
    params.push(value);
    setClauses.push(`${field} = $${params.length}`);
  }

  // Always bump updated_at.
  setClauses.push(`updated_at = NOW()`);

  params.push(id);
  const idParam = params.length;

  const { rows } = await pool.query(
    `UPDATE api_keys
     SET ${setClauses.join(', ')}
     WHERE id = $${idParam}
     RETURNING id, name, key_prefix, tier, rate_limit,
               allowed_ips, allowed_endpoints, expires_at,
               revoked, last_used_at, usage_count, created_at, updated_at`,
    params,
  );

  if (rows.length === 0) {
    throw new Error(`API key not found: ${id}`);
  }

  return stripKeyHash(rows[0]);
}

// ── deleteKey ─────────────────────────────────────────────────────────────────

/**
 * Soft-delete a key by setting revoked = true.
 *
 * @param {string} id — UUID
 * @returns {Promise<object>} updated record (without key_hash)
 */
async function deleteKey(id) {
  if (!id) throw new Error('id is required');

  const { rows } = await pool.query(
    `UPDATE api_keys
     SET revoked = TRUE, updated_at = NOW()
     WHERE id = $1
     RETURNING id, name, key_prefix, tier, rate_limit,
               allowed_ips, allowed_endpoints, expires_at,
               revoked, last_used_at, usage_count, created_at, updated_at`,
    [id],
  );

  if (rows.length === 0) {
    throw new Error(`API key not found: ${id}`);
  }

  return stripKeyHash(rows[0]);
}

// ── rotateKey ─────────────────────────────────────────────────────────────────

/**
 * Generate a new raw key for an existing record, replacing key_hash and key_prefix.
 *
 * @param {string} id — UUID
 * @returns {Promise<{ key: string, record: object }>}
 */
async function rotateKey(id) {
  if (!id) throw new Error('id is required');

  const rawKey = generateRawKey();
  const keyPrefix = rawKey.slice(0, 8);
  const keyHash = await bcrypt.hash(rawKey, BCRYPT_COST);

  const { rows } = await pool.query(
    `UPDATE api_keys
     SET key_hash = $1, key_prefix = $2, updated_at = NOW()
     WHERE id = $3
     RETURNING id, name, key_prefix, tier, rate_limit,
               allowed_ips, allowed_endpoints, expires_at,
               revoked, last_used_at, usage_count, created_at, updated_at`,
    [keyHash, keyPrefix, id],
  );

  if (rows.length === 0) {
    throw new Error(`API key not found: ${id}`);
  }

  return { key: rawKey, record: stripKeyHash(rows[0]) };
}

// ── getKeyUsage ───────────────────────────────────────────────────────────────

/**
 * Return daily usage history for a key.
 *
 * @param {string} id  — UUID
 * @param {number} [days=30]
 * @returns {Promise<object[]>}
 */
async function getKeyUsage(id, days = 30) {
  if (!id) throw new Error('id is required');

  const safeDays = Math.min(Math.max(1, Number(days) || 30), 365);

  const { rows } = await pool.query(
    `SELECT date, total_requests, endpoint_distribution,
            data_transfer_mb, rate_limit_hits, peak_concurrent
     FROM api_key_usage_daily
     WHERE api_key_id = $1
     ORDER BY date DESC
     LIMIT $2`,
    [id, safeDays],
  );

  return rows;
}

export { listKeys, createKey, updateKey, deleteKey, rotateKey, getKeyUsage };
