import { Router, Request, Response } from 'express';
import { LRUCache } from '../cache/LRUCache';
import { DatabaseService } from '../services/DatabaseService';
import { User, ApiResponse } from '../types';

export function createCacheRouter(userCache: LRUCache<User>, dbService: DatabaseService): Router {
  const router = Router();

  // DELETE /cache - Clear the entire cache
  router.delete('/', (req: Request, res: Response) => {
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
  router.get('/status', (req: Request, res: Response) => {
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
      console.error('Error in GET /cache/status:', error);
      const response: ApiResponse = {
        success: false,
        error: 'Failed to get cache status',
        timestamp: Date.now(),
        responseTime: Date.now() - startTime
      };
      res.status(500).json(response);
    }
  });

  return router;
}
