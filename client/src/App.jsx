import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import Auth from './pages/Auth';

import Dashboard from './pages/Dashboard';
import InvitePage from './pages/InvitePage';
import { ChatLockProvider } from './context/ChatLockContext';
import LockScreen from './components/LockScreen';

import LandingPage from './pages/LandingPage';
import LoadingScreen from './components/LoadingScreen'; // [NEW]
import { AppLockProvider, useAppLock } from './context/AppLockContext'; // [MODIFIED] Added useAppLock hook


const PrivateRoute = ({ children }) => {
    const { user } = useAuth();
    return user ? children : <Navigate to="/auth" />;
};

const PublicRoute = ({ children }) => {
    const { user } = useAuth();
    // If user is logged in, redirect to dashboard, otherwise show public content
    return user ? <Navigate to="/dashboard" /> : children;
};

const AppContent = () => {
    const { isUnlocking } = useAppLock(); // [NEW] Get unlocking state

    return (
        <ChatLockProvider>
            <LockScreen />
            {isUnlocking && <LoadingScreen />} 
            <Router>
                <Routes>
                    <Route path="/auth" element={
                        <PublicRoute>
                            <Auth />
                        </PublicRoute>
                    } />
                    <Route path="/invite" element={<InvitePage />} />
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
                </Routes>
            </Router>
        </ChatLockProvider>
    );
};

function App() {
  return (
    <AuthProvider>
        <NotificationProvider>
            <AppLockProvider>
                <AppContent />
            </AppLockProvider>
        </NotificationProvider>
    </AuthProvider>
  );
}

export default App;
