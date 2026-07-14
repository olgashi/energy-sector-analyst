import express, {
  type ErrorRequestHandler,
  type Express,
  type RequestHandler,
} from 'express';
import morgan from 'morgan';
import indexRouter from './routes/index.js';

const app: Express = express();
const port = Number(process.env.PORT) || 3000;

app.use(morgan('dev'));
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


app.listen(port, () => {
  console.log(`App is listening on port ${port}`);
});
