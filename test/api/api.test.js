import request from "supertest";
import pg from "pg";

// Ensure process.env uses TEST_DATABASE_URL
const DB_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/soroban_test";
process.env.DATABASE_URL = DB_URL;
process.env.API_KEY = "test-api-key";

import { db } from "../../src/db.js";
import { startApi } from "../../src/api.js";

describe("REST API Integration Tests", () => {
  let app;
  let server;
  const wallet1 = "GBADY234567890123456789012345678901234567890123456789012";
  const wallet2 = "GBCUY234567890123456789012345678901234567890123456789012";

  beforeAll(async () => {
    // Initialize DB schema
    await db.init();

    // Clean tables to ensure isolation
    await db.query(`
      TRUNCATE events, contracts, daemon_state, sandboxes, token_holders, privileged_roles, wasm_build_metadata, source_verifications, storage_state_diffs, sub_invocations RESTART IDENTITY CASCADE
    `);

    // Seed 3 contracts
    await db.upsertContractMeta({
      id: "C1",
      name: "Contract One",
      description: "First contract details",
      functions: [{ name: "transfer", args: [] }],
      registered_by: "test-admin",
    });
    await db.upsertContractMeta({
      id: "C2",
      name: "Contract Two",
      description: "Second contract details",
      functions: [{ name: "mint", args: [] }],
      registered_by: "test-admin",
    });
    await db.upsertContractMeta({
      id: "C3",
      name: "Contract Three",
      description: "Third contract details",
      functions: [],
      registered_by: "test-admin",
    });

    // Seed 50 events
    for (let i = 1; i <= 50; i++) {
      const contractId = i % 3 === 1 ? "C1" : i % 3 === 2 ? "C2" : "C3";
      const fn = i % 2 === 0 ? "transfer" : "mint";
      const ledger = 1000 + i;
      const txHash = `tx_hash_${i}`;
      const description = `Event ${i} on ${contractId} calling ${fn} involving ${wallet1} and ${wallet2}`;
      const rawTopics = [wallet1, wallet2];
      const rawData = JSON.stringify({ amount: String(100 * i) });

      await db.query(
        `INSERT INTO events (contract_id, function, ledger, tx_hash, description, raw_topics, raw_data)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [contractId, fn, ledger, txHash, description, JSON.stringify(rawTopics), rawData]
      );
    }

    // Start Express app
    server = startApi();
    app = server;
  });

  afterAll(async () => {
    if (server && server.close) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  describe("GET /health", () => {
    it("should return 200 OK with comprehensive status when healthy", async () => {
      const res = await request(app).get("/health");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("status");
      expect(res.body).toHaveProperty("timestamp");
      expect(res.body).toHaveProperty("dependencies");
      expect(res.body.dependencies).toHaveProperty("database");
      expect(res.body.dependencies).toHaveProperty("cache");
      expect(res.body.dependencies).toHaveProperty("indexer");
      expect(res.body.dependencies).toHaveProperty("workers");
      expect(["healthy", "degraded"]).toContain(res.body.status);
    });

    it("should return 503 Service Unavailable when DB is failing", async () => {
      const originalQuery = db.query;
      db.query = jest.fn().mockRejectedValueOnce(new Error("DB Connection Error"));
      
      const res = await request(app).get("/health");
      expect(res.status).toBe(503);
      expect(res.body).toHaveProperty("status", "unhealthy");
      expect(res.body.dependencies.database.status).toBe("unhealthy");

      db.query = originalQuery;
    });
  });

  describe("GET /health/live", () => {
    it("should return 200 OK for liveness check", async () => {
      const res = await request(app).get("/health/live");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("status", "alive");
      expect(res.body).toHaveProperty("timestamp");
    });
  });

  describe("GET /health/ready", () => {
    it("should return 200 OK when service is ready", async () => {
      const res = await request(app).get("/health/ready");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("status", "ready");
      expect(res.body).toHaveProperty("timestamp");
      expect(res.body).toHaveProperty("dependencies");
    });

    it("should return 503 when service is not ready", async () => {
      const originalQuery = db.query;
      db.query = jest.fn().mockRejectedValueOnce(new Error("DB Connection Error"));
      
      const res = await request(app).get("/health/ready");
      expect(res.status).toBe(503);
      expect(res.body).toHaveProperty("status", "not_ready");
      expect(res.body).toHaveProperty("reason");

      db.query = originalQuery;
    });
  });

  describe("GET /api/events (Page-based)", () => {
    it("should return events list with page-based pagination", async () => {
      const res = await request(app).get("/api/events?page=1");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeLessThanOrEqual(25);
    });

    it("should filter events by contract", async () => {
      const res = await request(app).get("/api/events?contract=C1");
      expect(res.status).toBe(200);
      expect(res.body.every((ev) => ev.contract_id === "C1")).toBe(true);
    });

    it("should filter events by function name", async () => {
      const res = await request(app).get("/api/events?fn=transfer");
      expect(res.status).toBe(200);
      expect(res.body.every((ev) => ev.function === "transfer")).toBe(true);
    });
  });

  describe("GET /api/v1/events (Cursor-based)", () => {
    it("should return specified limit of items on page 1", async () => {
      const res = await request(app).get("/api/v1/events?limit=20");
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(20);
      expect(res.body.next_cursor).toBeDefined();
    });

    it("should paginate correctly using the next_cursor", async () => {
      // Fetch Page 1
      const res1 = await request(app).get("/api/v1/events?limit=20");
      const nextCursor = res1.body.next_cursor;
      expect(nextCursor).not.toBeNull();

      // Fetch Page 2
      const res2 = await request(app).get(`/api/v1/events?limit=20&after=${nextCursor}`);
      expect(res2.status).toBe(200);
      expect(res2.body.data.length).toBe(20);
      
      // Ensure there is no overlap (elements on Page 2 have lower seq numbers)
      const maxPage2Seq = Math.max(...res2.body.data.map((e) => Number(e.seq)));
      expect(maxPage2Seq).toBeLessThan(Number(nextCursor));
    });

    it("should return 422 for invalid limit values", async () => {
      const invalidLimits = ["-5", "0", "999", "abc"];
      for (const val of invalidLimits) {
        const res = await request(app).get(`/api/v1/events?limit=${val}`);
        expect(res.status).toBe(422);
        expect(res.body).toEqual({ error: "Invalid limit" });
      }
    });
  });

  describe("GET /api/events/:seq", () => {
    it("should return the event details for a known sequence", async () => {
      const res = await request(app).get("/api/events/5");
      expect(res.status).toBe(200);
      expect(Number(res.body.seq)).toBe(5);
      expect(res.body.contract_id).toBeDefined();
    });

    it("should return a 404 RFC 7807 response for an unknown sequence", async () => {
      const res = await request(app).get("/api/events/9999");
      expect(res.status).toBe(404);
      expect(res.body).toEqual({
        type: "about:blank",
        title: "Not Found",
        status: 404,
        detail: "Event sequence 9999 not found",
      });
    });
  });

  describe("GET /api/contracts/:id", () => {
    it("should return contract metadata for a registered contract", async () => {
      const res = await request(app).get("/api/contracts/C1");
      expect(res.status).toBe(200);
      expect(res.body.id).toBe("C1");
      expect(res.body.name).toBe("Contract One");
    });

    it("should return 404 for an unknown contract ID", async () => {
      const res = await request(app).get("/api/contracts/C9999");
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "Not found" });
    });
  });

  describe("POST /api/contracts", () => {
    it("should register a new contract successfully", async () => {
      const res = await request(app)
        .post("/api/contracts")
        .set("x-api-key", "test-api-key")
        .send({
          id: "C4",
          name: "Contract Four",
          description: "Fourth contract details",
          functions: [{ name: "burn", args: [] }],
        });
      expect(res.status).toBe(201);
      expect(res.body).toEqual({ ok: true });
    });

    it("should return 409 Conflict if registering an already existing contract", async () => {
      const res = await request(app)
        .post("/api/contracts")
        .set("x-api-key", "test-api-key")
        .send({
          id: "C1",
          name: "Contract One Dupe",
          functions: [],
        });
      expect(res.status).toBe(409);
      expect(res.body).toEqual({ error: "Contract already exists" });
    });

    it("should return 422 Unprocessable Entity if request body is invalid", async () => {
      const res = await request(app)
        .post("/api/contracts")
        .set("x-api-key", "test-api-key")
        .send({
          id: "C5",
          // missing functions
        });
      expect(res.status).toBe(422);
      expect(res.body).toEqual({ error: "Missing id or functions" });
    });
  });

  describe("GET /api/wallet/:address", () => {
    it("should return events involving the given wallet address", async () => {
      const res = await request(app).get(`/api/wallet/${wallet1}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      // Verify that the retrieved events indeed involve the wallet
      expect(res.body[0].description).toContain(wallet1);
    });
  });
});
