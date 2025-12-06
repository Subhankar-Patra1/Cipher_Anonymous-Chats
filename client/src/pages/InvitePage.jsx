import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const InvitePage = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { user, loading } = useAuth();
    
    useEffect(() => {
        if (loading) return;

        const code = searchParams.get('code');
        const targetUsername = searchParams.get('user');

        if (!code && !targetUsername) {
            navigate('/');
            return;
        }

        const inviteData = {
            type: code ? 'group' : 'direct',
            value: code || targetUsername
        };

        if (user) {
            // Already logged in, go to dashboard with invite intent
            // passing via state to avoid URL pollution, or just query params?
            // Query params are safer for reloads.
            if (inviteData.type === 'group') {
                navigate(`/dashboard?joinCode=${inviteData.value}`);
            } else {
                navigate(`/dashboard?chatUser=${inviteData.value}`);
            }
        } else {
            // Not logged in, store invite and redirect to auth
            localStorage.setItem('pendingInvite', JSON.stringify(inviteData));
            // Default to signup for new users coming from invite
            navigate('/auth?mode=signup'); 
        }

    }, [user, loading, navigate, searchParams]);

    return (
        <div className="h-screen w-screen bg-slate-950 flex items-center justify-center text-white">
            <div className="animate-pulse flex flex-col items-center gap-4">
                <div className="w-12 h-12 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin"></div>
                <p className="text-slate-400 font-medium">Redirecting...</p>
            </div>
        </div>
    );
};

export default InvitePage;
