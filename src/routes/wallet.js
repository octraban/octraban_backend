import { db } from "../db.js";
import { fetchTokenMetadata } from "../sep41Metadata.js";
import { formatAmount } from "../formatAmount.js";

export default function (app) {
  app.get("/api/wallet/:address", async (req, res) => {
    try {
      const events = await db.getWalletEvents(req.params.address);
      res.json(events);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/tokens/:id/holders", async (req, res) => {
    try {
      const contractId = req.params.id;
      let decimals = 7;
      try {
        const meta = await fetchTokenMetadata(contractId);
        decimals = meta.decimals;
      } catch {
        /* use default */
      }

      const rows = await db.getTokenHolders(contractId);
      const holders = rows.map((r) => ({
        address: r.address,
        balance_raw: r.balance_raw,
        balance: formatAmount(r.balance_raw, decimals),
      }));

      res.json({
        contract_id: contractId,
        decimals,
        total_holders: holders.length,
        holders,
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/tokens/:id/volume", async (req, res) => {
    try {
      const contractId = req.params.id;
      let decimals = 7;
      try {
        const meta = await fetchTokenMetadata(contractId);
        decimals = meta.decimals;
      } catch {
        /* use default */
      }

      const volume = await db.get24hVolume(contractId, decimals);
      res.json({ contract_id: contractId, window: "24h", ...volume });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
}
