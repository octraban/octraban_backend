import { Client } from 'pg';
import fs from 'fs/promises';
import path from 'path';

/**
 * Migration orchestrator for zero-downtime expand-migrate-contract schema changes.
 * Supports running migrations, dry-runs, and generating PR schema diffs.
 */
export class MigrationOrchestrator {
  constructor(private dbClient: Client) {}

  async initialize() {
    await this.dbClient.query(`
      CREATE TABLE IF NOT EXISTS migration_log (
        id SERIAL PRIMARY KEY,
        migration_version VARCHAR(255) UNIQUE NOT NULL,
        description TEXT,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        duration_ms INTEGER,
        is_destructive BOOLEAN DEFAULT FALSE
      )
    `);
  }

  async runMigrations(directory: string, dryRun: boolean = false) {
    await this.initialize();
    
    // Advisory lock to prevent concurrent migration runs
    await this.dbClient.query('SELECT pg_advisory_lock(987654321)');
    
    try {
      const files = await fs.readdir(directory);
      const sqlFiles = files.filter(f => f.endsWith('.sql')).sort();

      for (const file of sqlFiles) {
        const content = await fs.readFile(path.join(directory, file), 'utf8');
        const versionMatch = file.match(/^V(\d+)__/);
        if (!versionMatch) continue;
        
        const version = versionMatch[1];
        
        const isExecuted = await this.dbClient.query(
          'SELECT 1 FROM migration_log WHERE migration_version = $1',
          [version]
        );
        
        if (isExecuted.rowCount > 0) continue;

        console.log(`Running migration: ${file}`);
        
        const isDestructive = content.toUpperCase().includes('DROP COLUMN') || content.toUpperCase().includes('DROP TABLE');
        const start = Date.now();

        if (!dryRun) {
          await this.dbClient.query('BEGIN');
          try {
            await this.dbClient.query(content);
            const duration = Date.now() - start;
            await this.dbClient.query(
              'INSERT INTO migration_log (migration_version, description, duration_ms, is_destructive) VALUES ($1, $2, $3, $4)',
              [version, file, duration, isDestructive]
            );
            await this.dbClient.query('COMMIT');
            console.log(`Successfully completed ${file} in ${duration}ms`);
          } catch (err) {
            await this.dbClient.query('ROLLBACK');
            throw new Error(`Migration ${file} failed: ${err.message}`);
          }
        }
      }
    } finally {
      await this.dbClient.query('SELECT pg_advisory_unlock(987654321)');
    }
  }
}
