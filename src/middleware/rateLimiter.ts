import { Request, Response, NextFunction } from 'express';
import { RateLimitInfo } from '../types';

export class RateLimiter {
  private readonly clients: Map<string, RateLimitInfo>;
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly burstCapacity: number;
  private readonly burstWindowMs: number;

  constructor(
    maxRequests: number = 10,
    windowMs: number = 60000, // 1 minute
    burstCapacity: number = 5,
    burstWindowMs: number = 10000 // 10 seconds
  ) {
    this.clients = new Map();
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.burstCapacity = burstCapacity;
    this.burstWindowMs = burstWindowMs;

    // Cleanup expired entries every minute
    setInterval(() => {
      this.cleanupExpired();
    }, 60000);
  }

  middleware() {
    return (req: Request, res: Response, next: NextFunction): void => {
      const clientId = this.getClientId(req);
      const now = Date.now();

      let rateLimitInfo = this.clients.get(clientId);

      if (!rateLimitInfo) {
        rateLimitInfo = {
          count: 0,
          resetTime: now + this.windowMs,
          burstCount: 0,
          burstResetTime: now + this.burstWindowMs
        };
        this.clients.set(clientId, rateLimitInfo);
      }

      // Reset counters if windows have expired
      if (now >= rateLimitInfo.resetTime) {
        rateLimitInfo.count = 0;
        rateLimitInfo.resetTime = now + this.windowMs;
      }

      if (now >= rateLimitInfo.burstResetTime) {
        rateLimitInfo.burstCount = 0;
        rateLimitInfo.burstResetTime = now + this.burstWindowMs;
      }

      // Check burst limit first (stricter)
      if (rateLimitInfo.burstCount >= this.burstCapacity) {
        const burstRetryAfter = Math.ceil((rateLimitInfo.burstResetTime - now) / 1000);
        res.status(429).json({
          success: false,
          error: `Too many requests. Burst limit of ${this.burstCapacity} requests per ${this.burstWindowMs / 1000} seconds exceeded.`,
          retryAfter: burstRetryAfter,
          limit: this.burstCapacity,
          remaining: 0,
          resetTime: rateLimitInfo.burstResetTime,
          timestamp: now
        });
        return;
      }

      // Check regular rate limit
      if (rateLimitInfo.count >= this.maxRequests) {
        const retryAfter = Math.ceil((rateLimitInfo.resetTime - now) / 1000);
        res.status(429).json({
          success: false,
          error: `Too many requests. Rate limit of ${this.maxRequests} requests per ${this.windowMs / 1000} seconds exceeded.`,
          retryAfter: retryAfter,
          limit: this.maxRequests,
          remaining: 0,
          resetTime: rateLimitInfo.resetTime,
          timestamp: now
        });
        return;
      }

      // Increment counters
      rateLimitInfo.count++;
      rateLimitInfo.burstCount++;

      // Add rate limit headers
      res.set({
        'X-RateLimit-Limit': this.maxRequests.toString(),
        'X-RateLimit-Remaining': (this.maxRequests - rateLimitInfo.count).toString(),
        'X-RateLimit-Reset': rateLimitInfo.resetTime.toString(),
        'X-RateLimit-Burst-Limit': this.burstCapacity.toString(),
        'X-RateLimit-Burst-Remaining': (this.burstCapacity - rateLimitInfo.burstCount).toString(),
        'X-RateLimit-Burst-Reset': rateLimitInfo.burstResetTime.toString()
      });

      next();
    };
  }

  private getClientId(req: Request): string {
    // Use IP address as client identifier
    // In production, we might want to use user ID or API key
    return req.ip ?? req.socket.remoteAddress ?? 'unknown';
  }

  private cleanupExpired(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [clientId, info] of this.clients.entries()) {
      // Remove entries that are past both reset times
      if (now >= info.resetTime && now >= info.burstResetTime) {
        keysToDelete.push(clientId);
      }
    }

    keysToDelete.forEach(key => {
      this.clients.delete(key);
    });

    if (keysToDelete.length > 0) {
      console.log(`Cleaned up ${keysToDelete.length} expired rate limit entries`);
    }
  }

  // Get current rate limit status for a client
  getStatus(req: Request): RateLimitInfo | null {
    const clientId = this.getClientId(req);
    return this.clients.get(clientId) || null;
  }

  // Reset rate limit for a specific client (for testing)
  reset(clientId?: string): void {
    if (clientId) {
      this.clients.delete(clientId);
    } else {
      this.clients.clear();
    }
  }
}
