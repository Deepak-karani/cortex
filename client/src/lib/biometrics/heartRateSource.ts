import type { Telemetry } from '../../types';

export type HeartRateTrend = 'stable' | 'rising' | 'falling' | 'unknown';

export interface HeartRateSample {
  bpm: number;
  hrv: number | null;
  trend: HeartRateTrend;
  stressEstimate: number; // 0..1
  source: 'apple_watch_sim' | 'apple_health' | 'ble' | 'webcam_ppg';
  timestamp: number;
}

export interface HeartRateSource {
  name: string;
  isConnected: () => boolean;
  start: () => Promise<void> | void;
  stop: () => void;
  subscribe: (cb: (s: HeartRateSample) => void) => () => void;
}

/**
 * Apple Watch simulator source. In production this would be replaced by a
 * real BLE / Apple Health bridge — the adapter contract is identical so the
 * rest of the app does not care which source emits samples.
 *
 * In Cortex Arena, the canonical server-side simulation already emits HR/HRV
 * via socket telemetry. This source can either pipe those into a subscriber
 * via the `feedFromServer` mechanism or generate its own samples.
 */
class AppleWatchSimSource implements HeartRateSource {
  name = 'Apple Watch Sim';
  private subs = new Set<(s: HeartRateSample) => void>();
  private connected = false;
  private trendBuffer: number[] = [];

  isConnected() {
    return this.connected;
  }

  start() {
    this.connected = true;
  }

  stop() {
    this.connected = false;
    this.subs.clear();
  }

  subscribe(cb: (s: HeartRateSample) => void) {
    this.subs.add(cb);
    return () => {
      this.subs.delete(cb);
    };
  }

  /**
   * Hook used by the websocket layer to push the server's authoritative
   * biometric stream into this source. The source then derives trend +
   * stress and broadcasts to subscribers — same contract a real Apple Watch
   * BLE bridge would use.
   */
  feedFromServer(t: Telemetry) {
    this.trendBuffer.push(t.heartRate);
    if (this.trendBuffer.length > 8) this.trendBuffer.shift();
    const trend = this.deriveTrend();
    // Stress proxy: high HR + low HRV.
    const stress = Math.max(
      0,
      Math.min(1, (t.heartRate - 70) / 60 + (70 - t.hrv) / 70),
    );
    const sample: HeartRateSample = {
      bpm: t.heartRate,
      hrv: t.hrv,
      trend,
      stressEstimate: Math.max(0, Math.min(1, stress / 2)),
      source: 'apple_watch_sim',
      timestamp: t.timestamp,
    };
    this.subs.forEach((cb) => cb(sample));
  }

  private deriveTrend(): HeartRateTrend {
    if (this.trendBuffer.length < 4) return 'unknown';
    const first = this.trendBuffer.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
    const last = this.trendBuffer.slice(-3).reduce((a, b) => a + b, 0) / 3;
    if (last - first > 3) return 'rising';
    if (first - last > 3) return 'falling';
    return 'stable';
  }
}

const _source = new AppleWatchSimSource();

export function getHeartRateSource(): AppleWatchSimSource {
  return _source;
}
