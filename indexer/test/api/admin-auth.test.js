import request from "supertest";
import express from "express";
import { jest } from "@jest/globals";

// Issue #22: verify every /api/admin/* route (including the four analytics
// routes consumed by the dashboard) enforces authentication, returns the
// correct status codes, and that a valid token still reaches the handler.
//
// The db pool is mocked so this suite runs without a live Postgres instance,
// unlike the other test/api/*.test.js files which exercise a real database.

process.env.ADMIN_SECRET = "test-admin-secret";

const queryMock = jest.fn().mockResolvedValue({ rows: [] });

jest.unstable_mockModule("../../src/db.js", () => ({
  db: {},
  pool: { query: queryMock },
}));

const { default: registerAdminRoutes } = await import("../../src/routes/admin.js");

function buildApp() {
  const app = express();
  app.use(express.json());
  registerAdminRoutes(app);
  return app;
}

const ADMIN_ROUTES = [
  { method: "get", path: "/api/admin/api-keys" },
  { method: "get", path: "/api/admin/audit-log" },
  { method: "get", path: "/api/admin/audit-log/export" },
  { method: "get", path: "/api/admin/analytics/rate-limit-hits" },
  { method: "get", path: "/api/admin/analytics/top-users" },
  { method: "get", path: "/api/admin/analytics/violation-heatmap" },
  { method: "get", path: "/api/admin/analytics/upgrade-recommendations" },
];

describe("/api/admin/* authentication (issue #22)", () => {
  const app = buildApp();

  beforeEach(() => {
    queryMock.mockClear();
  });

  it.each(ADMIN_ROUTES)("returns 401 for $path with no Authorization header", async ({ method, path }) => {
    const res = await request(app)[method](path);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Unauthorized" });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it.each(ADMIN_ROUTES)("returns 401 for $path with an invalid bearer token", async ({ method, path }) => {
    const res = await request(app)[method](path).set("Authorization", "Bearer wrong-token");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Unauthorized" });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("returns 200 for an admin analytics route with a valid bearer token", async () => {
    const res = await request(app)
      .get("/api/admin/analytics/rate-limit-hits")
      .set("Authorization", `Bearer ${process.env.ADMIN_SECRET}`);
    expect(res.status).toBe(200);
    expect(queryMock).toHaveBeenCalledTimes(1);
  });
});
