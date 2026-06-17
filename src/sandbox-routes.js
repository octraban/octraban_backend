// Sandbox persistence routes for the API
// Add to indexer/src/api.js

export function attachSandboxRoutes(app, db) {
  // Create or update sandbox
  app.post('/api/sandbox', async (req, res) => {
    try {
      const { sandboxId, templateId, files, metadata } = req.body;

      if (!sandboxId || !templateId) {
        return res.status(400).json({ error: 'sandboxId and templateId required' });
      }

      const filesJson = JSON.stringify(files);
      const metadataJson = JSON.stringify(metadata || {});

      await db.query(
        `INSERT INTO sandboxes (sandbox_id, template_id, files, metadata, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         ON CONFLICT (sandbox_id) DO UPDATE SET
         files = $3, metadata = $4, updated_at = NOW()`,
        [sandboxId, templateId, filesJson, metadataJson]
      );

      res.json({ success: true, sandboxId });
    } catch (error) {
      console.error('Failed to save sandbox:', error);
      res.status(500).json({ error: 'Failed to save sandbox' });
    }
  });

  // Get sandbox by ID
  app.get('/api/sandbox/:id', async (req, res) => {
    try {
      const { id } = req.params;

      const result = await db.query(
        `SELECT sandbox_id, template_id, files, metadata, created_at, updated_at
         FROM sandboxes WHERE sandbox_id = $1`,
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Sandbox not found' });
      }

      const sandbox = result.rows[0];
      res.json({
        sandboxId: sandbox.sandbox_id,
        templateId: sandbox.template_id,
        files: JSON.parse(sandbox.files),
        metadata: JSON.parse(sandbox.metadata || '{}'),
        createdAt: sandbox.created_at,
        updatedAt: sandbox.updated_at,
      });
    } catch (error) {
      console.error('Failed to fetch sandbox:', error);
      res.status(500).json({ error: 'Failed to fetch sandbox' });
    }
  });

  // List sandboxes (paginated)
  app.get('/api/sandboxes', async (req, res) => {
    try {
      const { limit = 20, offset = 0 } = req.query;

      const result = await db.query(
        `SELECT sandbox_id, template_id, metadata, created_at, updated_at
         FROM sandboxes
         ORDER BY created_at DESC
         LIMIT $1 OFFSET $2`,
        [Math.min(limit, 100), offset]
      );

      const countResult = await db.query('SELECT COUNT(*) as count FROM sandboxes');

      res.json({
        sandboxes: result.rows.map((row) => ({
          sandboxId: row.sandbox_id,
          templateId: row.template_id,
          metadata: JSON.parse(row.metadata || '{}'),
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        })),
        total: parseInt(countResult.rows[0].count),
        limit: parseInt(limit),
        offset: parseInt(offset),
      });
    } catch (error) {
      console.error('Failed to list sandboxes:', error);
      res.status(500).json({ error: 'Failed to list sandboxes' });
    }
  });

  // Delete sandbox
  app.delete('/api/sandbox/:id', async (req, res) => {
    try {
      const { id } = req.params;

      await db.query('DELETE FROM sandboxes WHERE sandbox_id = $1', [id]);

      res.json({ success: true });
    } catch (error) {
      console.error('Failed to delete sandbox:', error);
      res.status(500).json({ error: 'Failed to delete sandbox' });
    }
  });
}
