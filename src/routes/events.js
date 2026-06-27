import { db } from "../db.js";

export default function (app) {
  app.get("/api/events", async (req, res) => {
    try {
      const events = await db.getEvents({
        contract: req.query.contract,
        fn: req.query.fn,
        page: Number(req.query.page) || 1,
        type: req.query.type,
      });
      res.json(events);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/events/:seq", async (req, res) => {
    try {
      const ev = await db.getEvent(Number(req.params.seq));
      if (!ev) return res.status(404).json({ error: "Not found" });
      res.json(ev);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/events/:seq/zk-costs", async (req, res) => {
    try {
      const ev = await db.getEvent(Number(req.params.seq));
      if (!ev) return res.status(404).json({ error: "Not found" });
      if (!ev.zk_host_calls) return res.json({ calls: [], delta: null });
      const zk = typeof ev.zk_host_calls === "string" ? JSON.parse(ev.zk_host_calls) : ev.zk_host_calls;
      res.json(zk);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/v1/events", async (req, res) => {
    try {
      const result = await db.getEventsCursor({
        contract: req.query.contract || undefined,
        fn: req.query.fn || undefined,
        type: req.query.type || undefined,
        after_seq: req.query.after ? Number(req.query.after) : 0,
        limit: req.query.limit ? Math.min(Number(req.query.limit), 200) : 25,
      });
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
}
