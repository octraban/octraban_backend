import request from "supertest";
import express from "express";
import { startApi } from "../src/api.js";

describe("CORS configuration", () => {
  let app;
  const originalCorsOrigins = process.env.CORS_ORIGINS;

  beforeEach(() => {
    // Setup test environment
    process.env.CORS_ORIGINS = "https://explorer.stellar.org,http://localhost:5173";
    
    // We mock the dependency imports or minimal required to just test CORS middleware.
    // However, since startApi() registers everything, it might try to connect to DB,
    // so let's mock anything heavy if needed. But usually in Jest, we can just start the app.
  });

  afterEach(() => {
    process.env.CORS_ORIGINS = originalCorsOrigins;
  });

  it("should return Access-Control-Allow-Origin and credentials for allowed origin", async () => {
    app = startApi();
    const res = await request(app)
      .post("/api/contracts")
      .set("Origin", "https://explorer.stellar.org")
      .send({});
      
    expect(res.headers["access-control-allow-origin"]).toBe("https://explorer.stellar.org");
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("should not return Access-Control-Allow-Origin for blocked origin", async () => {
    app = startApi();
    const res = await request(app)
      .post("/api/contracts")
      .set("Origin", "https://malicious.com")
      .send({});
      
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    expect(res.headers["access-control-allow-credentials"]).toBeUndefined();
  });

  it("should return Access-Control-Max-Age and correct headers on preflight OPTIONS", async () => {
    app = startApi();
    const res = await request(app)
      .options("/api/contracts")
      .set("Origin", "https://explorer.stellar.org")
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "Content-Type");
      
    expect(res.statusCode).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("https://explorer.stellar.org");
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
    expect(res.headers["access-control-allow-methods"]).toContain("GET");
    expect(res.headers["access-control-allow-methods"]).toContain("POST");
    expect(res.headers["access-control-allow-methods"]).toContain("OPTIONS");
    expect(res.headers["access-control-allow-headers"]).toContain("Content-Type");
    expect(res.headers["access-control-allow-headers"]).toContain("Authorization");
    expect(res.headers["access-control-allow-headers"]).toContain("X-Request-Id");
    expect(res.headers["access-control-max-age"]).toBe("86400");
  });
  
  it("should allow wildcard when CORS_ORIGINS=*", async () => {
    process.env.CORS_ORIGINS = "*";
    app = startApi();
    const res = await request(app)
      .post("/api/contracts")
      .set("Origin", "https://anyone.com")
      .send({});
      
    expect(res.headers["access-control-allow-origin"]).toBe("*");
    expect(res.headers["access-control-allow-credentials"]).toBeUndefined(); // Shouldn't set credentials true on wildcard
  });
});
