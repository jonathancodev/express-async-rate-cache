import { Router, Request, Response } from 'express';
import { LRUCache } from '../cache/LRUCache';
import { DatabaseService } from '../services/DatabaseService';
import { User, ApiResponse, CreateUserRequest } from '../types';

export function createUsersRouter(userCache: LRUCache<User>, dbService: DatabaseService): Router {
  const router = Router();

  // GET /users/:id - Retrieve user data by ID
  router.get('/:id', async (req: Request, res: Response): Promise<void> => {
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
  router.post('/', async (req: Request, res: Response): Promise<void> => {
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

  return router;
}
