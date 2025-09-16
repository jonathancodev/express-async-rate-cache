export interface User {
  id: number;
  name: string;
  email: string;
  createdAt?: Date;
}

export interface CacheEntry<T> {
  value: T;
  timestamp: number;
  accessCount: number;
  lastAccessed: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  currentSize: number;
  maxSize: number;
  averageResponseTime: number;
  totalRequests: number;
}

export interface RateLimitInfo {
  count: number;
  resetTime: number;
  burstCount: number;
  burstResetTime: number;
}

export interface QueueJob {
  id: string;
  userId: number;
  timestamp: number;
  resolve: (user: User) => void;
  reject: (error: Error) => void;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: number;
  cached?: boolean;
  responseTime?: number;
}

export interface CreateUserRequest {
  name: string;
  email: string;
}
