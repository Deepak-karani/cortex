import { useCallback } from 'react';
import { useCortexSocket } from './hooks/useCortexSocket';
import { useAttentionTracking } from './hooks/useAttentionTracking';
import { useScreenUnderstanding } from './hooks/useScreenUnderstanding';
import { HudFrame } from './hud/HudFrame';
import { ComputeStrip } from './hud/ComputeStrip';
import { CognitiveCore } from './hud/CognitiveCore';
import { AgentConstellation } from './hud/AgentConstellation';
import { ReasoningStream } from './hud/ReasoningStream';
import { InsightStack } from './hud/InsightStack';
import { ScreenUnderstanding } from './hud/ScreenUnderstanding';
import { AttentionTile } from './hud/AttentionTile';
import { BiometricsTile } from './hud/BiometricsTile';
import { InterventionQueue } from './hud/InterventionQueue';
import { ControlDeck } from './hud/ControlDeck';
import { MemoryTile } from './hud/MemoryTile';
import { SocraticTile } from './hud/SocraticTile';
import type { AttentionMetrics, ScreenSummary } from './types';

export default function App() {
  const cortex = useCortexSocket();

  const handleAttention = useCallback((m: AttentionMetrics) => cortex.pushAttention(m), [cortex]);
  const handleScreen = useCallback((s: ScreenSummary) => cortex.pushScreen(s), [cortex]);

  const attention = useAttentionTracking(handleAttention);
  const screen = useScreenUnderstanding(handleScreen);

  return (
    <div className="h-full w-full flex flex-col bg-cortex-bg text-cortex-ink overflow-hidden">
      <HudFrame
        connected={cortex.connected}
        assessment={cortex.assessment}
        fallback={cortex.fallback}
        attention={attention.metrics ?? cortex.remoteAttention}
        screen={screen.summary ?? cortex.remoteScreen}
        compute={cortex.compute}
      />

      <main className="flex-1 grid grid-cols-12 gap-3 p-3 min-h-0 overflow-hidden">
        {/* LEFT column: biometrics + attention */}
        <section className="col-span-3 flex flex-col gap-3 min-h-0 overflow-y-auto scrollbar-thin pr-1">
          <BiometricsTile telemetry={cortex.telemetry} assessment={cortex.assessment} />
          <AttentionTile
            videoRef={attention.videoRef}
            metrics={attention.metrics}
            status={attention.status}
            errorMessage={attention.errorMessage}
            heat={attention.heat}
            fps={attention.fps}
            source={attention.source}
            streamActive={attention.streamActive}
            diagnostic={attention.diagnostic}
            onStart={() => void attention.start()}
            onStop={attention.stop}
          />
          <MemoryTile memory={cortex.memory} assessment={cortex.assessment} onClear={cortex.clearMemory} />
        </section>

        {/* CENTER column: compute strip + cognitive core + screen + insights + agents + socratic */}
        <section className="col-span-6 flex flex-col gap-3 min-h-0 overflow-y-auto scrollbar-thin pr-1">
          <ComputeStrip compute={cortex.compute} />
          <CognitiveCore assessment={cortex.assessment} telemetry={cortex.telemetry} />
          <ScreenUnderstanding
            summary={screen.summary ?? cortex.remoteScreen}
            status={screen.status}
            source={screen.source}
            onStartCapture={screen.start}
            onStartSimulated={screen.startSimulated}
            onStop={screen.stop}
          />
          <AgentConstellation reports={cortex.reports} />
          <SocraticTile socratic={cortex.socratic} assessment={cortex.assessment} />
        </section>

        {/* RIGHT column: reasoning stream + insights + interventions + controls */}
        <section className="col-span-3 flex flex-col gap-3 min-h-0 overflow-y-auto scrollbar-thin pr-1">
          <ReasoningStream trace={cortex.trace} />
          <InsightStack insights={cortex.insights} />
          <InterventionQueue actions={cortex.actions} />
          <ControlDeck
            fallback={cortex.fallback}
            onStart={cortex.startDemo}
            onReset={cortex.resetDemo}
            onSpeed={cortex.setSpeed}
            onManualState={cortex.setManualState}
            onRunAgent={cortex.runAgent}
          />
        </section>
      </main>
    </div>
  );
}
