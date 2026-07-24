import request from "supertest";

// Issue #22: verify every /api/admin/* route enforces admin auth and returns
// the correct status for missing/invalid/valid tokens.
//
// Ensure process.env uses TEST_DATABASE_URL, matching the other test/api/*.test.js files.
const DB_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/soroban_test";
process.env.DATABASE_URL = DB_URL;
process.env.ADMIN_SECRET = "test-admin-secret";
process.env.API_KEY = "test-api-key";
process.env.VERIFY_ABI = "false";

import { db } from "../../src/db.js";
import { startApi } from "../../src/api.js";

// Every route registered on the admin router in src/routes/admin.js.
const ADMIN_ROUTES = [
  { method: "get", path: "/api/admin/api-keys" },
  { method: "post", path: "/api/admin/api-keys" },
  { method: "patch", path: "/api/admin/api-keys/test-id" },
  { method: "delete", path: "/api/admin/api-keys/test-id" },
  { method: "post", path: "/api/admin/api-keys/test-id/rotate" },
  { method: "get", path: "/api/admin/api-keys/test-id/usage" },
  { method: "get", path: "/api/admin/audit-log" },
  { method: "get", path: "/api/admin/audit-log/export" },
  { method: "get", path: "/api/admin/analytics/rate-limit-hits" },
  { method: "get", path: "/api/admin/analytics/top-users" },
  { method: "get", path: "/api/admin/analytics/violation-heatmap" },
  { method: "get", path: "/api/admin/analytics/upgrade-recommendations" },
];

// The four routes the frontend rate-limit dashboard calls directly (issue #22).
const ANALYTICS_ROUTES = ADMIN_ROUTES.filter((r) => r.path.startsWith("/api/admin/analytics/"));

describe("Admin route authentication (issue #22)", () => {
  let server;
  let app;

  beforeAll(async () => {
    await db.init();
    server = startApi();
    app = server;
  });

  afterAll(async () => {
    if (server && server.close) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  describe.each(ADMIN_ROUTES)("$method $path", ({ method, path }) => {
    it("returns 401 with no Authorization header", async () => {
      const res = await request(app)[method](path);
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "Unauthorized" });
    });

    it("returns 401 with an invalid token", async () => {
      const res = await request(app)[method](path).set("Authorization", "Bearer wrong-token");
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "Unauthorized" });
    });
  });

  describe.each(ANALYTICS_ROUTES)("$method $path with a valid token", ({ method, path }) => {
    it("does not return 401", async () => {
      const res = await request(app)
        [method](path)
        .set("Authorization", `Bearer ${process.env.ADMIN_SECRET}`);
      expect(res.status).not.toBe(401);
    });
  });
});
