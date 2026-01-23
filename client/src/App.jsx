import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import Auth from './pages/Auth';
import AuthCallback from './pages/AuthCallback';

import Dashboard from './pages/Dashboard';
import InvitePage from './pages/InvitePage';
import { ChatLockProvider } from './context/ChatLockContext';
import LockScreen from './components/LockScreen';

import LandingPage from './pages/LandingPage';
import LoadingScreen from './components/LoadingScreen'; // [NEW]
import { AppLockProvider, useAppLock } from './context/AppLockContext'; // [MODIFIED] Added useAppLock hook
import CompleteProfile from './pages/CompleteProfile'; // [NEW]


const PrivateRoute = ({ children }) => {
    const { user } = useAuth();
    return user ? children : <Navigate to="/auth" />;
};

const PublicRoute = ({ children }) => {
    const { user } = useAuth();
    // If user is logged in, redirect to dashboard, otherwise show public content
    return user ? <Navigate to="/dashboard" /> : children;
};

import AppLockOverlay from './components/AppLockOverlay';

const AppContent = () => {
    // [MODIFIED] simplified AppContent
    return (
        <ChatLockProvider>
            <AppLockOverlay />
            <LockScreen />
            <Router>
                <Routes>
                    <Route path="/auth" element={
                        <PublicRoute>
                            <Auth />
                        </PublicRoute>
                    } />
                    <Route path="/auth/callback" element={<AuthCallback />} />
                    <Route path="/invite" element={<InvitePage />} />
                    <Route path="/landing" element={<Navigate to="/" replace />} />
                    <Route path="/" element={
                            <PublicRoute>
                            <LandingPage />
                            </PublicRoute>
                    } />
                    <Route path="/dashboard" element={
                        <PrivateRoute>
                            <Dashboard />
                        </PrivateRoute>
                    } />
                     <Route path="/complete-profile" element={
                        <PrivateRoute>
                            <CompleteProfile />
                        </PrivateRoute>
                    } />
                </Routes>
            </Router>
        </ChatLockProvider>
    );
};

import { ConfirmationProvider } from './context/ConfirmationContext';

function App() {
  return (
    <AuthProvider>
        <NotificationProvider>
            <ConfirmationProvider>
                <AppLockProvider>
                    <AppContent />
                </AppLockProvider>
            </ConfirmationProvider>
        </NotificationProvider>
    </AuthProvider>
  );
}

export default App;
