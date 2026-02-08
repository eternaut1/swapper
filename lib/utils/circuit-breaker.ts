/**
 * Circuit Breaker pattern implementation
 * Prevents cascading failures by temporarily blocking calls to failing services
 */

import { logger } from './logger';

/**
 * Circuit breaker states
 */
export enum CircuitState {
  CLOSED = 'closed', // Normal operation
  OPEN = 'open', // Blocking all requests
  HALF_OPEN = 'half-open', // Testing if service recovered
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  /**
   * Number of failures before opening circuit
   */
  failureThreshold: number;

  /**
   * Success threshold to close circuit from half-open
   */
  successThreshold: number;

  /**
   * Time in ms to wait before trying again (half-open state)
   */
  timeout: number;

  /**
   * Optional name for logging
   */
  name?: string;

  /**
   * Optional callback when state changes
   */
  onStateChange?: (oldState: CircuitState, newState: CircuitState) => void;
}

/**
 * Circuit breaker error
 */
export class CircuitBreakerError extends Error {
  constructor(
    message: string,
    public readonly circuitName: string,
    public readonly nextAttemptAt: Date,
  ) {
    super(message);
    this.name = 'CircuitBreakerError';
  }
}

/**
 * Circuit breaker implementation
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private nextAttemptTime = 0;
  private config: Required<CircuitBreakerConfig>;

  constructor(config: CircuitBreakerConfig) {
    this.config = {
      name: 'unnamed',
      onStateChange: () => {},
      ...config,
    };
  }

  /**
   * Execute function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      // Check if timeout has passed
      if (Date.now() < this.nextAttemptTime) {
        const nextAttempt = new Date(this.nextAttemptTime);
        logger.warn('Circuit breaker is OPEN', {
          circuit: this.config.name,
          nextAttemptAt: nextAttempt.toISOString(),
        });

        throw new CircuitBreakerError(
          `Circuit breaker '${this.config.name}' is OPEN. Service unavailable.`,
          this.config.name,
          nextAttempt,
        );
      }

      // Timeout passed, try half-open
      this.transitionTo(CircuitState.HALF_OPEN);
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Handle successful execution
   */
  private onSuccess(): void {
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;

      if (this.successCount >= this.config.successThreshold) {
        this.transitionTo(CircuitState.CLOSED);
        this.successCount = 0;
      }
    }
  }

  /**
   * Handle failed execution
   */
  private onFailure(): void {
    this.failureCount++;
    this.successCount = 0;

    logger.warn('Circuit breaker failure', {
      circuit: this.config.name,
      failureCount: this.failureCount,
      threshold: this.config.failureThreshold,
      state: this.state,
    });

    if (this.state === CircuitState.HALF_OPEN) {
      // Immediately open on failure in half-open state
      this.transitionTo(CircuitState.OPEN);
    } else if (this.failureCount >= this.config.failureThreshold) {
      // Open circuit if threshold reached
      this.transitionTo(CircuitState.OPEN);
    }
  }

  /**
   * Transition to new state
   */
  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;

    if (oldState === newState) {
      return;
    }

    this.state = newState;

    if (newState === CircuitState.OPEN) {
      this.nextAttemptTime = Date.now() + this.config.timeout;
    }

    logger.info('Circuit breaker state changed', {
      circuit: this.config.name,
      oldState,
      newState,
      nextAttemptTime:
        newState === CircuitState.OPEN ? new Date(this.nextAttemptTime).toISOString() : undefined,
    });

    this.config.onStateChange(oldState, newState);
  }

  /**
   * Get current state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get circuit stats
   */
  getStats() {
    return {
      name: this.config.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      nextAttemptTime: this.state === CircuitState.OPEN ? new Date(this.nextAttemptTime) : null,
    };
  }

  /**
   * Manually reset circuit to closed state
   */
  reset(): void {
    this.transitionTo(CircuitState.CLOSED);
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttemptTime = 0;

    logger.info('Circuit breaker manually reset', {
      circuit: this.config.name,
    });
  }

  /**
   * Manually open circuit
   */
  open(): void {
    this.transitionTo(CircuitState.OPEN);
  }
}

/**
 * Circuit breaker registry for managing multiple breakers
 */
class CircuitBreakerRegistry {
  private breakers = new Map<string, CircuitBreaker>();

  /**
   * Get or create circuit breaker
   */
  get(name: string, config?: CircuitBreakerConfig): CircuitBreaker {
    let breaker = this.breakers.get(name);

    if (!breaker) {
      if (!config) {
        throw new Error(`Circuit breaker '${name}' not found and no config provided`);
      }

      breaker = new CircuitBreaker({ ...config, name });
      this.breakers.set(name, breaker);
    }

    return breaker;
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }

  /**
   * Get all circuit breaker stats
   */
  getAllStats() {
    const stats: Record<string, ReturnType<CircuitBreaker['getStats']>> = {};

    for (const [name, breaker] of this.breakers.entries()) {
      stats[name] = breaker.getStats();
    }

    return stats;
  }

  /**
   * Delete circuit breaker
   */
  delete(name: string): void {
    this.breakers.delete(name);
  }

  /**
   * Clear all circuit breakers
   */
  clear(): void {
    this.breakers.clear();
  }
}

/**
 * Global circuit breaker registry
 */
export const circuitBreakerRegistry = new CircuitBreakerRegistry();

/**
 * Preset circuit breaker configurations
 */
export const CircuitBreakerPresets = {
  /**
   * For API calls to external services
   */
  externalApi: {
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 60000, // 1 minute
  },

  /**
   * For blockchain RPC calls
   */
  rpcCall: {
    failureThreshold: 10,
    successThreshold: 3,
    timeout: 30000, // 30 seconds
  },

  /**
   * For database operations
   */
  database: {
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 120000, // 2 minutes
  },
} satisfies Record<string, CircuitBreakerConfig>;
