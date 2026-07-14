import app from './app.js';
import { runMigrations } from './db/migrations.js';

const host = process.env.HOST || '0.0.0.0';
const port = Number(process.env.PORT) || 3000;

runMigrations()
  .then(() => {
    app.listen(port, host, () => {
      console.log(`App is listening on http://${host}:${port}`);
    });
  })
  .catch((error) => {
    console.error('Failed to run database migrations', error);
    process.exitCode = 1;
  });
