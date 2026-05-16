import type { ToolResult } from '../types';

interface Props {
  actions: ToolResult[];
}

const TOOL_GLYPH: Record<string, string> = {
  recall_memory: '🧠',
  simulate_futures: '🪞',
  mute_slack: '🔕',
  enable_focus_mode: '🎯',
  close_tabs: '🗂',
  open_relevant_doc: '📄',
  block_calendar_time: '📅',
  dim_secondary_monitor: '🌒',
  ask_socratic: '❓',
  do_nothing: '⏸',
};

export default function ActionLogPanel({ actions }: Props) {
  return (
    <div className="panel flex-1 min-h-0 flex flex-col">
      <div className="panel-header">
        <span>action log · tool executions</span>
        <span className="text-cortex-accent">{actions.length}</span>
      </div>
      <div className="panel-body flex-1 min-h-0 overflow-y-auto scrollbar-thin space-y-2 pr-2">
        {actions.length === 0 && (
          <div className="text-cortex-dim text-xs font-mono italic">
            No actions yet. Cortex acts when load enters Yellow or Red.
          </div>
        )}
        {actions.map((a) => (
          <div
            key={`${a.toolName}-${a.timestamp}`}
            className="rounded-md border border-cortex-border/60 bg-cortex-bg/40 px-2.5 py-2 animate-slide-up"
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <span>{TOOL_GLYPH[a.toolName] ?? '•'}</span>
                <span className="font-mono text-[11px] text-cortex-accent">{a.toolName}</span>
                <span
                  className={`pill border ${
                    a.success
                      ? 'border-cortex-green/40 text-cortex-green bg-cortex-green/10'
                      : 'border-cortex-red/40 text-cortex-red bg-cortex-red/10'
                  }`}
                >
                  {a.success ? 'ok' : 'fail'}
                </span>
              </div>
              <span className="font-mono text-[9px] text-cortex-dim">
                {new Date(a.timestamp).toLocaleTimeString([], { hour12: false })}
              </span>
            </div>
            <div className="text-[12px] leading-snug text-cortex-ink/90 font-mono">{a.reason}</div>
            <div className="text-[10px] text-cortex-dim font-mono mt-1 italic">
              → {a.expectedBenefit}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
