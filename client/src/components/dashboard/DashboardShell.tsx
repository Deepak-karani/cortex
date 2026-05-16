import { motion } from 'framer-motion';
import { Settings2, Wifi, WifiOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { useCortexStore } from '../../store/useCortexStore';

interface Props {
  onOpenAdmin: () => void;
  children: ReactNode;
}

export function DashboardShell({ onOpenAdmin, children }: Props) {
  const system = useCortexStore((s) => s.system);
  const demoMode = useCortexStore((s) => s.demoMode);

  return (
    <div className="h-full w-full flex flex-col bg-cortex-bg text-cortex-ink overflow-hidden">
      <header className="px-6 py-3.5 border-b border-cortex-border/40 bg-cortex-panel/30 backdrop-blur-xl relative">
        <div className="absolute inset-x-0 bottom-0 hairline" />
        <div className="flex items-center justify-between">
          <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
            className="flex items-center gap-3"
          >
            <div className="relative">
              <div className="w-2.5 h-2.5 rounded-full bg-nv-green shadow-glow-nv animate-pulse-slow" />
            </div>
            <div className="leading-tight">
              <div className="font-display tracking-[0.32em] text-base text-cortex-ink">
                CORTEX <span className="text-nv-green text-glow">ARENA</span>
              </div>
              <div className="text-[10px] uppercase tracking-[0.3em] text-cortex-dim font-mono">
                cognitive operating system · dgx spark
              </div>
            </div>
          </motion.div>

          <div className="flex items-center gap-3">
            {demoMode && (
              <span className="pill border border-cortex-yellow/40 bg-cortex-yellow/10 text-cortex-yellow">
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                demo mode
              </span>
            )}
            <span
              className={`pill border ${
                system.openclawRunning
                  ? 'border-nv-green/40 bg-nv-green/10 text-nv-green'
                  : 'border-cortex-yellow/40 bg-cortex-yellow/10 text-cortex-yellow'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
              {system.openclawRunning ? 'nemotron live' : 'mock fallback'}
            </span>
            <span
              className={`pill border ${
                system.socketConnected
                  ? 'border-cortex-accent/40 text-cortex-accent bg-cortex-accent/10'
                  : 'border-cortex-red/40 text-cortex-red bg-cortex-red/10'
              }`}
            >
              {system.socketConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              {system.socketConnected ? 'connected' : 'offline'}
            </span>
            <button
              onClick={onOpenAdmin}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-cortex-violet/40 text-cortex-violet bg-cortex-violet/5 hover:bg-cortex-violet/15 font-mono text-[10px] uppercase tracking-widest transition"
            >
              <Settings2 className="w-3 h-3" />
              admin
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="max-w-screen-2xl mx-auto p-5">{children}</div>
      </main>
    </div>
  );
}
