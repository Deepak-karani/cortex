import type { CognitiveAssessment, SocraticPrompt } from '../types';

interface Props {
  socratic: SocraticPrompt | null;
  assessment: CognitiveAssessment | null;
}

export default function SocraticQuestionPanel({ socratic, assessment }: Props) {
  const active = assessment?.state !== 'Green';
  return (
    <div className="panel">
      <div className="panel-header">
        <span>socratic prompt · one question, not a notification</span>
        <span className={active ? 'text-cortex-yellow' : 'text-cortex-dim'}>
          {active ? 'live' : 'idle'}
        </span>
      </div>
      <div className="panel-body grid grid-cols-12 gap-3 items-center">
        <div className="col-span-9">
          <div className="font-mono text-base text-cortex-ink leading-relaxed">
            <span className="text-cortex-violet mr-2">cortex asks:</span>
            {socratic?.question ??
              'Cortex will surface one question here when load enters the danger zone.'}
          </div>
          {socratic && (
            <div className="text-[11px] text-cortex-dim font-mono mt-2 italic">
              why · {socratic.rationale}
            </div>
          )}
        </div>
        <div className="col-span-3 flex items-center justify-end">
          <div className="text-right font-mono text-[10px] uppercase tracking-widest text-cortex-dim">
            {socratic ? (
              <>
                asked at{' '}
                <span className="text-cortex-accent">
                  {new Date(socratic.timestamp).toLocaleTimeString([], { hour12: false })}
                </span>
              </>
            ) : (
              'awaiting trigger'
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
