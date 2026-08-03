import { AppShell } from './components/AppShell';
import { DisclaimerGate } from './components/DisclaimerGate';
import { useRoute } from './lib/router';
import { ExercisesPage } from './pages/Exercises';
import { MetricsPage } from './pages/Metrics';
import { MotionPage } from './pages/Motion';
import { ProgressPage } from './pages/Progress';
import { SettingsPage } from './pages/Settings';
import { TodayPage } from './pages/Today';
import { StoreProvider, useStore } from './state/store';
import { useReminders } from './state/useReminders';

function Routes() {
  const route = useRoute();
  const { settings, sessions } = useStore();
  useReminders(settings, sessions);

  return (
    <AppShell path={route.path}>
      {route.path === '/exercises' ? (
        <ExercisesPage />
      ) : route.path === '/motion' ? (
        <MotionPage />
      ) : route.path === '/progress' ? (
        <ProgressPage />
      ) : route.path === '/metrics' ? (
        <MetricsPage />
      ) : route.path === '/settings' ? (
        <SettingsPage />
      ) : (
        <TodayPage />
      )}
    </AppShell>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <DisclaimerGate>
        <Routes />
      </DisclaimerGate>
    </StoreProvider>
  );
}
