import { useCallback, useEffect, useState } from 'react';
import { useAttentionTracking } from './hooks/useAttentionTracking';
import { useScreenUnderstanding } from './hooks/useScreenUnderstanding';
import { useRoute } from './hooks/useRoute';
import { useCortexStore } from './store/useCortexStore';
import { AdminPage } from './AdminPage';
import { DashboardShell } from './components/dashboard/DashboardShell';
import { HeroStatusCard } from './components/dashboard/HeroStatusCard';
import { HeartRateCard } from './components/dashboard/HeartRateCard';
import { WebcamCard } from './components/dashboard/WebcamCard';
import { ScreenCard } from './components/dashboard/ScreenCard';
import { DGXStatusCard } from './components/dashboard/DGXStatusCard';
import { CurrentTaskCard } from './components/dashboard/CurrentTaskCard';
import { ReasoningSummary } from './components/dashboard/ReasoningSummary';
import { TimelinePanel } from './components/dashboard/TimelinePanel';
import { PrivacyPanel } from './components/dashboard/PrivacyPanel';
import { OnboardingBar } from './components/dashboard/OnboardingBar';
import { PolicySandboxPanel } from './components/dashboard/PolicySandboxPanel';
import { PersonalizationCallout } from './components/dashboard/PersonalizationCallout';
import type { AttentionMetrics, ScreenSummary } from './types';

