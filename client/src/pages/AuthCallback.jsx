import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import SpinLoading from '../components/SpinLoading';

export default function AuthCallback() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { login } = useAuth();
    const [error, setError] = useState('');

    useEffect(() => {
        const token = searchParams.get('token');
        const provider = searchParams.get('provider');
        const errorParam = searchParams.get('error');

        if (errorParam) {
            setError(`Authentication failed: ${errorParam}`);
            setTimeout(() => navigate('/auth'), 3000);
            return;
        }

        if (token) {
            // Decode JWT to get user info (basic decode, validation happens on server)
            try {
                const payload = JSON.parse(atob(token.split('.')[1]));
                const user = {
                    id: payload.id,
                    username: payload.username,
                    display_name: payload.display_name,
                    isNewUser: payload.isNewUser // [NEW] Pass onboarding flag
                };

                const recoveryCode = searchParams.get('recoveryCode');

                // Log in the user
                login(token, user, false);
                
                // [NEW] If New User, redirect to Onboarding Flow (Profile -> Backup)
                // We pass the recoveryCode to be handled there if needed (though Profile is step 1)
                if (payload.isNewUser || recoveryCode) {
                     navigate('/complete-profile', { 
                        state: { 
                            recoveryCode,
                            isNewUser: true
                        } 
                    });
                     return;
                }

                // Check for pending invites
                const pendingInvite = localStorage.getItem('pendingInvite');
                if (pendingInvite) {
                    try {
                        const { type, value } = JSON.parse(pendingInvite);
                        localStorage.removeItem('pendingInvite');
                        if (type === 'group') navigate(`/dashboard?joinCode=${value}`);
                        else if (type === 'direct') navigate(`/dashboard?chatUser=${value}`);
                        else navigate('/');
                    } catch (e) {
                         console.error('Invalid pending invite', e);
                         navigate('/');
                    }
                } else {
                    navigate('/');
                }
            } catch (err) {
                console.error('Failed to process OAuth callback:', err);
                setError('Failed to complete authentication');
                setTimeout(() => navigate('/auth'), 3000);
            }
        } else {
            setError('No authentication token received');
            setTimeout(() => navigate('/auth'), 3000);
        }
    }, [searchParams, navigate, login]);

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
