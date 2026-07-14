# Energy Sector Analyst

## Local Startup

### Docker Compose

1. Copy `.env.example` to `.env`.
2. Start the app:

```bash
docker compose up --build
```

The PostgreSQL schema is initialized automatically from `postgres/init/` the first time the database volume is created.

If you already have a populated database volume and want to recreate the schema from scratch, remove the volume first:

```bash
docker compose down -v
docker compose up --build
```

Frontend: `http://localhost:8080`

Backend: `http://localhost:3000`

Database health: `http://localhost:3000/api/health`

### Local Node Development

Backend:

```bash
cd server
npm install
PORT=3000 HOST=0.0.0.0 PGHOST=localhost PGPORT=5432 PGDATABASE=energy_sector_analyst PGUSER=energy_app PGPASSWORD=change-this-local-password npm run dev
```

Frontend:

```bash
cd client
npm install
VITE_DEV_PROXY_TARGET=http://localhost:3000 npm run dev
```

If you want the frontend to call the backend directly instead of using the Vite proxy:

```bash
cd client
VITE_API_BASE_URL=http://localhost:3000/api npm run dev
```

## Environment Variables

Root `.env` values used by Docker Compose:

- `BACKEND_HOST`: backend bind host
- `BACKEND_PORT`: backend port exposed on the host
- `ALLOWED_ORIGINS`: comma-separated frontend origins allowed by the backend CORS middleware
- `POSTGRES_DB`: local PostgreSQL database name for Docker Compose
- `POSTGRES_USER`: local PostgreSQL application user for Docker Compose
- `POSTGRES_PASSWORD`: local PostgreSQL password for Docker Compose
- `PGHOST`: PostgreSQL host used by the backend
- `PGPORT`: PostgreSQL port used by the backend
- `PGDATABASE`: PostgreSQL database name used by the backend
- `PGUSER`: PostgreSQL user used by the backend
- `PGPASSWORD`: PostgreSQL password used by the backend
- `PGSSLMODE`: set to `require` when the backend should use TLS to reach PostgreSQL
- `PGPOOL_MAX`: maximum PostgreSQL pool size
- `PG_CONNECT_TIMEOUT_MS`: database connection timeout in milliseconds
- `PG_IDLE_TIMEOUT_MS`: idle pooled-connection timeout in milliseconds
- `VITE_API_BASE_URL`: frontend API base URL baked into the production frontend build
- `VITE_DEV_PROXY_TARGET`: Vite dev proxy target for local frontend development
