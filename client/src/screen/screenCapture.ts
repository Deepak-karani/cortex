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
  /**
   * Subscribe to base64 JPEG frames emitted approximately every 6s.
   * Used by the VLM analysis pipeline. Frames are NOT persisted anywhere —
   * the canvas is cleared immediately after each callback returns.
   */
  onFrame: (cb: (jpegBase64: string) => void) => void;
  /** Return the internal <video> element so a small preview can be rendered. */
  getVideoElement: () => HTMLVideoElement | null;
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
  // Dedicated title-bar canvas — a tiny (W × 60px) strip from the top of the
  // captured frame. OCR'd separately because title bars contain the most
  // reliable identity signal (app name + current doc/URL/channel) and run
  // ~5× faster than full-frame OCR.
  let titleCanvas: HTMLCanvasElement | null = null;
  let titleCtx: CanvasRenderingContext2D | null = null;
  let timer: number | null = null;
  let onSummaryCb: ((s: ScreenSummary) => void) | null = null;
  let onStatusCb: ((s: CaptureStatus) => void) | null = null;
  let onFrameCb: ((jpegBase64: string) => void) | null = null;
  let lastFrameEmitAt = 0;
  let active = false;
  let lastTickAt = 0;
  let recentTabHistory: string[] = [];

  const emitStatus = (status: CaptureStatus) => {
    onStatusCb?.(status);
  };

  const tick = async () => {
    if (!active || !video || !canvas || !ctx || !titleCanvas || !titleCtx) return;
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

    // Title-bar pass: crop the top ~60px from the source video, scaled up
    // for OCR. 60px at the source resolution covers macOS chrome (24px) +
    // most tab bars (~32px) without dragging in document body content.
    // Drawing it to a wider canvas (1280 × 80) gives Tesseract more pixels
    // per glyph, which dramatically improves accuracy on small title text.
    const TW = 1280;
    const TH = 80;
    if (titleCanvas.width !== TW || titleCanvas.height !== TH) {
      titleCanvas.width = TW;
      titleCanvas.height = TH;
    }
    const srcTitleH = Math.max(40, Math.round(video.videoHeight * 0.06));
    titleCtx.drawImage(video, 0, 0, video.videoWidth, srcTitleH, 0, 0, TW, TH);

    let rawText = '';
    let titleText = '';
    try {
      const worker = await getWorker();
      // Run both OCR passes in series on the same worker. Title bar first
      // because it's small and finishes in ~60ms — if the body OCR fails
      // mid-pass we still have the high-value identity signal.
      const titleResult = await worker.recognize(titleCanvas);
      titleText = titleResult?.data?.text ?? '';
      const result = await worker.recognize(canvas);
      rawText = result?.data?.text ?? '';
    } catch (err) {
      warn('OCR failed:', (err as Error).message);
    }

    // Emit a base64 JPEG frame to subscribers BEFORE clearing the canvas.
    // We throttle to ~one frame every 6s so VLM/server load stays sane.
    const nowMs = Date.now();
    if (onFrameCb && nowMs - lastFrameEmitAt > 5500) {
      lastFrameEmitAt = nowMs;
      try {
        // toDataURL("image/jpeg", 0.55) keeps the frame ~80-180KB at 960px wide.
        const dataUrl = canvas.toDataURL('image/jpeg', 0.55);
        const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, '');
        onFrameCb(base64);
      } catch (err) {
        warn('frame encode failed:', (err as Error).message);
      }
    }

    // CRITICAL: clear both canvases immediately so frames aren't lingering
    // in GPU/CPU memory beyond this tick.
    ctx.clearRect(0, 0, W, H);
    titleCtx.clearRect(0, 0, TW, TH);

    const { tokens, inferredApp: bodyInferredApp, inferredIntent, inferredWorkflow } =
      tokenizeOcr(rawText);
    // The title bar is the higher-trust signal — if it identifies the app
    // cleanly, prefer it over the body-OCR inference. Body OCR is the
    // fallback for cases where the title bar is empty (custom Electron
    // chrome, full-screen apps, etc).
    const titleParsed = parseTitleBar(titleText);
    const inferredApp = titleParsed.app !== 'Unknown' ? titleParsed.app : bodyInferredApp;
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

    // Build a clean active-title and inferred task. Prefer the title-bar
    // context hint when present (most reliable signal — title bars are
    // designed for humans to read). Fall back to a sentence built from the
    // cleaned body-OCR tokens.
    const fileToken =
      titleParsed.fileHint ??
      tokens.find((t) => /\.(tsx?|jsx?|py|md|swift|rs|go|java|css|html|json)$/i.test(t));
    const projectToken =
      titleParsed.projectHint ??
      tokens.find((t) => !fileToken || t !== fileToken) ??
      null;
    const cleanTitle = titleParsed.contextHint
      ? `${inferredApp} — ${titleParsed.contextHint}`
      : (() => {
          const parts: string[] = [];
          if (projectToken) parts.push(projectToken);
          if (fileToken) parts.push(fileToken);
          return parts.length > 0 ? `${inferredApp} — ${parts.join(' · ')}` : `${inferredApp} session`;
        })();
    const inferredTask = buildInferredTask(inferredIntent, inferredApp, fileToken, projectToken);

    // Map to ScreenSummary.
    const summary: ScreenSummary = {
      timestamp: Date.now(),
      activeApp: inferredApp,
      activeTitle: cleanTitle.slice(0, 140),
      windows: [
        {
          app: inferredApp,
          title: cleanTitle.slice(0, 80),
          category: categorize(inferredApp),
          active: true,
        },
      ],
      tabCount,
      textSampleHash: hash,
      ocrTokens: tokens,
      inferredTask: inferredTask.slice(0, 80),
      inferredProject: projectToken ?? 'unknown',
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
      // We want the user's *work* — not the dashboard itself. Two constraints
      // do most of that:
      //   - `displaySurface: 'window'` hints the OS picker to default to a
      //     window list (VS Code, Terminal, etc.) instead of an entire screen
      //     that would include this browser.
      //   - `selfBrowserSurface: 'exclude'` removes the current tab from the
      //     picker entirely so the user can't accidentally screen-share the
      //     Cortex dashboard back into itself.
      //   - `surfaceSwitching: 'include'` keeps the in-stream "Share a different
      //     window" affordance so they can swap targets without restarting.
      // These are all hints — older browsers silently ignore unknown keys,
      // which is fine. Type-cast through `unknown` because the lib.dom types
      // lag behind the spec.
      const constraints = {
        video: {
          frameRate: { ideal: 4, max: 8 },
          displaySurface: 'window',
        },
        audio: false,
        selfBrowserSurface: 'exclude',
        surfaceSwitching: 'include',
        monitorTypeSurfaces: 'include',
        preferCurrentTab: false,
      } as unknown as DisplayMediaStreamOptions;
      stream = await navigator.mediaDevices.getDisplayMedia(constraints);
    } catch (err) {
      const reason = `${(err as Error).name}: ${(err as Error).message}`;
      warn('getDisplayMedia failed:', reason);
      emitStatus({ kind: 'denied', reason });
      return { ok: false, reason };
    }

    // Defensive check: if `selfBrowserSurface: 'exclude'` was ignored by the
    // browser and the user somehow chose the Cortex tab anyway, abort. We
    // never want to OCR our own dashboard back into itself.
    const track = stream.getVideoTracks()[0];
    const settings = (track?.getSettings?.() ?? {}) as MediaTrackSettings & {
      displaySurface?: string;
    };
    if (settings.displaySurface === 'browser') {
      // It's a browser tab — could still be a different tab, but we have no
      // reliable way to tell. The safer default for a cognitive OS is to
      // refuse and prompt the user to pick a real work window.
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
      const reason =
        'Picked a browser tab. Choose a window (VS Code, Terminal, …) so Cortex sees your work instead of the dashboard.';
      warn(reason);
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
    titleCanvas = document.createElement('canvas');
    titleCtx = titleCanvas.getContext('2d', { willReadFrequently: true });

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
    titleCanvas = null;
    titleCtx = null;
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
    onFrame: (cb) => {
      onFrameCb = cb;
    },
    getVideoElement: () => video,
  };
}

