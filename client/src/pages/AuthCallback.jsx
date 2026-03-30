import { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import SpinLoading from '../components/SpinLoading';

export default function AuthCallback() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { login, setNeedsOnboarding } = useAuth();
    const [error, setError] = useState('');
    const processed = useRef(false); // [FIX] Prevent double-execution from useEffect re-fires

    useEffect(() => {
        // [FIX] Only process once — login() causes re-render which re-fires this effect
        if (processed.current) return;
        processed.current = true;

        const processCallback = async () => {
            const token = searchParams.get('token');
            const provider = searchParams.get('provider');
            const errorParam = searchParams.get('error');
            const isNewUserParam = searchParams.get('isNewUser');

            if (errorParam) {
                setError(`Authentication failed: ${errorParam}`);
                setTimeout(() => navigate('/auth'), 3000);
                return;
            }

            if (token) {
                try {
                    const payload = JSON.parse(atob(token.split('.')[1]));
                    const newUser = {
                        id: payload.id,
                        username: payload.username,
                        display_name: payload.display_name,
                    };

                    const recoveryCode = searchParams.get('recoveryCode');

                    // [FIX] Determine onboarding BEFORE login() to avoid race
                    const isNew = payload.isNewUser || isNewUserParam === 'true' || !!recoveryCode;

                    if (isNew) {
                        // Set needsOnboarding BEFORE login so PrivateRoute blocks dashboard
                        setNeedsOnboarding(true);
                    }

                    // Log in the user — pass isNew so login() sets fresh signup flags
                    await login(token, newUser, isNew);
                    
                    // Track Last Used Login Method
                    if (provider) {
                        localStorage.setItem('last_login_method', provider);
                    }

                    // Navigate AFTER login completes
                    if (isNew) {
                         navigate('/complete-profile', { 
                            state: { 
                                recoveryCode,
                                isNewUser: true
                            },
                            replace: true 
                        });
                    } else {
                        // Check for pending invites
                        const pendingInvite = localStorage.getItem('pendingInvite');
                        if (pendingInvite) {
                            try {
                                const { type, value } = JSON.parse(pendingInvite);
                                localStorage.removeItem('pendingInvite');
                                if (type === 'group') navigate(`/dashboard?joinCode=${value}`, { replace: true });
                                else if (type === 'direct') navigate(`/dashboard?chatUser=${value}`, { replace: true });
                                else navigate('/dashboard', { replace: true });
                            } catch (e) {
                                 navigate('/dashboard', { replace: true });
                            }
                        } else {
                            navigate('/dashboard', { replace: true });
                        }
                    }
                } catch (err) {
                    console.error('Failed to process OAuth callback:', err);
                    setError('Failed to complete authentication');
                    processed.current = false; // Allow retry on error
                    setTimeout(() => navigate('/auth'), 3000);
                }
            } else {
                setError('No authentication token received');
                setTimeout(() => navigate('/auth'), 3000);
            }
        };

        processCallback();
    }, [searchParams, navigate, login, setNeedsOnboarding]);

    return (
        <div className="h-screen w-full flex items-center justify-center bg-slate-950">
            {error ? (
                <div className="text-center">
                    <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-6 rounded-2xl max-w-md mx-auto">
                        <span className="material-symbols-outlined text-5xl mb-4">error</span>
                        <p className="text-lg font-medium">{error}</p>
                        <p className="text-sm text-slate-400 mt-2">Redirecting to login...</p>
                    </div>
                </div>
            ) : (
                <div className="text-center">
                    <SpinLoading />
                    <p className="text-slate-400 mt-6 text-lg">Completing sign in...</p>
                </div>
            )}
        </div>
    );
}

