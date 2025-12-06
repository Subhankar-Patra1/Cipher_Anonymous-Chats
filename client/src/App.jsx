import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Auth from './pages/Auth';

import Dashboard from './pages/Dashboard';
import InvitePage from './pages/InvitePage';

import LandingPage from './pages/LandingPage';

const PrivateRoute = ({ children }) => {
    const { user } = useAuth();
    return user ? children : <Navigate to="/auth" />;
};

const PublicRoute = ({ children }) => {
    const { user } = useAuth();
    // If user is logged in, redirect to dashboard, otherwise show public content
    return user ? <Navigate to="/dashboard" /> : children;
};

function App() {
  return (
    <AuthProvider>
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
    </AuthProvider>
  );
}

export default App;
