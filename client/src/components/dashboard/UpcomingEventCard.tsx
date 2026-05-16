import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Calendar, ShieldAlert, Sparkles, Clock, Users } from 'lucide-react';
import { useCortexStore } from '../../store/useCortexStore';
import type { EventCorrelation } from '../../types';

const SIGNAL_META: Record<
  EventCorrelation['signal'],
  { label: string; color: string; tone: string }
> = {
  risky: { label: 'historically risky', color: '#ff9a3c', tone: 'orange' },
  mild: { label: 'historically mild', color: '#ffd86b', tone: 'yellow' },
  safe: { label: 'historically steady', color: '#76B900', tone: 'green' },
  unknown: { label: 'no prior data', color: '#6e7aa3', tone: 'dim' },
};

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'in progress';
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `in ${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  if (min < 60) return `in ${min}m`;
  const hr = Math.floor(min / 60);
  const rem = min % 60;
  return `in ${hr}h${rem ? ` ${rem}m` : ''}`;
}

/**
 * Upcoming Event tile. Reads the next calendar event + the cross-event
 * correlation projected from this user's memory. Renders nothing if no
 * events are configured — we don't fake calendar context.
 */
export function UpcomingEventCard() {
  const upcoming = useCortexStore((s) => s.calendar.upcoming);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (!upcoming || !upcoming.event) return null;

  const { event, correlation } = upcoming;
  const meta = SIGNAL_META[correlation.signal];
  const timeUntil = event.startsAt - now;
  const inProgress = now >= event.startsAt && now <= event.endsAt;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="rounded-2xl glass nv-corner p-5 flex flex-col gap-3"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span
            className="w-9 h-9 rounded-xl grid place-items-center"
            style={{
              background: `${meta.color}1f`,
              color: meta.color,
              boxShadow: `0 0 18px ${meta.color}40`,
            }}
          >
            <Calendar className="w-4 h-4" />
          </span>
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-cortex-dim font-mono">
              {inProgress ? 'In progress · ' : 'Upcoming · '}
              {event.eventTag.replace(/_/g, ' ')}
            </div>
            <div className="font-display text-base text-cortex-ink leading-tight mt-0.5">
              {event.title}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-1.5 text-[11px] font-mono text-cortex-ink/80 justify-end">
            <Clock className="w-3 h-3" />
            <span>{inProgress ? 'in progress' : formatCountdown(timeUntil)}</span>
          </div>
          <div className="text-[10px] font-mono text-cortex-dim mt-1">
            {new Date(event.startsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            {' · '}
            {Math.round((event.endsAt - event.startsAt) / 60_000)}min
          </div>
        </div>
      </div>

      {event.attendees && event.attendees.length > 0 && (
        <div className="flex items-center gap-1.5 text-[10px] text-cortex-dim font-mono">
          <Users className="w-3 h-3" />
          {event.attendees.join(' · ')}
        </div>
      )}

      <div
        className="rounded-lg border p-3"
        style={{ borderColor: `${meta.color}40`, background: `${meta.color}0d` }}
      >
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-mono mb-1.5" style={{ color: meta.color }}>
          <ShieldAlert className="w-3 h-3" />
          {meta.label}
          {correlation.matches > 0 && (
            <span className="text-cortex-dim normal-case tracking-normal ml-1">
              · {correlation.matches} prior
            </span>
          )}
        </div>
        <div className="text-[12px] text-cortex-ink/85 leading-snug">
          {correlation.recommendation}
        </div>
      </div>

      {correlation.matches > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Red episodes" value={correlation.redCount} color="#ff5c7c" />
          <Stat label="Recovered" value={correlation.recoveredCount} color="#76B900" />
          <Stat
            label="Confidence"
            value={`${Math.round(correlation.confidence * 100)}%`}
            color="#a07bff"
          />
        </div>
      )}

      {correlation.bestIntervention && (
        <div className="rounded-lg bg-cortex-bg/40 border border-cortex-border/50 p-2">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-cortex-dim font-mono mb-0.5">
            <Sparkles className="w-3 h-3" />
            Cortex recommends
          </div>
          <div className="text-[12px] text-cortex-ink/85 leading-snug">
            <span className="text-cortex-violet">{correlation.bestIntervention.replace(/_/g, ' ')}</span>{' '}
            worked best last time
            {correlation.averageRecoverySeconds
              ? ` · ${Math.max(1, Math.round(correlation.averageRecoverySeconds / 60))}min avg recovery`
              : ''}
            .
          </div>
        </div>
      )}
    </motion.div>
  );
}

function Stat({ label, value, color }: { label: string; value: string | number; color: string }) {
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
