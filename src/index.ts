import express, { Request, Response, NextFunction, Express } from 'express';
import cors from 'cors';
import { LRUCache } from './cache/LRUCache';
import { RateLimiter } from './middleware/rateLimiter';
import { DatabaseService } from './services/DatabaseService';
import { User, ApiResponse, CreateUserRequest } from './types';

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
  
  res.on('finish', () => {
    const responseTime = Date.now() - startTime;
    res.set('X-Response-Time', `${responseTime}ms`);
  });
  
  next();
});

// GET /users/:id - Retrieve user data by ID
app.get('/users/:id', async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  
  try {
    const userId = parseInt(req.params.id!);
    
    if (isNaN(userId) || userId <= 0) {
      const response: ApiResponse = {
        success: false,
        error: 'Invalid user ID. Must be a positive integer.',
        timestamp: Date.now(),
        responseTime: Date.now() - startTime
      };
      res.status(400).json(response);
      return;
    }

    const cacheKey = `user:${userId}`;
    
    // Try to get from cache first
    const cachedUser = userCache.get(cacheKey);
    if (cachedUser) {
      const response: ApiResponse<User> = {
        success: true,
        data: cachedUser,
        timestamp: Date.now(),
        cached: true,
        responseTime: Date.now() - startTime
      };
      res.json(response);
      return;
    }

    // If not in cache, fetch from database
    try {
      const user = await dbService.getUserById(userId);
      
      // Cache the result
      userCache.set(cacheKey, user);
      
      const response: ApiResponse<User> = {
        success: true,
        data: user,
        timestamp: Date.now(),
        cached: false,
        responseTime: Date.now() - startTime
      };
      res.json(response);
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'User not found',
        timestamp: Date.now(),
        responseTime: Date.now() - startTime
      };
      res.status(404).json(response);
    }
  } catch (error) {
    console.error('Error in GET /users/:id:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Internal server error',
      timestamp: Date.now(),
      responseTime: Date.now() - startTime
    };
    res.status(500).json(response);
  }
});

// POST /users - Create a new user
app.post('/users', async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  
  try {
    const { name, email }: CreateUserRequest = req.body;
    
    if (!name || !email) {
      const response: ApiResponse = {
        success: false,
        error: 'Name and email are required',
        timestamp: Date.now(),
        responseTime: Date.now() - startTime
      };
      res.status(400).json(response);
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      const response: ApiResponse = {
        success: false,
        error: 'Invalid email format',
        timestamp: Date.now(),
        responseTime: Date.now() - startTime
      };
      res.status(400).json(response);
      return;
    }

    try {
      const newUser = await dbService.createUser(name, email);
      
      // Cache the new user
      const cacheKey = `user:${newUser.id}`;
      userCache.set(cacheKey, newUser);
      
      const response: ApiResponse<User> = {
        success: true,
        data: newUser,
        timestamp: Date.now(),
        responseTime: Date.now() - startTime
      };
      res.status(201).json(response);
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create user',
        timestamp: Date.now(),
        responseTime: Date.now() - startTime
      };
      res.status(500).json(response);
    }
  } catch (error) {
    console.error('Error in POST /users:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Internal server error',
      timestamp: Date.now(),
      responseTime: Date.now() - startTime
    };
    res.status(500).json(response);
  }
});

// DELETE /cache - Clear the entire cache
app.delete('/cache', (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    userCache.clear();
    
    const response: ApiResponse = {
      success: true,
      data: { message: 'Cache cleared successfully' },
      timestamp: Date.now(),
      responseTime: Date.now() - startTime
    };
    res.json(response);
  } catch (error) {
    console.error('Error in DELETE /cache:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to clear cache',
      timestamp: Date.now(),
      responseTime: Date.now() - startTime
    };
    res.status(500).json(response);
  }
});

// GET /cache-status - Get cache statistics
app.get('/cache-status', (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    const cacheStats = userCache.getStats();
    const queueStats = dbService.getQueueStats();
    
    const response: ApiResponse = {
      success: true,
      data: {
        cache: cacheStats,
        queue: queueStats,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage()
      },
      timestamp: Date.now(),
      responseTime: Date.now() - startTime
    };
    res.json(response);
  } catch (error) {
    console.error('Error in GET /cache-status:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to get cache status',
      timestamp: Date.now(),
      responseTime: Date.now() - startTime
    };
    res.status(500).json(response);
  }
});

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
      'GET /cache-status': 'Get cache and queue statistics'
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
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Cache TTL: 60 seconds, Max size: 1000 items`);
  console.log(`🛡️  Rate limit: 10 requests/minute, 5 burst/10 seconds`);
  console.log(`🔗 API Documentation: http://localhost:${PORT}`);
});

export default app;
