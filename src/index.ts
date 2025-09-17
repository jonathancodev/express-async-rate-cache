import express, { Request, Response, NextFunction, Express } from 'express';
import cors from 'cors';
import { LRUCache } from './cache/LRUCache';
import { RateLimiter } from './middleware/rateLimiter';
import { DatabaseService } from './services/DatabaseService';
import { User, ApiResponse } from './types';
import { createUsersRouter } from './routes/users';
import { createCacheRouter } from './routes/cache';

const app: Express = express();
const PORT = process.env.PORT || 3000;

// Initialize services
const userCache = new LRUCache<User>(1000, 60000); // 1000 items, 60s TTL
const rateLimiter = new RateLimiter(10, 60000, 5, 10000); // 10 req/min, 5 burst/10s
const dbService = new DatabaseService();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Trust proxy for accurate IP addresses
app.set('trust proxy', true);

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const timestamp = new Date().toISOString();
  console.log(`${timestamp} - ${req.method} ${req.path} - IP: ${req.ip}`);
  next();
});

// Apply rate limiting to all routes
app.use(rateLimiter.middleware());

// Response time tracking middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  
  // Override res.end to calculate and set response time before sending
  const originalEnd = res.end;
  res.end = function(chunk?: any, encoding?: any, cb?: any) {
    const responseTime = Date.now() - startTime;
    res.set('X-Response-Time', `${responseTime}ms`);
    return originalEnd.call(this, chunk, encoding, cb);
  };
  
  next();
});

// Mount routes
app.use('/users', createUsersRouter(userCache, dbService));
app.use('/cache', createCacheRouter(userCache, dbService));


// GET /health - Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  const response: ApiResponse = {
    success: true,
    data: {
      status: 'healthy',
      timestamp: Date.now(),
      uptime: process.uptime()
    },
    timestamp: Date.now()
  };
  res.json(response);
});

// GET / - API documentation
app.get('/', (req: Request, res: Response) => {
  const apiDoc = {
    name: 'Express Async Rate Cache API',
    version: '1.0.0',
    description: 'High-performance Express.js API with advanced caching, rate limiting, and async processing',
    endpoints: {
      'GET /': 'API documentation',
      'GET /health': 'Health check',
      'GET /users/:id': 'Get user by ID (cached)',
      'POST /users': 'Create new user',
      'DELETE /cache': 'Clear entire cache',
      'GET /cache/status': 'Get cache and queue statistics'
    },
    rateLimiting: {
      requests: '10 per minute',
      burst: '5 requests per 10 seconds'
    },
    caching: {
      strategy: 'LRU with TTL',
      ttl: '60 seconds',
      maxSize: '1000 items'
    }
  };
  
  res.json(apiDoc);
});

// 404 handler
app.use('*', (req: Request, res: Response) => {
  const response: ApiResponse = {
    success: false,
    error: `Route ${req.method} ${req.originalUrl} not found`,
    timestamp: Date.now()
  };
  res.status(404).json(response);
});

// Global error handler
app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Global error handler:', error);
  
  const response: ApiResponse = {
    success: false,
    error: 'Internal server error',
    timestamp: Date.now()
  };
  
  res.status(500).json(response);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  userCache.destroy();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  userCache.destroy();
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Cache TTL: 60 seconds, Max size: 1000 items`);
  console.log(`Rate limit: 10 requests/minute, 5 burst/10 seconds`);
  console.log(`API Documentation: http://localhost:${PORT}`);
});

export default app;
