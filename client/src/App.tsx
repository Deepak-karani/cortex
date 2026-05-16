import { useCallback } from 'react';
import { useCortexSocket } from './hooks/useCortexSocket';
import { useAttentionTracking } from './hooks/useAttentionTracking';
import BiometricsPanel from './components/BiometricsPanel';
import ScreenBehaviorPanel from './components/ScreenBehaviorPanel';
import CognitiveStateBadge from './components/CognitiveStateBadge';
import FutureTimelinePanel from './components/FutureTimelinePanel';
import AgentTracePanel from './components/AgentTracePanel';
import ActionLogPanel from './components/ActionLogPanel';
import MemoryReplayPanel from './components/MemoryReplayPanel';
import SocraticQuestionPanel from './components/SocraticQuestionPanel';
import DemoControls from './components/DemoControls';
import FallbackStatusBadge from './components/FallbackStatusBadge';
import TopBar from './components/TopBar';
import AttentionPanel from './components/AttentionPanel';
import type { AttentionMetrics } from './types';

export default function App() {
  const cortex = useCortexSocket();

  const handleMetrics = useCallback(
    (m: AttentionMetrics) => {
      cortex.pushAttention(m);
    },
    [cortex],
  );

  const attention = useAttentionTracking(handleMetrics);

  return (
    <div className="h-full w-full flex flex-col bg-cortex-bg text-cortex-ink overflow-hidden">
      <TopBar
        connected={cortex.connected}
        assessment={cortex.assessment}
        fallback={cortex.fallback}
        attention={attention.metrics ?? cortex.remoteAttention}
      />

      <main className="flex-1 grid grid-cols-12 gap-3 p-3 min-h-0 overflow-hidden">
        {/* LEFT column: biometrics + screen behavior */}
        <section className="col-span-3 flex flex-col gap-3 min-h-0">
          <BiometricsPanel telemetry={cortex.telemetry} assessment={cortex.assessment} />
          <ScreenBehaviorPanel telemetry={cortex.telemetry} />
        </section>

        {/* CENTER column: state + futures + attention + socratic */}
        <section className="col-span-6 flex flex-col gap-3 min-h-0">
          <CognitiveStateBadge
            assessment={cortex.assessment}
            telemetry={cortex.telemetry}
          />
          <FutureTimelinePanel timelines={cortex.timelines} assessment={cortex.assessment} />
          <AttentionPanel
            videoRef={attention.videoRef}
            metrics={attention.metrics}
            status={attention.status}
            errorMessage={attention.errorMessage}
            heat={attention.heat}
            fps={attention.fps}
            source={attention.source}
            streamActive={attention.streamActive}
            onStart={() => void attention.start()}
            onStop={attention.stop}
          />
          <SocraticQuestionPanel socratic={cortex.socratic} assessment={cortex.assessment} />
        </section>

        {/* RIGHT column: agent trace + action log */}
        <section className="col-span-3 flex flex-col gap-3 min-h-0">
          <AgentTracePanel trace={cortex.trace} />
          <ActionLogPanel actions={cortex.actions} />
        </section>
      </main>

      <footer className="grid grid-cols-12 gap-3 p-3 pt-0">
        <div className="col-span-8">
          <MemoryReplayPanel
            memory={cortex.memory}
            assessment={cortex.assessment}
            onClear={cortex.clearMemory}
          />
        </div>
        <div className="col-span-4 flex flex-col gap-3">
          <DemoControls
            onStart={cortex.startDemo}
            onReset={cortex.resetDemo}
            onSpeed={cortex.setSpeed}
            onManualState={cortex.setManualState}
          />
          <FallbackStatusBadge fallback={cortex.fallback} />
        </div>
      </footer>
    </div>
  );
}
