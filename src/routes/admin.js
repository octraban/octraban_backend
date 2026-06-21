import { db } from "../db.js";
import { runAllChecks } from "../doctor-lib.js";

const EVENT_COLUMNS = [
  "seq",
  "contract_id",
  "function",
  "ledger",
  "tx_hash",
  "description",
  "cpu_instructions",
  "mem_bytes",
  "fee_charged",
  "is_clawback",
  "is_high_bloat_risk",
];

const CONTRACT_COLUMNS = [
  "id",
  "name",
  "description",
  "registered_by",
  "has_circuit_breaker",
  "is_paused",
  "is_rwa",
  "rwa_type",
  "created_at",
];

function rowsToCsv(rows, columns) {
  if (!rows.length) return columns.join(",") + "\n";
  const escape = (v) => {
    if (v == null) return "";
    const s = String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = columns.join(",");
  const body = rows.map((r) => columns.map((c) => escape(r[c])).join(",")).join("\n");
  return header + "\n" + body + "\n";
}

export default function (app) {
  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  app.get("/api/doctor", async (_req, res) => {
    try {
      const checks = await runAllChecks();
      res.json(checks);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/setup/db-init", async (req, res) => {
    try {
      await db.init();
      const { seed } = await import("../seed-lib.js");
      await seed(process.env.DATABASE_URL);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/export/events", async (req, res) => {
    try {
      const format = req.query.format === "json" ? "json" : "csv";
      const limit = Math.min(Number(req.query.limit) || 10000, 10000);
      const rows = await db.getEventsForExport({
        contract: req.query.contract,
        fn: req.query.fn,
        type: req.query.type,
        limit,
      });
      if (format === "json") {
        res.setHeader("Content-Disposition", 'attachment; filename="events.json"');
        res.setHeader("Content-Type", "application/json");
        return res.json(rows);
      }
      res.setHeader("Content-Disposition", 'attachment; filename="events.csv"');
      res.setHeader("Content-Type", "text/csv");
      return res.send(rowsToCsv(rows, EVENT_COLUMNS));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/export/contracts", async (req, res) => {
    try {
      const format = req.query.format === "json" ? "json" : "csv";
      const rows = await db.getContractsForExport();
      if (format === "json") {
        res.setHeader("Content-Disposition", 'attachment; filename="contracts.json"');
        res.setHeader("Content-Type", "application/json");
        return res.json(rows);
      }
      res.setHeader("Content-Disposition", 'attachment; filename="contracts.csv"');
      res.setHeader("Content-Type", "text/csv");
      return res.send(rowsToCsv(rows, CONTRACT_COLUMNS));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
}
