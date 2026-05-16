import { createWorker, type Worker as TesseractWorker } from 'tesseract.js';
import type { ScreenSummary } from '../types';
import { hashTokens, tokenizeOcr } from './tokenizer';

const log = (...args: unknown[]) => console.log('[screen]', ...args);
const warn = (...args: unknown[]) => console.warn('[screen]', ...args);

let workerPromise: Promise<TesseractWorker> | null = null;

async function getWorker(): Promise<TesseractWorker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const w = await createWorker('eng', undefined, {
        logger: () => {}, // silence progress noise
      });
      return w;
    })();
  }
  return workerPromise;
}

export async function disposeOcr(): Promise<void> {
  if (workerPromise) {
    try {
      const w = await workerPromise;
      await w.terminate();
    } catch {
      // ignore
    }
    workerPromise = null;
  }
}

export interface CapturePipeline {
  start: () => Promise<{ ok: true } | { ok: false; reason: string }>;
  stop: () => void;
  isActive: () => boolean;
  onSummary: (cb: (s: ScreenSummary) => void) => void;
  onStatus: (cb: (status: CaptureStatus) => void) => void;
}

export type CaptureStatus =
  | { kind: 'idle' }
  | { kind: 'requesting' }
  | { kind: 'loading_ocr' }
  | { kind: 'running'; fps: number; lastHash: string }
  | { kind: 'denied'; reason: string }
  | { kind: 'error'; reason: string };

/**
 * Screen Understanding pipeline.
 *
 * Privacy contract (enforced here):
 *  1. We acquire a getDisplayMedia stream.
 *  2. Every ~3 seconds we draw the current frame to a canvas, run OCR on it,
 *     tokenize the result, and immediately discard the canvas pixels.
 *  3. Only the summary (tokens + inferred fields + counts) is exposed via the
 *     onSummary callback. Frames are NEVER persisted, exposed, or sent.
 *  4. The stream object lives only in this closure.
 */
