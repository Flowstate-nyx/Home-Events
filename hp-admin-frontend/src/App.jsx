/**
 * App Component
 * Main application with AuthProvider and routing
 */

import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { useAuth } from './hooks/useAuth.js';
import Login from './pages/Login.jsx';
import DashboardLayout from './components/layout/DashboardLayout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Events from './pages/Events.jsx';
import Orders from './pages/Orders.jsx';
import CheckIn from './pages/CheckIn.jsx';
import Stats from './pages/Stats.jsx';
import Gallery from './pages/Gallery.jsx';

// Loading screen component
function LoadingScreen() {
  return (
    <div className="min-h-screen bg-brand-green flex items-center justify-center">
      <div className="text-center animate-fade-in">
        <div className="w-16 h-16 mx-auto mb-6 rounded-xl bg-brand-gold/20 flex items-center justify-center">
          <span className="text-3xl font-bold text-brand-gold">H</span>
        </div>
        <div className="flex items-center justify-center gap-2 text-brand-gold/50">
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-sm">Loading...</span>
        </div>
      </div>
    </div>
  );
}

// Protected route wrapper
function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <LoadingScreen />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return children;
}

// Public route wrapper
function PublicRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <LoadingScreen />;
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  return children;
}

// App routes
function AppRoutes() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <LoadingScreen />;

  return (
    <Routes>
      {/* Public: Login */}
      <Route path="/login" element={
        <PublicRoute><Login /></PublicRoute>
      } />
      
      {/* Protected: Dashboard with nested routes */}
      <Route path="/dashboard" element={
        <ProtectedRoute><DashboardLayout /></ProtectedRoute>
      }>
        <Route index element={<Dashboard />} />
        <Route path="events" element={<Events />} />
        <Route path="orders" element={<Orders />} />
        <Route path="checkin" element={<CheckIn />} />
        <Route path="stats" element={<Stats />} />
        <Route path="gallery" element={<Gallery />} />
      </Route>
      
      {/* Redirects */}
      <Route path="/" element={
        <Navigate to={isAuthenticated ? "/dashboard" : "/login"} replace />
      } />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

// Main App
function App() {
  return (
    <AuthProvider>
      <div className="min-h-screen bg-brand-green">
        <AppRoutes />
      </div>
    </AuthProvider>
  );
}

export default App;
