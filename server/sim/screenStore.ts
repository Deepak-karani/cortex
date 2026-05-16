import type { ScreenSummary } from '../src/types';

let latest: ScreenSummary | null = null;

export function setLatestScreen(s: ScreenSummary): void {
  latest = s;
}

export function getLatestScreen(): ScreenSummary | null {
  return latest;
}

export function clearLatestScreen(): void {
  latest = null;
}
