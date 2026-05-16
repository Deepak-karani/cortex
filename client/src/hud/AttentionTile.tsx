import { motion } from 'framer-motion';
import { CameraOff, Eye, ShieldCheck, Video } from 'lucide-react';
import type { AttentionHeatPoint, AttentionMetrics } from '../types';
import type { AttentionDiagnostic, WebcamStatus } from '../hooks/useAttentionTracking';
import { Panel } from './Panel';

interface Props {
  videoRef: React.RefObject<HTMLVideoElement>;
  metrics: AttentionMetrics | null;
  status: WebcamStatus;
  errorMessage: string | null;
  heat: AttentionHeatPoint[];
  fps: number;
  source: 'webcam' | 'simulated' | null;
  streamActive: boolean;
  diagnostic: AttentionDiagnostic;
  onStart: () => void;
  onStop: () => void;
}

const STATE_COLOR: Record<AttentionMetrics['interpretedState'], string> = {
  Focused: '#76B900',
  Distracted: '#ff5c7c',
  Fatigued: '#a07bff',
  Searching: '#ffd86b',
  Overstimulated: '#7cf3ff',
  Unknown: '#6e7aa3',
};

const STATUS_LABEL: Record<WebcamStatus, string> = {
  idle: 'idle · click enable',
  requesting: 'requesting camera...',
  loading_model: 'loading face mesh...',
  running: 'live · processed locally',
  denied: 'permission denied · simulated',
  unsupported: 'unsupported · simulated',
  error_falling_back: 'simulated metrics',
};

