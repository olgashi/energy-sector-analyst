import type { PoolConfig } from 'pg';

function readNumberEnv(name: string, fallback: number): number {
  const rawValue = process.env[name];

  if (!rawValue) {
    return fallback;
  }

  const parsedValue = Number(rawValue);

  return Number.isFinite(parsedValue) ? parsedValue : fallback;
}

function createSslConfig(): PoolConfig['ssl'] {
  if (process.env.PGSSLMODE !== 'require') {
    return undefined;
  }

  return {
    rejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED !== 'false',
  };
}

export function getDatabaseConfig(): PoolConfig {
  return {
    host: process.env.PGHOST || 'localhost',
    port: readNumberEnv('PGPORT', 5432),
    database: process.env.PGDATABASE || 'energy_sector_analyst',
    user: process.env.PGUSER || 'energy_app',
    password: process.env.PGPASSWORD || '',
    max: readNumberEnv('PGPOOL_MAX', 10),
    idleTimeoutMillis: readNumberEnv('PG_IDLE_TIMEOUT_MS', 10000),
    connectionTimeoutMillis: readNumberEnv('PG_CONNECT_TIMEOUT_MS', 5000),
    allowExitOnIdle: true,
    ssl: createSslConfig(),
  };
}
