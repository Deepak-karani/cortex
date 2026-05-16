import type { Telemetry } from '../types';

interface Props {
  telemetry: Telemetry | null;
}

export default function ScreenBehaviorPanel({ telemetry }: Props) {
  return (
    <div className="panel flex-1 min-h-0 flex flex-col">
      <div className="panel-header">
        <span>screen behavior · macOS sim</span>
        <span className="text-cortex-accent">live</span>
      </div>
      <div className="panel-body flex-1 min-h-0 flex flex-col gap-3">
        <Row label="active app" value={telemetry?.activeApp ?? '—'} accent />
        <Row label="current task" value={telemetry?.currentTask ?? '—'} mono />
        <Row label="screen state" value={telemetry?.screenState ?? '—'} dim />

        <div className="grid grid-cols-3 gap-2 mt-2">
          <Cell
            label="context switches"
            value={telemetry?.contextSwitches ?? '—'}
            warn={!!telemetry && telemetry.contextSwitches > 14}
            unit="/min"
          />
          <Cell
            label="unread notifs"
            value={telemetry?.unreadNotifications ?? '—'}
            warn={!!telemetry && telemetry.unreadNotifications > 18}
          />
          <Cell
            label="deadline"
            value={telemetry?.deadlineMinutes ?? '—'}
            warn={!!telemetry && telemetry.deadlineMinutes < 15}
            unit="min"
          />
        </div>

        {telemetry && (
          <div className="mt-3 p-3 rounded-md bg-cortex-bg/60 border border-cortex-border/60 font-mono text-[11px] text-cortex-dim">
            <div className="text-cortex-accent uppercase tracking-widest text-[9px] mb-1">stream sample</div>
            HR={telemetry.heartRate} · HRV={telemetry.hrv} · switches={telemetry.contextSwitches} · notif=
            {telemetry.unreadNotifications} · errRate={(telemetry.errorRate * 100).toFixed(1)}%
          </div>
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  accent = false,
  mono = false,
  dim = false,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
  mono?: boolean;
  dim?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[10px] uppercase tracking-wider text-cortex-dim font-mono shrink-0">{label}</span>
      <span
        className={`text-right truncate ${mono ? 'font-mono text-xs' : 'text-sm'} ${
          accent ? 'text-cortex-accent' : dim ? 'text-cortex-dim' : 'text-cortex-ink'
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function Cell({
  label,
  value,
  warn,
  unit,
}: {
  label: string;
  value: string | number;
  warn?: boolean;
  unit?: string;
}) {
  return (
    <div className="p-2 rounded-md bg-cortex-bg/60 border border-cortex-border/60">
      <div className="text-[9px] uppercase tracking-wider text-cortex-dim font-mono">{label}</div>
      <div className={`font-mono text-base ${warn ? 'text-cortex-red' : 'text-cortex-ink'}`}>
        {value}
        {unit && <span className="text-[10px] text-cortex-dim ml-0.5">{unit}</span>}
      </div>
    </div>
  );
}
