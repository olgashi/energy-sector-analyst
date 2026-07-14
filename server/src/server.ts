import app from './app.js';

const host = process.env.HOST || '0.0.0.0';
const port = Number(process.env.PORT) || 3000;

app.listen(port, host, () => {
  console.log(`App is listening on http://${host}:${port}`);
});
