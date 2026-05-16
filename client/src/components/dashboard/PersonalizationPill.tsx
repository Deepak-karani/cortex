import { Brain } from 'lucide-react';
import { useCortexStore } from '../../store/useCortexStore';

/**
 * Compact "Cortex remembers" badge that surfaces the per-user profile —
 * how many overload episodes have been recorded for *this* user, and which
 * intervention has been most reliable. The badge stays empty (renders null)
 * until at least one episode has landed, so a fresh install doesn't lie
 * about adaptive behavior it hasn't earned yet.
 */
export function PersonalizationPill({ compact = false }: { compact?: boolean }) {
  const profile = useCortexStore((s) => s.profile);

  if (!profile || profile.episodeCount === 0) return null;

  const best = profile.bestIntervention?.replace(/_/g, ' ');
  const recoveryMin = profile.averageRecoverySeconds
    ? Math.max(1, Math.round(profile.averageRecoverySeconds / 60))
    : null;

  if (compact) {
    return (
      <span
        className="pill border border-cortex-violet/40 bg-cortex-violet/10 text-cortex-violet"
        title={profile.dominantPattern ?? undefined}
      >
        <Brain className="w-3 h-3" />
        <span>{profile.episodeCount} learned</span>
      </span>
    );
  }

  const riskyApps = profile.riskyApps.slice(0, 2);

  return (
    <div
      className="rounded-lg border border-cortex-violet/30 bg-cortex-violet/8 px-3 py-2 flex items-start gap-2"
      title={profile.dominantPattern ?? undefined}
    >
      <Brain className="w-3.5 h-3.5 text-cortex-violet mt-0.5 flex-shrink-0" />
      <div className="leading-snug flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-widest text-cortex-violet font-mono">
          Personalized · {profile.userId}
        </div>
        <div className="text-[12px] text-cortex-ink/85">
          Cortex remembers {profile.episodeCount}{' '}
          {profile.episodeCount === 1 ? 'episode' : 'episodes'}
          {best ? ` · ${best} has worked best` : ''}
          {recoveryMin ? ` · ~${recoveryMin}min recovery` : ''}.
        </div>
        {riskyApps.length > 0 && (
          <div className="text-[11px] text-cortex-orange/90 mt-1">
            Risky for you: {riskyApps.join(', ')}
          </div>
        )}
      </div>
    </div>
  );
}
