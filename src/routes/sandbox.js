import { getRpcNodeStatus } from "../rpcMultiNode.js";
import { getMetrics } from "../rpcMetrics.js";
import { getBurnAlerts } from "../burnDetector.js";

const RPC_URL = process.env.SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org";

export default function (app, { writeLimiter, requireApiKey }) {
  app.post("/api/simulate", writeLimiter, requireApiKey, async (req, res) => {
    try {
      const { contractId, fn, args = [] } = req.body;
      if (!contractId || !fn) return res.status(400).json({ error: "Missing contractId or fn" });

      const { SorobanRpc, Contract, nativeToScVal } = await import("@stellar/stellar-sdk");
      const server = new SorobanRpc.Server(RPC_URL);

      const contract = new Contract(contractId);
      const scArgs = args.map((a) => nativeToScVal(a));
      const op = contract.call(fn, ...scArgs);

      const account = await server.getAccount(
        process.env.SIMULATE_SOURCE || "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN",
      );
      const { TransactionBuilder, Networks, BASE_FEE } = await import("@stellar/stellar-sdk");
      const tx = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(op)
        .setTimeout(30)
        .build();

      const sim = await server.simulateTransaction(tx);

      if (SorobanRpc.Api.isSimulationError(sim)) {
        return res.json({ success: false, error: sim.error });
      }

      const cost = sim.cost ?? {};
      const retVal = sim.result?.retval;
      res.json({
        success: true,
        returnValue: retVal ? retVal.toXDR("base64") : undefined,
        cost: {
          cpuInsns: String(cost.cpuInsns ?? 0),
          memBytes: String(cost.memBytes ?? 0),
        },
      });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.post("/api/sandbox/simulate", writeLimiter, requireApiKey, async (req, res) => {
    try {
      const { xdrEnvelope } = req.body;
      if (!xdrEnvelope) return res.status(400).json({ error: "Missing xdrEnvelope" });

      const { SorobanRpc, xdr } = await import("@stellar/stellar-sdk");
      const server = new SorobanRpc.Server(RPC_URL);

      const envelope = xdr.TransactionEnvelope.fromXDR(xdrEnvelope, "base64");
      const sim = await server.simulateTransaction({
        toEnvelope: () => envelope,
      });

      if (SorobanRpc.Api.isSimulationError(sim)) {
        return res.json({ success: false, error: sim.error });
      }

      const cost = sim.cost ?? {};
      const retVal = sim.result?.retval;
      res.json({
        success: true,
        returnValue: retVal ? retVal.toXDR("base64") : undefined,
        cost: {
          cpuInsns: String(cost.cpuInsns ?? 0),
          memBytes: String(cost.memBytes ?? 0),
        },
        minResourceFee: sim.minResourceFee ?? null,
        latestLedger: sim.latestLedger ?? null,
      });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.post("/api/auth-tree", writeLimiter, requireApiKey, async (req, res) => {
    try {
      const { auth } = req.body;
      if (!Array.isArray(auth)) return res.status(400).json({ error: "auth must be an array" });
      const { parseAuthTree } = await import("../authTreeParser.js");
      res.json(parseAuthTree(auth));
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get("/api/burn-alerts", (req, res) => {
    try {
      const alerts = getBurnAlerts(req.query.contract || undefined);
      res.json(alerts);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/rpc-metrics", (_req, res) => {
    try {
      res.json(getMetrics());
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/rpc-nodes", (_req, res) => {
    try {
      res.json(getRpcNodeStatus());
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
}
