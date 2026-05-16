import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, ShieldAlert, ShieldCheck, ShieldX } from 'lucide-react';
import { useCortexStore } from '../../store/useCortexStore';
import type { PolicyAuditEntry, PolicyDecision, PolicyRiskClass } from '../../types';

const DECISION_META: Record<
  PolicyDecision,
  { label: string; color: string; icon: React.ReactNode }
> = {
  allow: { label: 'allowed', color: '#76B900', icon: <ShieldCheck className="w-3 h-3" /> },
  block: { label: 'blocked', color: '#ff5c7c', icon: <ShieldX className="w-3 h-3" /> },
  redact: { label: 'redacted', color: '#ffd86b', icon: <ShieldAlert className="w-3 h-3" /> },
};

const RISK_COLOR: Record<PolicyRiskClass, string> = {
  observe: '#7cf3ff',
  soft_action: '#a07bff',
  hard_action: '#ff9a3c',
};

/**
 * Live audit feed for the policy/sandbox layer. Renders each tool-call
 * decision as it lands — judges see the agent attempting actions and the
 * sandbox approving, blocking, or downgrading them in real time. This is
 * the architectural piece NemoClaw provides in NVIDIA's stack, implemented
 * in-process because the DGX image we were given doesn't ship NemoClaw.
 */
export function PolicySandboxPanel() {
  const audit = useCortexStore((s) => s.policy.audit);
  const summary = useCortexStore((s) => s.policy.summary);

  const recent = useMemo(() => [...audit].reverse().slice(0, 14), [audit]);
  const blockedPct =
    summary.total === 0 ? 0 : Math.round(((summary.blocked + summary.redacted) / summary.total) * 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="rounded-2xl glass nv-corner p-5 flex flex-col gap-3"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span
            className="w-9 h-9 rounded-xl grid place-items-center"
            style={{ background: '#76B9001f', color: '#76B900', boxShadow: '0 0 18px #76B90040' }}
          >
            <Shield className="w-4 h-4" />
          </span>
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-cortex-dim font-mono">
              Policy sandbox · NemoClaw-style
            </div>
            <div className="text-[10px] font-mono text-cortex-ink/70 mt-0.5">
              every tool call is policy-gated before the runtime executes it
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="font-display text-xl text-cortex-ink leading-none">{summary.total}</div>
          <div className="text-[9px] uppercase tracking-widest text-cortex-dim font-mono mt-1">decisions</div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <PillStat label="allowed" value={summary.allowed} color="#76B900" />
        <PillStat label="blocked" value={summary.blocked} color="#ff5c7c" />
        <PillStat label="redacted" value={summary.redacted} color="#ffd86b" />
        <PillStat label="% gated" value={`${blockedPct}%`} color="#a07bff" />
      </div>

      <div className="rounded-lg bg-cortex-bg/40 border border-cortex-border/50 p-2 max-h-[260px] overflow-y-auto">
        {recent.length === 0 ? (
          <div className="text-[11px] font-mono text-cortex-dim italic p-2">
            No decisions yet — start the demo to see the sandbox in action.
          </div>
        ) : (
          <ul className="space-y-1">
            <AnimatePresence initial={false}>
              {recent.map((entry) => (
                <AuditRow key={entry.id} entry={entry} />
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>

      <div className="text-[10px] font-mono text-cortex-dim leading-snug">
        <span className="text-cortex-violet">Why this matters:</span> the agent has real tools — mute Slack,
        close tabs, hold calendar. The sandbox is what makes that safe.
      </div>
    </motion.div>
  );
}

function AuditRow({ entry }: { entry: PolicyAuditEntry }) {
  const meta = DECISION_META[entry.decision];
  const riskColor = RISK_COLOR[entry.riskClass];
  return (
    <motion.li
      layout
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-cortex-bg/60"
    >
      <span style={{ color: meta.color }} className="mt-0.5 flex-shrink-0">
        {meta.icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 text-[10px] font-mono">
          <span style={{ color: meta.color }}>{meta.label}</span>
          <span className="text-cortex-ink/80">{entry.toolName}</span>
          <span
            className="pill border text-[9px]"
            style={{ borderColor: `${riskColor}55`, color: riskColor, background: `${riskColor}15` }}
          >
            {entry.riskClass.replace('_', ' ')}
          </span>
          <span className="text-cortex-dim ml-auto pl-2">{entry.cognitiveState}</span>
        </div>
        <div className="text-[10px] text-cortex-ink/65 leading-snug truncate" title={entry.reason}>
          {entry.reason}
        </div>
      </div>
    </motion.li>
  );
}

function PillStat({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div
      className="rounded-md border p-2"
      style={{ borderColor: `${color}40`, background: `${color}0d` }}
    >
      <div className="text-[9px] uppercase tracking-widest font-mono" style={{ color }}>
        {label}
      </div>
      <div className="font-mono text-base text-cortex-ink mt-0.5">{value}</div>
    </div>
  );
}
