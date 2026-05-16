import { useCallback, useState } from 'react';
import { useCortexSocket } from './hooks/useCortexSocket';
import { useAttentionTracking } from './hooks/useAttentionTracking';
import { useScreenUnderstanding } from './hooks/useScreenUnderstanding';
import { useRoute } from './hooks/useRoute';
import { AdminPage } from './AdminPage';
import { HudFrame } from './hud/HudFrame';
import { CognitiveCore } from './hud/CognitiveCore';
import { AgentConstellation } from './hud/AgentConstellation';
import { ReasoningStream } from './hud/ReasoningStream';
import { InsightStack } from './hud/InsightStack';
import { ScreenUnderstanding } from './hud/ScreenUnderstanding';
import { AttentionTile } from './hud/AttentionTile';
import { BiometricsTile } from './hud/BiometricsTile';
import { InterventionQueue } from './hud/InterventionQueue';
import { SocraticTile } from './hud/SocraticTile';
import { QuickActions } from './hud/QuickActions';
import type { AttentionMetrics, ScreenSummary } from './types';

export default function App() {
  const cortex = useCortexSocket();
  const [route, navigate] = useRoute();
  const [simRunning, setSimRunning] = useState(false);

  const handleAttention = useCallback((m: AttentionMetrics) => cortex.pushAttention(m), [cortex]);
  const handleScreen = useCallback((s: ScreenSummary) => cortex.pushScreen(s), [cortex]);

  const attention = useAttentionTracking(handleAttention);
  const screen = useScreenUnderstanding(handleScreen);

  const startDemo = useCallback(() => {
    cortex.startDemo();
    setSimRunning(true);
  }, [cortex]);
  const resetDemo = useCallback(() => {
    cortex.resetDemo();
    setSimRunning(false);
  }, [cortex]);

  const cameraRunning = attention.status === 'running';
  const screenRunning = screen.status.kind === 'running';

  const toggleCamera = useCallback(() => {
    if (cameraRunning) attention.stop();
    else void attention.start();
  }, [attention, cameraRunning]);

  const toggleScreen = useCallback(() => {
    if (screenRunning) screen.stop();
    else void screen.start();
  }, [screen, screenRunning]);

  if (route === 'admin') {
    return (
      <AdminPage
        compute={cortex.compute}
        fallback={cortex.fallback}
        assessment={cortex.assessment}
        telemetry={cortex.telemetry}
        attention={attention.metrics ?? cortex.remoteAttention}
        attentionDiagnostic={attention.diagnostic}
        attentionStatus={attention.status}
        screen={screen.summary ?? cortex.remoteScreen}
        screenStatus={screen.status}
        memory={cortex.memory}
        reports={cortex.reports}
        onStartDemo={startDemo}
        onResetDemo={resetDemo}
        onSetSpeed={cortex.setSpeed}
        onManualState={cortex.setManualState}
        onClearMemory={cortex.clearMemory}
        onRunAgent={cortex.runAgent}
        onBack={() => navigate('main')}
      />
    );
  }

  return (
    <div className="h-full w-full flex flex-col bg-cortex-bg text-cortex-ink overflow-hidden">
      <HudFrame
        connected={cortex.connected}
        assessment={cortex.assessment}
        fallback={cortex.fallback}
        attention={attention.metrics ?? cortex.remoteAttention}
        screen={screen.summary ?? cortex.remoteScreen}
        compute={cortex.compute}
        rightSlot={
          <QuickActions
            simRunning={simRunning}
            cameraRunning={cameraRunning}
            screenRunning={screenRunning}
            onStartDemo={startDemo}
            onStopDemo={resetDemo}
            onToggleCamera={toggleCamera}
            onToggleScreen={toggleScreen}
            onOpenAdmin={() => navigate('admin')}
          />
        }
      />

      <main className="flex-1 grid grid-cols-12 gap-3 p-3 min-h-0 overflow-hidden">
        {/* LEFT: vital signs + face state */}
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
            compact
          />
        </section>

        {/* CENTER: cognitive core + screen + agent constellation + socratic */}
        <section className="col-span-6 flex flex-col gap-3 min-h-0 overflow-y-auto scrollbar-thin pr-1">
          <CognitiveCore assessment={cortex.assessment} telemetry={cortex.telemetry} />
          <ScreenUnderstanding
            summary={screen.summary ?? cortex.remoteScreen}
            status={screen.status}
            source={screen.source}
            onStartCapture={screen.start}
            onStartSimulated={screen.startSimulated}
            onStop={screen.stop}
            compact
          />
          <AgentConstellation reports={cortex.reports} />
          <SocraticTile socratic={cortex.socratic} assessment={cortex.assessment} />
        </section>

        {/* RIGHT: reasoning stream + insights + interventions */}
        <section className="col-span-3 flex flex-col gap-3 min-h-0 overflow-y-auto scrollbar-thin pr-1">
          <ReasoningStream trace={cortex.trace} />
          <InsightStack insights={cortex.insights} />
          <InterventionQueue actions={cortex.actions} />
        </section>
      </main>
    </div>
  );
}
