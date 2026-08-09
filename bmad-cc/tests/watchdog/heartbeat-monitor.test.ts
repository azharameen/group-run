import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HeartbeatMonitor } from '../../src/watchdog/heartbeat-monitor';

describe('HeartbeatMonitor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts monitor, isTimedOut is false initially', () => {
    const monitor = new HeartbeatMonitor({
      timeoutMs: 1000,
      onTimeout: () => {},
      onActivity: () => {}
    });
    
    monitor.start();
    expect(monitor.isTimedOut()).toBe(false);
  });

  it('pulse resets the timer', () => {
    const onTimeout = vi.fn();
    const monitor = new HeartbeatMonitor({
      timeoutMs: 1000,
      onTimeout,
      onActivity: () => {}
    });
    
    monitor.start();
    
    vi.advanceTimersByTime(800);
    monitor.pulse();
    
    vi.advanceTimersByTime(800);
    expect(onTimeout).not.toHaveBeenCalled();
    expect(monitor.isTimedOut()).toBe(false);
  });

  it('timeout fires after configured interval with no pulses', () => {
    const onTimeout = vi.fn();
    const monitor = new HeartbeatMonitor({
      timeoutMs: 1000,
      onTimeout,
      onActivity: () => {}
    });
    
    monitor.start();
    
    vi.advanceTimersByTime(1100);
    
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(monitor.isTimedOut()).toBe(true);
  });

  it('stop prevents timeout callback', () => {
    const onTimeout = vi.fn();
    const monitor = new HeartbeatMonitor({
      timeoutMs: 1000,
      onTimeout,
      onActivity: () => {}
    });
    
    monitor.start();
    monitor.stop();
    
    vi.advanceTimersByTime(1500);
    
    expect(onTimeout).not.toHaveBeenCalled();
    expect(monitor.isTimedOut()).toBe(false);
  });
});
