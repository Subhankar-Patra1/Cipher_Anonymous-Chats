import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useAuth } from './AuthContext';

const PresenceContext = createContext();

export const usePresence = () => useContext(PresenceContext);

export const PresenceProvider = ({ children, socket }) => {
    const { user, token } = useAuth();
    const [presenceMap, setPresenceMap] = useState({}); // userId -> { online, last_seen, sessionCount }
    const heartbeatRef = useRef(null);

    // Initial batch fetch helper
    const fetchStatuses = async (userIds) => {
        if (!userIds || userIds.length === 0) return;
        try {
            const res = await fetch(`http://localhost:3000/api/users/status?ids=${userIds.join(',')}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            
            setPresenceMap(prev => {
                const next = { ...prev };
                data.forEach(s => {
                    next[s.userId] = s;
                });
                return next;
            });
        } catch (err) {
            console.error('Failed to fetch statuses', err);
        }
    };

    useEffect(() => {
        if (!socket || !user) return;

        // 1. Heartbeat loop
        const sendHeartbeat = () => {
            console.log('[DEBUG] Sending heartbeat for user', user?.id);
            socket.emit('presence:heartbeat');
        };
        
        console.log('[DEBUG] Starting heartbeat loop for user', user?.id);
        sendHeartbeat(); // Immediate
        heartbeatRef.current = setInterval(sendHeartbeat, 25000); // Every 25s

        // 2. Listen for updates
        const handlePresenceUpdate = (payload) => {
            console.log('[DEBUG] Presence update received:', payload);
            // payload: { userId, online, sessionCount, last_seen }
            setPresenceMap(prev => ({
                ...prev,
                [payload.userId]: {
                    online: payload.online,
                    sessionCount: payload.sessionCount,
                    last_seen: payload.last_seen
                }
            }));
        };

        socket.on('presence:update', handlePresenceUpdate);

        return () => {
            if (heartbeatRef.current) clearInterval(heartbeatRef.current);
            socket.off('presence:update', handlePresenceUpdate);
        };
    }, [socket, user]);

    return (
        <PresenceContext.Provider value={{ presenceMap, fetchStatuses }}>
            {children}
        </PresenceContext.Provider>
    );
};
