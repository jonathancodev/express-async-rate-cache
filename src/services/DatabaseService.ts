import { User, QueueJob } from '../types';
import { v4 as uuidv4 } from 'uuid';

// Mock database
const mockUsers: Record<number, User> = {
  1: { id: 1, name: "John Doe", email: "john@example.com", createdAt: new Date('2023-01-01') },
  2: { id: 2, name: "Jane Smith", email: "jane@example.com", createdAt: new Date('2023-01-02') },
  3: { id: 3, name: "Alice Johnson", email: "alice@example.com", createdAt: new Date('2023-01-03') }
};

export class DatabaseService {
  private readonly processingQueue: QueueJob[] = [];
  private readonly pendingRequests: Map<number, QueueJob[]> = new Map();
  private isProcessing: boolean = false;
  private nextUserId: number = 4;

  constructor() {
    // Start processing queue
    this.startProcessing();
  }

  private startProcessing(): void {
    this.processQueue();
  }

  async getUserById(userId: number): Promise<User> {
    return new Promise((resolve, reject) => {
      const job: QueueJob = {
        id: uuidv4(),
        userId,
        timestamp: Date.now(),
        resolve,
        reject
      };

      // Check if there's already a pending request for this user
      const existingJobs = this.pendingRequests.get(userId);
      if (existingJobs) {
        // Add to existing pending requests
        existingJobs.push(job);
        console.log(`Added request ${job.id} to existing pending requests for user ${userId}`);
        return;
      }

      // Create new pending request group
      this.pendingRequests.set(userId, [job]);
      
      // Add to processing queue
      this.processingQueue.push(job);
      console.log(`Queued request ${job.id} for user ${userId}. Queue size: ${this.processingQueue.length}`);
    });
  }

  async createUser(name: string, email: string): Promise<User> {
    return new Promise((resolve, reject) => {
      // Simulate async database write
      setTimeout(() => {
        try {
          const newUser: User = {
            id: this.nextUserId++,
            name,
            email,
            createdAt: new Date()
          };
          
          mockUsers[newUser.id] = newUser;
          console.log(`Created new user: ${JSON.stringify(newUser)}`);
          resolve(newUser);
        } catch (error) {
          reject(error as Error);
        }
      }, 100); // Shorter delay for user creation
    });
  }

  private async processQueue(): Promise<void> {
    setInterval(async () => {
      if (this.isProcessing || this.processingQueue.length === 0) {
        return;
      }

      this.isProcessing = true;
      
      try {
        // Process one job at a time to simulate database concurrency limits
        const job = this.processingQueue.shift();
        if (job) {
          await this.processJob(job);
        }
      } catch (error) {
        console.error('Error processing queue:', error);
      } finally {
        this.isProcessing = false;
      }
    }, 50); // Process every 50ms
  }

  private async processJob(job: QueueJob): Promise<void> {
    const { userId } = job;
    console.log(`Processing job ${job.id} for user ${userId}`);

    try {
      // Simulate database delay
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const user = mockUsers[userId];
      if (!user) {
        const error = new Error(`User with ID ${userId} not found`);
        this.rejectAllPendingRequests(userId, error);
        return;
      }

      // Resolve all pending requests for this user
      this.resolveAllPendingRequests(userId, user);
      
    } catch (error) {
      console.error(`Error processing job ${job.id}:`, error);
      this.rejectAllPendingRequests(userId, error as Error);
    }
  }

  private resolveAllPendingRequests(userId: number, user: User): void {
    const pendingJobs = this.pendingRequests.get(userId);
    if (pendingJobs) {
      console.log(`Resolving ${pendingJobs.length} pending requests for user ${userId}`);
      
      pendingJobs.forEach(job => {
        job.resolve(user);
      });
      
      this.pendingRequests.delete(userId);
    }
  }

  private rejectAllPendingRequests(userId: number, error: Error): void {
    const pendingJobs = this.pendingRequests.get(userId);
    if (pendingJobs) {
      console.log(`Rejecting ${pendingJobs.length} pending requests for user ${userId}`);
      
      pendingJobs.forEach(job => {
        job.reject(error);
      });
      
      this.pendingRequests.delete(userId);
    }
  }

  // Get queue statistics
  getQueueStats() {
    return {
      queueLength: this.processingQueue.length,
      pendingRequestGroups: this.pendingRequests.size,
      totalPendingRequests: Array.from(this.pendingRequests.values())
        .reduce((total, jobs) => total + jobs.length, 0),
      isProcessing: this.isProcessing
    };
  }

  // Get all users (for testing)
  getAllUsers(): User[] {
    return Object.values(mockUsers);
  }

  // Clear all data (for testing)
  clearData(): void {
    Object.keys(mockUsers).forEach(key => {
      const id = parseInt(key);
      if (id > 3) { // Keep original mock users
        delete mockUsers[id];
      }
    });
    this.nextUserId = 4;
  }
}