export default function App() {
  const [route, navigate] = useRoute();

  // Boot the unified socket + heart-rate adapter exactly once.
  const initStore = useCortexStore((s) => s._init);
  useEffect(() => initStore(), [initStore]);

  const pushAttention = useCortexStore((s) => s.pushAttentionToServer);
  const pushScreen = useCortexStore((s) => s.pushScreenToServer);
  const pushScreenFrame = useCortexStore((s) => s.pushScreenFrame);
  const signalScreenStart = useCortexStore((s) => s.signalScreenStart);
  const signalScreenStop = useCortexStore((s) => s.signalScreenStop);
  const setWebcamEnabled = useCortexStore((s) => s.setWebcamEnabled);
  const setScreenEnabled = useCortexStore((s) => s.setScreenEnabled);
  const startDemo = useCortexStore((s) => s.startDemo);
  const startFocusSprint = useCortexStore((s) => s.startFocusSprint);
  const [latestScreenHints, setLatestScreenHints] = useState<ReturnType<typeof useScreenUnderstanding>['summary']>(null);

  const handleAttention = useCallback((m: AttentionMetrics) => pushAttention(m), [pushAttention]);
  const handleScreen = useCallback(
    (s: ScreenSummary) => {
      pushScreen(s);
      setLatestScreenHints(s);
    },
    [pushScreen],
  );

  const attention = useAttentionTracking(handleAttention);
  const screen = useScreenUnderstanding(handleScreen);

  // Wire screen capture frames → server for VLM analysis. Each frame is ~80KB
  // base64 JPEG; the capture pipeline emits one every ~6s.
  useEffect(() => {
    screen.onFrame((jpegBase64) => {
      pushScreenFrame(jpegBase64, latestScreenHints);
    });
    // intentional: subscribe once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tell the server when screen sharing starts/stops so other clients sync.
  useEffect(() => {
    if (screen.status.kind === 'running') signalScreenStart();
    if (screen.status.kind === 'idle') signalScreenStop();
  }, [screen.status.kind, signalScreenStart, signalScreenStop]);

  // Mirror sub-hook lifecycle into the store so the UI's status pills update.
  useEffect(() => {
    setWebcamEnabled(attention.status === 'running' || attention.status === 'error_falling_back');
  }, [attention.status, setWebcamEnabled]);
  useEffect(() => {
    setScreenEnabled(screen.status.kind === 'running');
  }, [screen.status, setScreenEnabled]);

  const enableCamera = useCallback(() => void attention.start(), [attention]);
  const shareScreen = useCallback(() => {
    void screen.start();
  }, [screen]);
  const startSimulatedScreen = useCallback(() => screen.startSimulated(), [screen]);

  const onStartFocusSprint = useCallback(() => {
    startFocusSprint();
  }, [startFocusSprint]);

  const onViewReasoning = useCallback(() => {
    // Scrolls to the reasoning panel.
    document.getElementById('cortex-reasoning')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  if (route === 'admin') {
    return (
      <AdminPageAdapter
        attentionStatus={attention.status}
        attentionDiagnostic={attention.diagnostic}
        screenStatus={screen.status}
        onBack={() => navigate('main')}
      />
    );
  }

  return (
    <DashboardShell onOpenAdmin={() => navigate('admin')}>
      <div className="flex flex-col gap-5">
        <OnboardingBar
          cameraReady={attention.status === 'running'}
          screenReady={screen.status.kind === 'running' || screen.source === 'simulated'}
          onStartDemo={startDemo}
          onEnableCamera={enableCamera}
          onShareScreen={shareScreen}
          onStartSimulatedScreen={startSimulatedScreen}
        />

        <HeroStatusCard onStartFocusSprint={onStartFocusSprint} onViewReasoning={onViewReasoning} />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <HeartRateCard />
          <WebcamCard
            videoRef={attention.videoRef}
            status={attention.status}
            diagnostic={attention.diagnostic}
            streamActive={attention.streamActive}
            errorMessage={attention.errorMessage}
            onStart={enableCamera}
            onStop={attention.stop}
          />
          <ScreenCard
            status={screen.status}
            videoElement={screen.videoElement}
            onShareScreen={async () => {
              await screen.start();
            }}
            onStartSimulated={startSimulatedScreen}
            onStop={screen.stop}
          />
          <DGXStatusCard />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-1">
            <CurrentTaskCard />
          </div>
          <div className="lg:col-span-2" id="cortex-reasoning">
            <ReasoningSummary />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <TimelinePanel />
          </div>
          <div className="lg:col-span-1">
            <PolicySandboxPanel />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-3">
            <PrivacyPanel
              webcamEnabled={attention.status === 'running'}
              screenEnabled={screen.status.kind === 'running'}
              onToggleWebcam={() => (attention.status === 'running' ? attention.stop() : void attention.start())}
              onToggleScreen={() => (screen.status.kind === 'running' ? screen.stop() : void screen.start())}
            />
          </div>
        </div>
      </div>
      <PersonalizationCallout />
    </DashboardShell>
  );
}

// Adapter so the existing AdminPage keeps working with the new store.
function AdminPageAdapter({
  attentionStatus,
  attentionDiagnostic,
  screenStatus,
  onBack,
}: {
  attentionStatus: string;
  attentionDiagnostic: ReturnType<typeof useAttentionTracking>['diagnostic'];
  screenStatus: ReturnType<typeof useScreenUnderstanding>['status'];
  onBack: () => void;
}) {
  const compute = useCortexStore((s) => ({
    timestamp: Date.now(),
    agentRunsLast60s: 0,
    toolCallsLast60s: 0,
    nemotronCallsLast60s: 0,
    avgLatencyMs: s.system.latencyMs,
    fallbackRatio: s.system.fallbackActive ? 1 : 0,
    inflight: 0,
    device: s.system.device,
    model: s.system.nemotronModel,
  }));
  const fallback = useCortexStore((s) => ({
    active: s.system.fallbackActive,
    reason: s.system.fallbackReason,
    lastChecked: Date.now(),
  }));
  const assessment = useCortexStore((s) =>
    s.cognitive.rawState
      ? {
          timestamp: Date.now(),
          cognitiveLoadScore: s.cognitive.loadScore,
          state: s.cognitive.rawState,
          explanation: s.cognitive.explanation,
        }
      : null,
  );
  const telemetry = useCortexStore((s) => s.telemetry);
  const webcamMetrics = useCortexStore((s) => {
    const w = s.webcam;
    if (!w.lastUpdated) return null;
    return {
      timestamp: w.lastUpdated,
      attentionScore: w.attentionScore ?? 0,
      gazeDirection: w.gazeDirection as 'center' | 'left' | 'right' | 'down' | 'offscreen',
      headPose: 'centered' as const,
      distractionDurationSeconds: 0,
      offscreenRatio60s: 0,
      blinkRate: w.blinkRate ?? 0,
      focusStability: 60,
      gazeSwitchRate: 0,
      faceDetected: w.faceDetected,
      confidence: 0.7,
      interpretedState: (w.state === 'focused'
        ? 'Focused'
        : w.state === 'distracted'
          ? 'Distracted'
          : w.state === 'fatigued'
            ? 'Fatigued'
            : w.state === 'searching'
              ? 'Searching'
              : w.state === 'overstimulated'
                ? 'Overstimulated'
                : 'Unknown') as
        | 'Focused'
        | 'Distracted'
        | 'Fatigued'
        | 'Searching'
        | 'Overstimulated'
        | 'Unknown',
      source: w.source ?? 'simulated',
    };
  });
  const screen = useCortexStore((s) =>
    s.screen.lastUpdated
      ? {
          timestamp: s.screen.lastUpdated,
          activeApp: s.screen.activeApp,
          activeTitle: s.screen.activeContext,
          windows: [],
          tabCount: 0,
          ocrTokens: [],
          inferredTask: s.screen.inferredTask,
          inferredProject: s.screen.project,
          inferredIntent: '',
          workflowState: s.screen.workflowState as
            | 'flow'
            | 'searching'
            | 'switching'
            | 'debugging'
            | 'communicating'
            | 'idle',
          confidence: 0.8,
          source: s.screen.source ?? 'simulated',
        }
      : null,
  );
  const memory = useCortexStore((s) => s.memory);
  const reports = useCortexStore((s) => s.agent.reports);
  const startDemo = useCortexStore((s) => s.startDemo);
  const resetDemo = useCortexStore((s) => s.resetDemo);
  const setSpeed = useCortexStore((s) => s.setSpeed);
  const setManualState = useCortexStore((s) => s.setManualState);
  const clearMemory = useCortexStore((s) => s.clearMemory);
  const runAgent = useCortexStore((s) => s.runAgent);

  return (
    <AdminPage
      compute={compute}
      fallback={fallback}
      assessment={assessment as never}
      telemetry={telemetry}
      attention={webcamMetrics as never}
      attentionDiagnostic={attentionDiagnostic}
      attentionStatus={attentionStatus}
      screen={screen as never}
      screenStatus={screenStatus}
      memory={memory}
      reports={reports}
      onStartDemo={startDemo}
      onResetDemo={resetDemo}
      onSetSpeed={setSpeed}
      onManualState={setManualState}
      onClearMemory={clearMemory}
      onRunAgent={runAgent}
      onBack={onBack}
    />
  );
}
