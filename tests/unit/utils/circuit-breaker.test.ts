import {
  CircuitBreaker,
  CircuitBreakerError,
  CircuitBreakerPresets,
  CircuitState,
  circuitBreakerRegistry,
} from '@/lib/utils/circuit-breaker';

jest.mock('@/lib/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

describe('CircuitBreaker', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const defaultConfig = {
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 5000,
    name: 'test',
  };

  it('starts in CLOSED state', () => {
    const cb = new CircuitBreaker(defaultConfig);
    expect(cb.getState()).toBe(CircuitState.CLOSED);
  });

  it('executes successfully in CLOSED state', async () => {
    const cb = new CircuitBreaker(defaultConfig);
    const result = await cb.execute(() => Promise.resolve('ok'));
    expect(result).toBe('ok');
    expect(cb.getState()).toBe(CircuitState.CLOSED);
  });

  it('transitions to OPEN after reaching failure threshold', async () => {
    const cb = new CircuitBreaker(defaultConfig);

    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow('fail');
    }

    expect(cb.getState()).toBe(CircuitState.OPEN);
  });

  it('throws CircuitBreakerError when OPEN and timeout not passed', async () => {
    const cb = new CircuitBreaker(defaultConfig);

    // Open the circuit
    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    }

    await expect(cb.execute(() => Promise.resolve('ok'))).rejects.toThrow(CircuitBreakerError);
  });

  it('transitions OPEN → HALF_OPEN after timeout', async () => {
    const cb = new CircuitBreaker(defaultConfig);

    // Open the circuit
    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    }
    expect(cb.getState()).toBe(CircuitState.OPEN);

    // Advance past timeout
    jest.advanceTimersByTime(5001);

    // Next call should transition to HALF_OPEN and execute
    const result = await cb.execute(() => Promise.resolve('recovered'));
    expect(result).toBe('recovered');
    expect(cb.getState()).toBe(CircuitState.HALF_OPEN);
  });

  it('transitions HALF_OPEN → CLOSED after success threshold', async () => {
    const cb = new CircuitBreaker(defaultConfig);

    // Open circuit
    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    }

    // Advance past timeout
    jest.advanceTimersByTime(5001);

    // Success threshold is 2
    await cb.execute(() => Promise.resolve('ok'));
    expect(cb.getState()).toBe(CircuitState.HALF_OPEN);

    await cb.execute(() => Promise.resolve('ok'));
    expect(cb.getState()).toBe(CircuitState.CLOSED);
  });

  it('transitions HALF_OPEN → OPEN on failure', async () => {
    const cb = new CircuitBreaker(defaultConfig);

    // Open circuit
    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    }

    // Advance past timeout
    jest.advanceTimersByTime(5001);

    // Succeed once (enter HALF_OPEN)
    await cb.execute(() => Promise.resolve('ok'));
    expect(cb.getState()).toBe(CircuitState.HALF_OPEN);

    // Fail → immediately back to OPEN
    await expect(cb.execute(() => Promise.reject(new Error('fail again')))).rejects.toThrow();
    expect(cb.getState()).toBe(CircuitState.OPEN);
  });

  it('stays CLOSED when failures are below threshold', async () => {
    const cb = new CircuitBreaker(defaultConfig);

    // 2 failures (threshold is 3)
    await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    expect(cb.getState()).toBe(CircuitState.CLOSED);

    // Success resets failure count
    await cb.execute(() => Promise.resolve('ok'));
    expect(cb.getState()).toBe(CircuitState.CLOSED);
  });

  it('calls onStateChange callback', async () => {
    const stateChanges: [CircuitState, CircuitState][] = [];
    const cb = new CircuitBreaker({
      ...defaultConfig,
      onStateChange: (old, next) => stateChanges.push([old, next]),
    });

    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    }

    expect(stateChanges).toEqual([[CircuitState.CLOSED, CircuitState.OPEN]]);
  });

  it('getStats returns correct info', async () => {
    const cb = new CircuitBreaker(defaultConfig);
    const stats = cb.getStats();
    expect(stats.name).toBe('test');
    expect(stats.state).toBe(CircuitState.CLOSED);
    expect(stats.failureCount).toBe(0);
    expect(stats.nextAttemptTime).toBeNull();
  });

  it('reset returns to CLOSED state', async () => {
    const cb = new CircuitBreaker(defaultConfig);

    // Open circuit
    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    }
    expect(cb.getState()).toBe(CircuitState.OPEN);

    cb.reset();
    expect(cb.getState()).toBe(CircuitState.CLOSED);
    expect(cb.getStats().failureCount).toBe(0);
  });

  it('open() manually opens the circuit', () => {
    const cb = new CircuitBreaker(defaultConfig);
    cb.open();
    expect(cb.getState()).toBe(CircuitState.OPEN);
  });
});

describe('CircuitBreakerRegistry', () => {
  beforeEach(() => {
    circuitBreakerRegistry.clear();
  });

  it('creates and retrieves breaker', () => {
    const breaker = circuitBreakerRegistry.get('test', CircuitBreakerPresets.externalApi);
    expect(breaker).toBeInstanceOf(CircuitBreaker);

    // Same instance on second call
    const same = circuitBreakerRegistry.get('test');
    expect(same).toBe(breaker);
  });

  it('throws if breaker not found and no config', () => {
    expect(() => circuitBreakerRegistry.get('nonexistent')).toThrow();
  });

  it('resetAll resets all breakers', () => {
    const b1 = circuitBreakerRegistry.get('a', CircuitBreakerPresets.externalApi);
    const b2 = circuitBreakerRegistry.get('b', CircuitBreakerPresets.rpcCall);

    b1.open();
    b2.open();

    circuitBreakerRegistry.resetAll();

    expect(b1.getState()).toBe(CircuitState.CLOSED);
    expect(b2.getState()).toBe(CircuitState.CLOSED);
  });

  it('getAllStats returns stats for all breakers', () => {
    circuitBreakerRegistry.get('x', CircuitBreakerPresets.externalApi);
    circuitBreakerRegistry.get('y', CircuitBreakerPresets.database);

    const stats = circuitBreakerRegistry.getAllStats();
    expect(Object.keys(stats)).toHaveLength(2);
    expect(stats['x']).toBeDefined();
    expect(stats['y']).toBeDefined();
  });

  it('delete removes a breaker', () => {
    circuitBreakerRegistry.get('temp', CircuitBreakerPresets.externalApi);
    circuitBreakerRegistry.delete('temp');
    expect(() => circuitBreakerRegistry.get('temp')).toThrow();
  });
});

describe('CircuitBreakerPresets', () => {
  it('defines expected presets', () => {
    expect(CircuitBreakerPresets.externalApi.failureThreshold).toBe(5);
    expect(CircuitBreakerPresets.rpcCall.failureThreshold).toBe(10);
    expect(CircuitBreakerPresets.database.failureThreshold).toBe(3);
  });
});
