import type { AttentionMetrics, CognitiveAssessment, FallbackStatus } from '../types';

interface Props {
  connected: boolean;
  assessment: CognitiveAssessment | null;
  fallback: FallbackStatus;
  attention: AttentionMetrics | null;
}

export default function TopBar({ connected, assessment, fallback, attention }: Props) {
  const stateColor =
    assessment?.state === 'Red'
      ? 'text-cortex-red'
      : assessment?.state === 'Yellow'
      ? 'text-cortex-yellow'
      : assessment?.state === 'Intervention'
      ? 'text-cortex-violet'
      : 'text-cortex-green';

  return (
    <header className="px-5 py-3 border-b border-cortex-border/60 flex items-center justify-between bg-cortex-panel/40 backdrop-blur">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="relative">
            <div className="w-2.5 h-2.5 rounded-full bg-cortex-accent shadow-glow animate-pulse-slow" />
          </div>
          <h1 className="font-mono tracking-[0.3em] text-sm text-cortex-ink">
            CORTEX <span className="text-cortex-accent">ARENA</span>
          </h1>
          <span className="text-[10px] uppercase tracking-widest text-cortex-dim font-mono">
            autonomous cognitive OS
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3 text-[11px] font-mono">
        {assessment && (
          <div className={`pill border border-current/30 bg-current/10 ${stateColor}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
            state: {assessment.state} · load {assessment.cognitiveLoadScore}
          </div>
        )}
        {attention && (
          <div
            className={`pill border ${
              attention.interpretedState === 'Focused'
                ? 'border-cortex-green/40 text-cortex-green bg-cortex-green/10'
                : attention.interpretedState === 'Distracted'
                ? 'border-cortex-red/40 text-cortex-red bg-cortex-red/10'
                : attention.interpretedState === 'Fatigued'
                ? 'border-cortex-violet/40 text-cortex-violet bg-cortex-violet/10'
                : 'border-cortex-yellow/40 text-cortex-yellow bg-cortex-yellow/10'
            }`}
            title={`source=${attention.source}`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            attention: {attention.interpretedState} · {attention.attentionScore}
          </div>
        )}
        <div
          className={`pill border ${
            fallback.active
              ? 'border-cortex-yellow/40 text-cortex-yellow bg-cortex-yellow/10'
              : 'border-cortex-green/40 text-cortex-green bg-cortex-green/10'
          }`}
          title={fallback.reason}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-current" />
          {fallback.active ? 'mock fallback active' : 'nemotron live'}
        </div>
        <div
          className={`pill border ${
            connected
              ? 'border-cortex-accent/40 text-cortex-accent bg-cortex-accent/10'
              : 'border-cortex-red/40 text-cortex-red bg-cortex-red/10'
          }`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-current" />
          {connected ? 'socket online' : 'socket offline'}
        </div>
      </div>
    </header>
  );
}