/**
 * Parse the title-bar OCR strip. Apps follow predictable conventions:
 *
 *   VS Code: "filename — project — Visual Studio Code"
 *   Chrome:  "page title — Google Chrome"  + tab strip beneath
 *   Slack:   "#channel | Workspace — Slack"
 *   Terminal/iTerm: "user@host: path"
 *   Figma:   "Frame name — File name"
 *
 * We hunt for the app name (the most stable token) and the leftmost
 * non-app context fragment (file/url/channel/title) and return both.
 * Returns `{ app: 'Unknown', contextHint: null }` if nothing matches.
 */
function parseTitleBar(raw: string): {
  app: string;
  contextHint: string | null;
  projectHint: string | null;
  fileHint: string | null;
} {
  if (!raw || raw.trim().length < 2) {
    return { app: 'Unknown', contextHint: null, projectHint: null, fileHint: null };
  }
  const text = raw.replace(/\s+/g, ' ').trim();
  const lower = text.toLowerCase();

  const APP_SIGNATURES: { app: string; rx: RegExp }[] = [
    { app: 'VS Code', rx: /\b(visual studio code|vscode|code\s*-\s*insiders)\b/i },
    { app: 'Cursor', rx: /\bcursor\b/i },
    { app: 'Chrome', rx: /\bgoogle chrome\b/i },
    { app: 'Arc', rx: /\barc\b\s*(browser)?/i },
    { app: 'Safari', rx: /\bsafari\b/i },
    { app: 'Firefox', rx: /\b(mozilla\s+)?firefox\b/i },
    { app: 'Edge', rx: /\bmicrosoft edge\b/i },
    { app: 'Slack', rx: /\bslack\b/i },
    { app: 'Discord', rx: /\bdiscord\b/i },
    { app: 'Terminal', rx: /\b(terminal|iterm2|warp|kitty|alacritty)\b/i },
    { app: 'Figma', rx: /\bfigma\b/i },
    { app: 'Notion', rx: /\bnotion\b/i },
    { app: 'Linear', rx: /\blinear\b/i },
    { app: 'Zoom', rx: /\bzoom\b/i },
    { app: 'Xcode', rx: /\bxcode\b/i },
    { app: 'IntelliJ', rx: /\b(intellij|webstorm|pycharm|goland|clion|rubymine)\b/i },
  ];

  let app = 'Unknown';
  for (const { app: name, rx } of APP_SIGNATURES) {
    if (rx.test(lower)) {
      app = name;
      break;
    }
  }

  // Title-bar segments are usually separated by " — ", " - ", " | ", or " · ".
  // The leftmost non-empty, non-app segment is the highest-value context.
  const segments = text
    .split(/\s+[—\-|·]\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  let contextHint: string | null = null;
  for (const seg of segments) {
    if (app !== 'Unknown' && new RegExp(app, 'i').test(seg)) continue;
    if (seg.length < 2 || seg.length > 80) continue;
    contextHint = seg;
    break;
  }

  // Pluck file + project hints from the context.
  const fileMatch = contextHint?.match(
    /([A-Za-z0-9_.-]+\.(?:tsx?|jsx?|py|md|swift|rs|go|java|css|html|json))/,
  );
  const fileHint = fileMatch ? fileMatch[1] : null;

  let projectHint: string | null = null;
  if (segments.length >= 2) {
    // For "file — project — App", segments[1] is the project.
    const candidate = segments[1];
    if (
      candidate &&
      candidate.length >= 2 &&
      candidate.length <= 40 &&
      !APP_SIGNATURES.some((s) => s.rx.test(candidate.toLowerCase()))
    ) {
      projectHint = candidate;
    }
  }

  // URL detection — for browser title bars the contextHint is often the
  // page title, but tokens like "stackoverflow.com" are far more useful
  // as a stable identity.
  const urlMatch = text.match(/\b([a-z0-9-]+\.(?:com|io|org|dev|net|app|ai))\b/i);
  if (urlMatch && (app === 'Chrome' || app === 'Arc' || app === 'Safari' || app === 'Firefox')) {
    contextHint = urlMatch[1];
  }

  // Slack channels
  const channelMatch = text.match(/#([a-z0-9_\-]+)/);
  if (channelMatch && app === 'Slack') {
    contextHint = `#${channelMatch[1]}`;
  }

  return { app, contextHint, projectHint, fileHint };
}

function buildInferredTask(
  intent: string,
  app: string,
  file: string | undefined,
  project: string | null,
): string {
  // Intent already reads like a verb phrase ("Debugging an error",
  // "Researching a solution"). Anchor it to the most concrete signal we have:
  // the file > the project > the app.
  const target = file ?? project ?? app;
  // Avoid awkward phrases like "Writing or reading code in code".
  if (target.toLowerCase() === app.toLowerCase()) {
    return `${intent} in ${app}`;
  }
  return `${intent} in ${target}`;
}

function categorize(app: string): string {
  if (/code|terminal|iterm|warp/i.test(app)) return 'ide';
  if (/chrome|safari|firefox|arc|edge/i.test(app)) return 'browser';
  if (/slack|discord|teams|zoom/i.test(app)) return 'chat';
  if (/figma|sketch|illustrator/i.test(app)) return 'design';
  if (/notion|docs|word|pages/i.test(app)) return 'doc';
  return 'other';
}
