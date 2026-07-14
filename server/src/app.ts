import express, {
  type ErrorRequestHandler,
  type Express,
  type RequestHandler,
} from 'express';
import morgan from 'morgan';
import indexRouter from './routes/index.js';

const app: Express = express();
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:8080')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsHandler: RequestHandler = (req, res, next) => {
  const requestOrigin = req.headers.origin;

  if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    res.header('Access-Control-Allow-Origin', requestOrigin);
    res.header('Vary', 'Origin');
  }

  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }

  next();
};

app.use(morgan('dev'));
app.use(corsHandler);
app.use(express.json());
app.use('/', indexRouter);

const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: 'Not found' });
};

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: 'Internal server error' });
};

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
