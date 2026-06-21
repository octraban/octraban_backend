import { db } from "../db.js";
import { analyzeSourceDependencies } from "../dependencyScanner.js";
import { cacheAside, cacheDel } from "../metadataCache.js";

const VERIFY_ON_UPLOAD = process.env.VERIFY_ABI !== "false";

export default function (app, { writeLimiter, requireApiKey }) {
  app.get("/api/contracts/:id", async (req, res) => {
    try {
      const cacheKey = `contract:meta:${req.params.id}`;
      const meta = await cacheAside(cacheKey, () => db.getContractMeta(req.params.id));
      if (!meta) return res.status(404).json({ error: "Not found" });

      const sourceFiles = Array.isArray(meta.source_files)
        ? meta.source_files
        : meta.source_files
          ? JSON.parse(meta.source_files)
          : [];

      const advisory = await analyzeSourceDependencies(sourceFiles);
      res.json({ ...meta, dependency_advisory: advisory });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/contracts/:id/build-metadata", async (req, res) => {
    try {
      const meta = await db.getWasmBuildMetadata(req.params.id);
      if (!meta) return res.status(404).json({ error: "No build metadata found for this contract" });
      res.json(meta);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/contracts/:id/abi", async (req, res) => {
    try {
      const { fetchContractSpec } = await import("../verify_abi.js");
      const meta = await db.getContractMeta(req.params.id);
      const spec = await fetchContractSpec(req.params.id);
      const abi = {
        contractId: req.params.id,
        name: meta?.name || "",
        description: meta?.description || "",
        functions: (spec || []).map((fn) => {
          const registered = meta?.functions?.find((f) => f.name === fn.name);
          return {
            name: fn.name,
            description: registered?.description || "",
            args: fn.args.map((a) => ({ name: a.name, type: a.type })),
          };
        }),
      };
      res.setHeader("Content-Disposition", `attachment; filename="${req.params.id}.abi.json"`);
      res.json(abi);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/contracts", writeLimiter, requireApiKey, async (req, res) => {
    try {
      const { id, functions } = req.body;

      if (!id || !functions) {
        return res.status(400).json({ error: "Missing id or functions" });
      }

      if (VERIFY_ON_UPLOAD) {
        const { verifyAbi } = await import("../verify_abi.js");
        const verification = await verifyAbi(id, functions);

        if (!verification.valid) {
          return res.status(400).json({
            error: "ABI verification failed",
            details: verification,
          });
        }

        console.log(`ABI verified for contract ${id}:`, {
          functionsVerified: functions.length,
          missing: verification.missingFunctions.length,
          mismatches: verification.argMismatch.length,
        });
      }

      await db.upsertContractMeta(req.body);
      await cacheDel(`contract:meta:${id}`);
      res.status(201).json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/verify", writeLimiter, requireApiKey, async (req, res) => {
    try {
      const { contractId, functions } = req.body;

      if (!contractId || !functions) {
        return res.status(400).json({ error: "Missing contractId or functions" });
      }

      const { verifyAbi } = await import("../verify_abi.js");
      const verification = await verifyAbi(contractId, functions);
      res.json(verification);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/spec/:id", async (req, res) => {
    try {
      const { fetchContractSpec } = await import("../verify_abi.js");
      const spec = await fetchContractSpec(req.params.id);
      if (spec === null) {
        return res.status(404).json({ error: "Contract not found or has no spec" });
      }
      res.json(spec);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/spec/:id/full", async (req, res) => {
    try {
      const { fetchContractSpecFull } = await import("../verify_abi.js");
      const spec = await fetchContractSpecFull(req.params.id);
      if (spec === null) {
        return res.status(404).json({ error: "Contract not found or has no WASM spec" });
      }
      res.json(spec);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/v1/contracts/:id/transactions", async (req, res) => {
    try {
      const result = await db.getContractTransactions(req.params.id, {
        function_name: req.query.function_name || undefined,
        start_ledger: req.query.start_ledger ? Number(req.query.start_ledger) : undefined,
        end_ledger: req.query.end_ledger ? Number(req.query.end_ledger) : undefined,
        page: Number(req.query.page) || 1,
        limit: Math.min(Number(req.query.limit) || 25, 200),
      });
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/contracts/:id/roles", async (req, res) => {
    try {
      const roles = await db.getRoles(req.params.id);
      res.json(roles);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/contracts/:id/upgrades", async (req, res) => {
    try {
      const upgrades = await db.getUpgradeHistory(req.params.id);
      res.json(upgrades);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/contracts/:id/circuit-breaker", async (req, res) => {
    try {
      const status = await db.getCircuitBreakerStatus(req.params.id);
      res.json(status);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/contracts/:id/migration", async (req, res) => {
    try {
      const status = await db.getMigrationStatus(req.params.id);
      res.json(status);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/contracts/:id/rwa", async (req, res) => {
    try {
      const meta = await db.getContractMeta(req.params.id);
      if (!meta) return res.status(404).json({ error: "Contract not found" });
      res.json({ is_rwa: !!meta.is_rwa, rwa_type: meta.rwa_type ?? null });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/contracts/:id/spec", async (req, res) => {
    try {
      const { fetchContractSpec } = await import("../verify_abi.js");
      const spec = await fetchContractSpec(req.params.id);
      if (spec === null) return res.status(404).json({ error: "No spec found" });
      res.json(spec);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/contracts/:id/state-diffs", async (req, res) => {
    try {
      const diffs = await db.getStateDiffs(req.params.id, {
        key: req.query.key || undefined,
        limit: Math.min(Number(req.query.limit) || 200, 1000),
      });
      res.json(diffs);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/contracts/:id/verifications", async (req, res) => {
    try {
      const verifications = await db.getSourceVerifications(req.params.id, req.query.wasm_hash || undefined);
      res.json(verifications);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/contracts/:id/ttl", async (req, res) => {
    try {
      const meta = await db.getContractMeta(req.params.id);
      res.json({ contract_id: req.params.id, exists: !!meta });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
}
