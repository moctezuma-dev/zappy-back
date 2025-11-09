import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import path from 'path';
import registerRoutes from './routes/index.js';

const app = express();

app.use(express.static('public'));

const openapiSpecPath = path.join(process.cwd(), 'docs', 'openapi.yaml');
app.get('/docs/openapi.yaml', (_req, res) => {
  res.sendFile(openapiSpecPath);
});
app.use(
  '/docs',
  swaggerUi.serve,
  swaggerUi.setup(null, {
    explorer: true,
    swaggerOptions: {
      url: '/docs/openapi.yaml',
      persistAuthorization: true,
    },
  }),
);

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(morgan('dev'));

registerRoutes(app);

export default app;