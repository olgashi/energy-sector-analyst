import type { Pool } from 'pg';
import { getPool } from './pool.js';

type Queryable = Pick<Pool, 'query'>;

const migrations = [
  {
    id: '001_article_analysis',
    sql: `
      CREATE TABLE IF NOT EXISTS schema_migration (
        id TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS article_analysis (
        id BIGSERIAL PRIMARY KEY,
        article_id BIGINT NOT NULL REFERENCES article (id) ON DELETE CASCADE,
        analysis_version TEXT NOT NULL,
        status TEXT NOT NULL,
        current_stage TEXT,
        stage_results_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        result_json JSONB,
        error_message TEXT,
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT article_analysis_article_version_unique UNIQUE (article_id, analysis_version),
        CONSTRAINT article_analysis_status_check CHECK (status IN ('running', 'completed', 'failed'))
      );

      CREATE INDEX IF NOT EXISTS article_analysis_article_version_idx
        ON article_analysis (article_id, analysis_version);

      CREATE INDEX IF NOT EXISTS article_analysis_status_idx
        ON article_analysis (status);
    `,
  },
];

export async function runMigrations(db: Queryable = getPool()): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migration (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  for (const migration of migrations) {
    const result = await db.query<{ id: string }>(
      'SELECT id FROM schema_migration WHERE id = $1',
      [migration.id],
    );

    if (result.rows.length > 0) {
      continue;
    }

    await db.query('BEGIN');

    try {
      await db.query(migration.sql);
      await db.query('INSERT INTO schema_migration (id) VALUES ($1)', [
        migration.id,
      ]);
      await db.query('COMMIT');
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
  }
}
