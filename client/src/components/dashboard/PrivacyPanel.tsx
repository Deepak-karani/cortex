import { motion } from 'framer-motion';
import { Check, ChevronDown, Lock, ShieldCheck, X } from 'lucide-react';
import { useState } from 'react';
import { useCortexStore } from '../../store/useCortexStore';

interface Props {
  webcamEnabled: boolean;
  screenEnabled: boolean;
  onToggleWebcam: () => void;
  onToggleScreen: () => void;
}

export function PrivacyPanel({ webcamEnabled, screenEnabled, onToggleWebcam, onToggleScreen }: Props) {
  const [open, setOpen] = useState(false);
  const heartRate = useCortexStore((s) => s.heartRate);
  const system = useCortexStore((s) => s.system);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="rounded-2xl glass nv-corner p-5"
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between"
      >
        <div className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl grid place-items-center bg-nv-green/15 text-nv-green">
            <Lock className="w-4 h-4" />
          </span>
          <div className="text-left">
            <div className="text-[10px] uppercase tracking-[0.22em] text-cortex-dim font-mono">Privacy &amp; sources</div>
            <div className="text-sm text-cortex-ink/85 mt-0.5">
              Local-only processing. No raw frames stored.
            </div>
          </div>
        </div>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="w-4 h-4 text-cortex-dim" />
        </motion.div>
      </button>

      {open && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          transition={{ duration: 0.25 }}
          className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3"
        >
          <Toggle label="Webcam attention" enabled={webcamEnabled} onChange={onToggleWebcam} />
          <Toggle label="Screen sharing" enabled={screenEnabled} onChange={onToggleScreen} />
          <Badge label="Heart rate source" value={heartRate.source} />
          <Badge label="Nemotron runtime" value={system.nemotronModel} />

          <div className="md:col-span-2 rounded-lg bg-cortex-bg/40 border border-cortex-border/50 p-3 text-[12px] text-cortex-ink/80 leading-snug">
            <div className="flex items-center gap-1.5 text-nv-green text-[10px] uppercase tracking-widest font-mono mb-1.5">
              <ShieldCheck className="w-3 h-3" />
              local-first guarantees
            </div>
            <ul className="space-y-1 text-[12px]">
              <li>· Webcam frames live in memory for one tick and are then garbage-collected.</li>
              <li>· Screen frames are OCR'd locally and the canvas is cleared immediately afterwards.</li>
              <li>· Only sanitized structured summaries leave the browser.</li>
              <li>· Cortex never performs facial identity recognition.</li>
              <li>· Memory store is a local JSON file under <code className="text-cortex-violet">server/data/memory.json</code>.</li>
            </ul>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

function Toggle({ label, enabled, onChange }: { label: string; enabled: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className="rounded-lg bg-cortex-bg/40 border border-cortex-border/50 p-3 flex items-center justify-between hover:border-cortex-border-hi transition"
    >
      <span className="text-sm text-cortex-ink">{label}</span>
      <span
        className={`pill border ${
          enabled
            ? 'border-nv-green/40 text-nv-green bg-nv-green/10'
            : 'border-cortex-dim/40 text-cortex-dim bg-cortex-bg/40'
        }`}
      >
        {enabled ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
        {enabled ? 'on' : 'off'}
      </span>
    </button>
  );
}

function Badge({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-cortex-bg/40 border border-cortex-border/50 p-3 flex items-center justify-between">
      <span className="text-sm text-cortex-ink">{label}</span>
      <span className="text-sm font-mono text-cortex-accent truncate ml-2" title={value}>
        {value}
      </span>
    </div>
  );
}
