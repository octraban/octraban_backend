import express from "express";
import { db } from "./db.js";

const PORT = process.env.PORT || 3001;

export function startApi() {
  const app = express();
  app.use(express.json());

  // GET /api/events?contract=&fn=&page=
  app.get("/api/events", async (req, res) => {
    try {
      const events = await db.getEvents({
        contract: req.query.contract,
        fn:       req.query.fn,
        page:     Number(req.query.page) || 1,
      });
      res.json(events);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/events/:seq
  app.get("/api/events/:seq", async (req, res) => {
    try {
      const ev = await db.getEvent(Number(req.params.seq));
      if (!ev) return res.status(404).json({ error: "Not found" });
      res.json(ev);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/contracts/:id
  app.get("/api/contracts/:id", async (req, res) => {
    try {
      const meta = await db.getContractMeta(req.params.id);
      if (!meta) return res.status(404).json({ error: "Not found" });
      res.json(meta);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/contracts  — register ABI metadata
  app.post("/api/contracts", async (req, res) => {
    try {
      await db.upsertContractMeta(req.body);
      res.status(201).json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/wallet/:address
  app.get("/api/wallet/:address", async (req, res) => {
    try {
      const events = await db.getWalletEvents(req.params.address);
      res.json(events);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.listen(PORT, () => console.log(`API listening on :${PORT}`));
}
