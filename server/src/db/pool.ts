import { Pool } from 'pg';
import { getDatabaseConfig } from './config.js';

let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool(getDatabaseConfig());
    pool.on('error', (error) => {
      console.error('Unexpected PostgreSQL pool error', error);
    });
  }

  return pool;
}

export async function checkDatabaseConnection(): Promise<void> {
  await getPool().query('SELECT 1');
}

export async function closePool(): Promise<void> {
  if (!pool) {
    return;
  }

  await pool.end();
  pool = undefined;
}
