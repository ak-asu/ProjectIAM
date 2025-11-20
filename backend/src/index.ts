import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { errorHandler, requestLogger } from './middleware';
import { initializeBlockchain } from './helpers/blockchain';
import { checkDbConnection } from './helpers/db';
import { authRoutes, issuerRoutes, verifierRoutes } from './routes';

const app = express();

// Added for render.io
app.set('trust proxy', 1);
app.use(helmet()); // For security headers

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (config.corsOrigin.includes('*') || config.corsOrigin.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Length', 'X-Request-Id'],
    maxAge: 86400,
  })
);

const limiter = rateLimit({
  windowMs: 8 * 60 * 1000,
  max: 48,
  message: 'Too many requests from this IP, please try again later',
});
app.use('/api/', limiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.text({ type: 'text/plain', limit: '10mb' }));

app.use(requestLogger);

app.use('/api/auth', authRoutes);
app.use('/api/issue', issuerRoutes);
app.use('/api/verify', verifierRoutes);

app.get('/', (_req: Request, res: Response) => {
  res.json({
    name: 'Unicredify Backend API',
    version: '0.1.0',
    description: 'Decentralized IAM for University Credentials',
    endpoints: {
      auth: '/api/auth',
      issuer: '/api/issue',
      verifier: '/api/verify',
    },
  });
});

app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path,
  });
});

app.use(errorHandler);

async function startServer() {
  try {
    console.log('Starting Unicredify Backend');
    const dbConnected = await checkDbConnection();
    if (!dbConnected) {
      console.warn('Database connection failed');
    } else {
      console.log('Database connected successfully');
    }
    if (config.contractAddr && config.rpcUrl) {
      await initializeBlockchain();
      console.log('Blockchain initialized');
    } else {
      console.warn('Warning: Blockchain not configured');
    }
    app.listen(config.port, () => {
      console.log(`Server running on port ${config.port}`);
    });
    process.on('SIGTERM', () => {
      process.exit(0);
    });
    process.on('SIGINT', () => {
      process.exit(0);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

export default app;
