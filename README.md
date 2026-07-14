# Energy Sector Analyst

## Local Startup

### Docker Compose

1. Copy `.env.example` to `.env`.
2. Start the app:

```bash
docker compose up --build
```

Frontend: `http://localhost:8080`

Backend: `http://localhost:3000`

### Local Node Development

Backend:

```bash
cd server
npm install
PORT=3000 HOST=0.0.0.0 npm run dev
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
- `VITE_API_BASE_URL`: frontend API base URL baked into the production frontend build
- `VITE_DEV_PROXY_TARGET`: Vite dev proxy target for local frontend development
