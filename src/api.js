import express from "express";
import { db } from "./db.js";
import { requestIdMiddleware, createHttpLogger, metricsMiddleware, metricsRegistry, defaultLogger } from "./logger.js";

const PORT = process.env.PORT || 3001;

export function createApi({ logDestination, dbOverride } = {}) {
  const app = express();
  const data = dbOverride ?? db;

  app.use(express.json());
  app.use(requestIdMiddleware);
  app.use(createHttpLogger(logDestination));
  app.use(metricsMiddleware);

  app.get("/api/events", async (req, res) => {
    try {
      const events = await data.getEvents({
        contract: req.query.contract,
        fn:       req.query.fn,
        page:     Number(req.query.page) || 1,
      });
      res.json(events);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/events/:seq", async (req, res) => {
    try {
      const ev = await data.getEvent(Number(req.params.seq));
      if (!ev) return res.status(404).json({ error: "Not found" });
      res.json(ev);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/contracts/:id", async (req, res) => {
    try {
      const meta = await data.getContractMeta(req.params.id);
      if (!meta) return res.status(404).json({ error: "Not found" });
      res.json(meta);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/contracts", async (req, res) => {
    try {
      await data.upsertContractMeta(req.body);
      res.status(201).json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/wallet/:address", async (req, res) => {
    try {
      const events = await data.getWalletEvents(req.params.address);
      res.json(events);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/metrics", async (req, res) => {
    try {
      res.setHeader("Content-Type", metricsRegistry.contentType);
      res.end(await metricsRegistry.metrics());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return app;
}

export function startApi(options = {}) {
  const app = createApi(options);
  app.listen(PORT, () => defaultLogger.info({ msg: `API listening on :${PORT}` }));
}