export function AttentionTile(props: Props) {
  const interp = props.metrics?.interpretedState ?? 'Unknown';
  const color = STATE_COLOR[interp];
  const isLive = props.streamActive;
  const score = props.metrics?.attentionScore ?? 0;
  const dash = (score / 100) * 264;

  return (
    <Panel
      title="face state analyzer · webcam mesh"
      hint={
        <span style={{ color: props.status === 'running' ? '#76B900' : '#ffd86b' }}>
          {STATUS_LABEL[props.status]}
        </span>
      }
      glow={props.status === 'running' ? 'green' : 'none'}
      corners
    >
      <div className="px-4 py-3 grid grid-cols-12 gap-3">
        <div className="col-span-5 space-y-2">
          <div className="relative aspect-[4/3] rounded-lg border border-cortex-border/60 bg-cortex-bg/80 overflow-hidden">
            <video
              ref={props.videoRef}
              className={`absolute inset-0 w-full h-full object-cover scale-x-[-1] transition-opacity ${
                isLive ? 'opacity-100' : 'opacity-0'
              }`}
              playsInline
              muted
            />
            {!isLive && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-cortex-dim font-mono text-[10px] text-center px-3 gap-2">
                {props.status === 'idle' ? (
                  <>
                    <Video className="w-5 h-5 text-cortex-accent" />
                    <div>click "enable camera" to start attention tracking.</div>
                  </>
                ) : props.status === 'requesting' || props.status === 'loading_model' ? (
                  <motion.div animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 1.4, repeat: Infinity }}>
                    {STATUS_LABEL[props.status]}
                  </motion.div>
                ) : (
                  <>
                    <CameraOff className="w-5 h-5 text-cortex-yellow" />
                    <div>{props.errorMessage ?? 'running simulated attention.'}</div>
                  </>
                )}
              </div>
            )}

            {/* Heatmap overlay */}
            {isLive && props.heat.length > 0 && (
              <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
                <defs>
                  <radialGradient id="heat-grad-2">
                    <stop offset="0%" stopColor="#7cf3ff" stopOpacity="0.55" />
                    <stop offset="60%" stopColor="#a07bff" stopOpacity="0.18" />
                    <stop offset="100%" stopColor="#a07bff" stopOpacity="0" />
                  </radialGradient>
                </defs>
                {props.heat.map((h, i) => {
                  const ageSec = (Date.now() - h.t) / 1000;
                  if (ageSec > 8) return null;
                  const opacity = Math.max(0, 1 - ageSec / 8) * h.weight;
                  const cx = (1 - h.x) * 100;
                  const cy = h.y * 100;
                  return <circle key={`${i}-${h.t}`} cx={cx} cy={cy} r={5 + h.weight * 7} fill="url(#heat-grad-2)" opacity={opacity} />;
                })}
              </svg>
            )}

            {/* Score ring */}
            {props.metrics && isLive && (
              <div className="absolute top-2 right-2">
                <svg width={60} height={60} className="-rotate-90">
                  <circle cx={30} cy={30} r={24} stroke="rgba(0,0,0,0.4)" strokeWidth={4} fill="rgba(4,5,10,0.6)" />
                  <motion.circle
                    cx={30}
                    cy={30}
                    r={24}
                    stroke={color}
                    strokeWidth={3}
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray={`${dash} 264`}
                    animate={{ strokeDasharray: `${dash} 264` }}
                    transition={{ duration: 0.6 }}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center" style={{ color }}>
                  <span className="font-mono text-xs">{score}</span>
                </div>
              </div>
            )}

            <div className="absolute bottom-1 left-1 right-1 flex justify-between text-[8px] font-mono uppercase tracking-widest text-cortex-dim/90">
              <span>local</span>
              <span>no video stored</span>
              <span>no identity</span>
            </div>

            {props.fps > 0 && (
              <div className="absolute top-2 left-2 font-mono text-[9px] text-cortex-accent/90 bg-cortex-bg/60 px-1.5 py-0.5 rounded">
                {props.fps} fps
              </div>
            )}
          </div>

          <div className="flex gap-1.5">
            {props.status === 'running' ? (
              <button
                onClick={props.onStop}
                className="flex-1 px-2 py-1.5 rounded-md bg-cortex-red/10 border border-cortex-red/40 text-cortex-red font-mono text-[10px] uppercase tracking-widest hover:bg-cortex-red/20"
              >
                stop camera
              </button>
            ) : (
              <button
                onClick={() => {
                  console.log('[attention] BUTTON CLICKED');
                  props.onStart();
                }}
                className="flex-1 px-2 py-1.5 rounded-md bg-nv-green/10 border border-nv-green/50 text-nv-green font-mono text-[10px] uppercase tracking-widest hover:bg-nv-green/20 transition shadow-glow-nv"
              >
                <Eye className="w-3 h-3 inline mr-1" />
                {props.status === 'idle' ? 'enable camera' : 'retry'}
              </button>
            )}
          </div>

          <div className="rounded-md border border-cortex-border/60 bg-cortex-bg/40 px-2 py-1.5 text-[9px] font-mono">
            <ShieldCheck className="w-3 h-3 inline text-nv-green mr-1" />
            <span className="text-cortex-dim">permission </span>
            <span className={props.diagnostic.permissionState === 'denied' ? 'text-cortex-red' : 'text-cortex-ink'}>
              {props.diagnostic.permissionState}
            </span>
            <span className="text-cortex-dim ml-2">cameras </span>
            <span className={props.diagnostic.cameraDevices === 0 ? 'text-cortex-red' : 'text-cortex-ink'}>
              {props.diagnostic.cameraDevices}
            </span>
          </div>
        </div>

        <div className="col-span-7 space-y-2">
          <div className="rounded-md border p-3" style={{ borderColor: `${color}55`, background: `${color}0F` }}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-cortex-dim font-mono">interpreted state</div>
                <div className="font-display text-2xl" style={{ color }}>{interp}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-widest text-cortex-dim font-mono">score</div>
                <div className="font-display text-3xl" style={{ color }}>{score}</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            <Cell label="gaze" value={props.metrics?.gazeDirection ?? '—'} warn={props.metrics?.gazeDirection === 'offscreen'} />
            <Cell
              label="off-screen"
              value={props.metrics ? `${Math.round(props.metrics.offscreenRatio60s * 100)}%` : '—'}
              warn={!!props.metrics && props.metrics.offscreenRatio60s > 0.3}
            />
            <Cell
              label="blink rate"
              value={props.metrics ? `${props.metrics.blinkRate.toFixed(1)}/m` : '—'}
              warn={!!props.metrics && (props.metrics.blinkRate > 28 || props.metrics.blinkRate < 4)}
            />
            <Cell label="head pose" value={props.metrics?.headPose ?? '—'} />
            <Cell
              label="stability"
              value={props.metrics ? `${props.metrics.focusStability}` : '—'}
              warn={!!props.metrics && props.metrics.focusStability < 40}
            />
            <Cell
              label="confidence"
              value={props.metrics ? `${Math.round(props.metrics.confidence * 100)}%` : '—'}
              warn={!!props.metrics && props.metrics.confidence < 0.4}
            />
          </div>
        </div>
      </div>
    </Panel>
  );
}

function Cell({ label, value, warn }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <div className="rounded-md bg-cortex-bg/60 border border-cortex-border/60 p-1.5">
      <div className="text-[8px] uppercase tracking-widest text-cortex-dim font-mono">{label}</div>
      <div className={`font-mono text-xs ${warn ? 'text-cortex-red' : 'text-cortex-ink'}`}>{value}</div>
    </div>
  );
}
