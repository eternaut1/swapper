/**
 * Modern rate limiter with sliding window algorithm and Redis support
 * Provides accurate rate limiting with distributed support
 */

import { LRUCache } from 'lru-cache';
import type { NextRequest } from 'next/server';
import { logger } from '@/lib/utils/logger';

/**
 * Rate limit tiers
 */
export enum RateLimitTier {
  STRICT = 'strict',
  STANDARD = 'standard',
  RELAXED = 'relaxed',
  UNLIMITED = 'unlimited',
}

/**
 * Rate limit configuration per tier
 */
export interface TierConfig {
  paths: string[];
  limit: number;
  windowMs: number;
}

/**
 * Rate limiter configuration
 */
export interface RateLimiterConfig {
  tiers: Record<RateLimitTier, TierConfig>;
  bypassPaths?: string[];
  storage?: RateLimitStorage;
}

/**
 * Rate limit result
 */
export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  reset: Date;
  retryAfter: number;
}

/**
 * Storage interface for rate limit data
 * Can be implemented with Redis, DynamoDB, etc.
 */
export interface RateLimitStorage {
  get(key: string): Promise<number[] | null>;
  set(key: string, value: number[], ttlMs: number): Promise<void>;
  delete(key: string): Promise<void>;
}

/**
 * In-memory storage using LRU cache
 * Good for single-instance deployments
 */
class MemoryStorage implements RateLimitStorage {
  private cache: LRUCache<string, number[]>;

  constructor(maxSize: number = 10000) {
    this.cache = new LRUCache({
      max: maxSize,
      ttl: 3600000, // 1 hour default TTL
      updateAgeOnGet: false,
      updateAgeOnHas: false,
    });
  }

  async get(key: string): Promise<number[] | null> {
    return this.cache.get(key) || null;
  }

  async set(key: string, value: number[], ttlMs: number): Promise<void> {
    this.cache.set(key, value, { ttl: ttlMs });
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
  }

  /**
   * Get cache stats
   */
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.cache.max,
    };
  }
}

/**
 * Redis storage adapter (optional, for distributed systems)
 * Uncomment and implement when Redis is available
 */
/*
class RedisStorage implements RateLimitStorage {
  private client: any; // Redis client type

  constructor(redisClient: any) {
    this.client = redisClient;
  }

  async get(key: string): Promise<number[] | null> {
    const value = await this.client.get(key);
    return value ? JSON.parse(value) : null;
  }

  async set(key: string, value: number[], ttlMs: number): Promise<void> {
    await this.client.set(key, JSON.stringify(value), 'PX', ttlMs);
  }

  async delete(key: string): Promise<void> {
    await this.client.del(key);
  }
}
*/

/**
 * Sliding window rate limiter
 * More accurate than token bucket for burst prevention
 */
export class SlidingWindowRateLimiter {
  private storage: RateLimitStorage;
  private tiers: Map<string, TierConfig>;
  private bypassPaths: Set<string>;

  constructor(config: RateLimiterConfig) {
    this.storage = config.storage || new MemoryStorage();
    this.tiers = new Map(Object.entries(config.tiers));
    this.bypassPaths = new Set(config.bypassPaths || []);
  }

  /**
   * Check if request should be rate limited
   */
  async check(request: NextRequest, options: { dryRun?: boolean } = {}): Promise<RateLimitResult> {
    const path = new URL(request.url).pathname;

    // Check if path should bypass rate limiting
    if (this.shouldBypass(path)) {
      return {
        allowed: true,
        limit: Number.MAX_SAFE_INTEGER,
        remaining: Number.MAX_SAFE_INTEGER,
        reset: new Date(Date.now() + 60000),
        retryAfter: 0,
      };
    }

    // Find applicable tier for this path
    const tier = this.getTierForPath(path);
    if (!tier) {
      return {
        allowed: true,
        limit: Number.MAX_SAFE_INTEGER,
        remaining: Number.MAX_SAFE_INTEGER,
        reset: new Date(Date.now() + 60000),
        retryAfter: 0,
      };
    }

    // Generate key for this client
    const key = this.generateKey(request, tier);

    // Get current window
    const now = Date.now();
    const windowStart = now - tier.windowMs;

    // Get request timestamps
    const timestamps = (await this.storage.get(key)) || [];

    // Filter out old timestamps (outside current window)
    const validTimestamps = timestamps.filter((ts) => ts > windowStart);

    // Calculate remaining quota
    const currentCount = validTimestamps.length;
    const remaining = Math.max(0, tier.limit - currentCount);
    const allowed = currentCount < tier.limit;

    // Calculate reset time (when oldest request will expire)
    const oldestTimestamp = validTimestamps[0] || now;
    const reset = new Date(oldestTimestamp + tier.windowMs);

    // Calculate retry after (in seconds)
    const retryAfter = allowed ? 0 : Math.ceil((reset.getTime() - now) / 1000);

    // Update storage (if not dry run and request is allowed)
    if (!options.dryRun && allowed) {
      const newTimestamps = [...validTimestamps, now];
      await this.storage.set(key, newTimestamps, tier.windowMs);
    }

    // Log if approaching limit
    if (remaining < tier.limit * 0.2) {
      logger.warn('Client approaching rate limit', {
        key,
        path,
        remaining,
        limit: tier.limit,
      });
    }

    return {
      allowed,
      limit: tier.limit,
      remaining,
      reset,
      retryAfter,
    };
  }

  /**
   * Check if path should bypass rate limiting
   */
  private shouldBypass(path: string): boolean {
    return Array.from(this.bypassPaths).some((bypassPath) => path.startsWith(bypassPath));
  }

  /**
   * Get tier configuration for a path
   */
  private getTierForPath(path: string): TierConfig | null {
    for (const [, config] of this.tiers) {
      if (config.paths.some((p) => path.startsWith(p))) {
        return config;
      }
    }
    return null;
  }

  /**
   * Generate storage key for a request
   */
  private generateKey(request: NextRequest, _tier: TierConfig): string {
    // Get client identifier (IP address)
    const ip = this.getClientIp(request);

    // Could also include auth token, API key, etc.
    const authToken = request.headers.get('authorization');
    const apiKey = request.headers.get('x-api-key');

    // Use auth identifier if available, otherwise IP
    const identifier = apiKey || authToken || ip;

    // Include path in key to allow different limits per endpoint
    const path = new URL(request.url).pathname;

    return `ratelimit:${identifier}:${path}`;
  }

  /**
   * Get client IP address
   */
  private getClientIp(request: NextRequest): string {
    const forwarded = request.headers.get('x-forwarded-for');
    const realIp = request.headers.get('x-real-ip');
    const cfConnectingIp = request.headers.get('cf-connecting-ip');

    return (
      cfConnectingIp ||
      realIp ||
      (forwarded ? (forwarded.split(',')[0]?.trim() ?? 'unknown') : 'unknown')
    );
  }

  /**
   * Reset rate limit for a specific key
   */
  async reset(key: string): Promise<void> {
    await this.storage.delete(key);
    logger.info('Rate limit reset', { key });
  }

  /**
   * Get stats (if using MemoryStorage)
   */
  getStats() {
    if (this.storage instanceof MemoryStorage) {
      return this.storage.getStats();
    }
    return null;
  }
}

/**
 * Create rate limiter instance
 */
export function createRateLimiter(config: RateLimiterConfig): SlidingWindowRateLimiter {
  return new SlidingWindowRateLimiter(config);
}

/**
 * Export storage implementations
 */
export { MemoryStorage };
