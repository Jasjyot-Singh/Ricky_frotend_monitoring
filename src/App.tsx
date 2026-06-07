import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useSocket } from './hooks/useSocket';
import { isAuthenticated } from './lib/auth';
import DashboardLayout from './components/layout/DashboardLayout';
import FleetOverview from './pages/FleetOverview';
import DevicePage from './pages/DevicePage';
import LoginPage from './pages/LoginPage';

/** Auth guard — redirects to login if not authenticated */
function RequireAuth({ children }: { children: React.ReactNode }) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function AppContent() {
  // Initialize WebSocket connection at the app root (only when authed)
  useSocket();

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <DashboardLayout />
          </RequireAuth>
        }
      >
        <Route index element={<FleetOverview />} />
        <Route path="/device/:deviceId" element={<DevicePage />} />
      </Route>
      {/* Catch-all redirect */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;