export function createScreenCapture(): CapturePipeline {
  let stream: MediaStream | null = null;
  let video: HTMLVideoElement | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let timer: number | null = null;
  let onSummaryCb: ((s: ScreenSummary) => void) | null = null;
  let onStatusCb: ((s: CaptureStatus) => void) | null = null;
  let active = false;
  let lastTickAt = 0;
  let recentTabHistory: string[] = [];

  const emitStatus = (status: CaptureStatus) => {
    onStatusCb?.(status);
  };

  const tick = async () => {
    if (!active || !video || !canvas || !ctx) return;
    if (video.readyState < 2) return;
    const t0 = performance.now();

    // Downscale aggressively — OCR doesn't need 4K, and small canvas = fast.
    const W = 960;
    const aspect = video.videoHeight / Math.max(1, video.videoWidth);
    const H = Math.max(540, Math.round(W * aspect));
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }
    ctx.drawImage(video, 0, 0, W, H);

    let rawText = '';
    try {
      const worker = await getWorker();
      const result = await worker.recognize(canvas);
      rawText = result?.data?.text ?? '';
    } catch (err) {
      warn('OCR failed:', (err as Error).message);
    }

    // CRITICAL: clear the canvas immediately so the frame isn't lingering in
    // GPU/CPU memory beyond this tick.
    ctx.clearRect(0, 0, W, H);

    const { tokens, inferredApp, inferredIntent, inferredWorkflow } = tokenizeOcr(rawText);
    const hash = hashTokens(tokens);

    // Track recent activeApp history to detect tab thrash on the client side.
    recentTabHistory.push(inferredApp);
    if (recentTabHistory.length > 30) recentTabHistory = recentTabHistory.slice(-30);
    const distinctRecent = new Set(recentTabHistory.slice(-20)).size;
    const finalWorkflow: ScreenSummary['workflowState'] =
      distinctRecent >= 5 ? 'switching' : inferredWorkflow;

    // Approximate "tab count" from tokens that look like URLs / hostnames.
    const urlTokens = tokens.filter((t) => /[a-z]+\.(com|io|org|dev|net)/.test(t));
    const tabCount = Math.max(1, urlTokens.length);

    // Heuristic active-title: first long token group from raw text.
    const titleCandidate =
      rawText
        .split('\n')
        .map((l) => l.trim())
        .find((l) => l.length > 8 && l.length < 80) ?? `${inferredApp} session`;

    // Map to ScreenSummary.
    const summary: ScreenSummary = {
      timestamp: Date.now(),
      activeApp: inferredApp,
      activeTitle: titleCandidate.slice(0, 140),
      windows: [
        {
          app: inferredApp,
          title: titleCandidate.slice(0, 80),
          category: categorize(inferredApp),
          active: true,
        },
      ],
      tabCount,
      textSampleHash: hash,
      ocrTokens: tokens,
      inferredTask: titleCandidate.split(/[-—|·]/)[0].trim().slice(0, 60) || inferredApp,
      inferredProject: tokens[0] ?? 'unknown',
      inferredIntent,
      workflowState: finalWorkflow,
      confidence: tokens.length >= 6 ? 0.85 : tokens.length >= 3 ? 0.6 : 0.35,
      source: 'capture',
    };

    onSummaryCb?.(summary);
    const dt = performance.now() - t0;
    const fps = dt > 0 ? 1000 / dt : 0;
    emitStatus({ kind: 'running', fps: Math.round(fps * 10) / 10, lastHash: hash });
    lastTickAt = performance.now();
  };

  const start: CapturePipeline['start'] = async () => {
    if (active) return { ok: true };
    if (!navigator.mediaDevices?.getDisplayMedia) {
      const reason = 'getDisplayMedia not supported in this browser.';
      emitStatus({ kind: 'error', reason });
      return { ok: false, reason };
    }
    emitStatus({ kind: 'requesting' });
    try {
      log('requesting display media...');
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 4, max: 8 } },
        audio: false,
      });
    } catch (err) {
      const reason = `${(err as Error).name}: ${(err as Error).message}`;
      warn('getDisplayMedia failed:', reason);
      emitStatus({ kind: 'denied', reason });
      return { ok: false, reason };
    }

    video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    await video.play().catch(() => {});

    canvas = document.createElement('canvas');
    ctx = canvas.getContext('2d', { willReadFrequently: true });

    // Stop pipeline if user clicks "Stop sharing" in browser bar.
    stream.getVideoTracks().forEach((t) => {
      t.onended = () => {
        log('user ended screen share');
        stop();
      };
    });

    emitStatus({ kind: 'loading_ocr' });
    try {
      await getWorker();
    } catch (err) {
      const reason = `OCR worker failed to start (${(err as Error).message}).`;
      warn(reason);
      emitStatus({ kind: 'error', reason });
      return { ok: false, reason };
    }

    active = true;
    lastTickAt = performance.now();
    // OCR is ~150-400ms per tick on a modern laptop. We tick every 3s, which is
    // plenty for "what is the user doing right now" without burning CPU.
    timer = window.setInterval(() => {
      void tick();
    }, 3000) as unknown as number;
    // Run one immediately so the UI doesn't wait 3s.
    void tick();
    return { ok: true };
  };

  const stop: CapturePipeline['stop'] = () => {
    active = false;
    if (timer) {
      window.clearInterval(timer);
      timer = null;
    }
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    if (video) {
      video.srcObject = null;
      video = null;
    }
    canvas = null;
    ctx = null;
    emitStatus({ kind: 'idle' });
    void disposeOcr();
  };

  return {
    start,
    stop,
    isActive: () => active,
    onSummary: (cb) => {
      onSummaryCb = cb;
    },
    onStatus: (cb) => {
      onStatusCb = cb;
    },
  };
}

function categorize(app: string): string {
  if (/code|terminal|iterm|warp/i.test(app)) return 'ide';
  if (/chrome|safari|firefox|arc|edge/i.test(app)) return 'browser';
  if (/slack|discord|teams|zoom/i.test(app)) return 'chat';
  if (/figma|sketch|illustrator/i.test(app)) return 'design';
  if (/notion|docs|word|pages/i.test(app)) return 'doc';
  return 'other';
}
