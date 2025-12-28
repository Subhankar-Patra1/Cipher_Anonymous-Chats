import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';

const ChatLockContext = createContext();

export const useChatLock = () => useContext(ChatLockContext);

export const ChatLockProvider = ({ children }) => {
    const { token } = useAuth();
    
    // Set of room IDs that are locked (from server)
    const [lockedRooms, setLockedRooms] = useState(new Set());
    
    // Room that is pending unlock (to show unlock screen in right panel)
    const [pendingUnlockRoom, setPendingUnlockRoom] = useState(null);
    
    // Loading state
    const [isLoading, setIsLoading] = useState(true);

    // Fetch all locked rooms on mount
    useEffect(() => {
        if (!token) return;
        
        const fetchLockedRooms = async () => {
            try {
                const res = await fetch(`${import.meta.env.VITE_API_URL}/api/rooms/locks/all`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                
                if (res.ok) {
                    const data = await res.json();
                    setLockedRooms(new Set(data.lockedRoomIds));
                }
            } catch (err) {
                console.error('Failed to fetch locked rooms:', err);
            } finally {
                setIsLoading(false);
            }
        };
        
        fetchLockedRooms();
    }, [token]);

    // Check if a room is locked
    const isRoomLocked = useCallback((roomId) => {
        return lockedRooms.has(Number(roomId));
    }, [lockedRooms]);

    // Lock a room
    const lockRoom = async (roomId, passcode) => {
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/rooms/${roomId}/lock`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ passcode })
            });
            
            const data = await res.json();
            
            if (res.ok) {
                setLockedRooms(prev => new Set([...prev, Number(roomId)]));
                return { success: true };
            } else {
                return { success: false, error: data.error };
            }
        } catch (err) {
            console.error('Failed to lock room:', err);
            return { success: false, error: 'Network error' };
        }
    };

    // Verify passcode for a room (just verification, no session tracking)
    const verifyPasscode = async (roomId, passcode) => {
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/rooms/${roomId}/lock/verify`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ passcode })
            });
            
            const data = await res.json();
            
            if (res.ok) {
                return { success: true };
            } else {
                return { success: false, error: data.error };
            }
        } catch (err) {
            console.error('Failed to verify passcode:', err);
            return { success: false, error: 'Network error' };
        }
    };

    // Remove lock from a room
    const removeLock = async (roomId, passcode, useAccountPassword = false) => {
        try {
            const body = useAccountPassword 
                ? { appPasscode: passcode }
                : { passcode };
                
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/rooms/${roomId}/lock`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(body)
            });
            
            const data = await res.json();
            
            if (res.ok) {
                setLockedRooms(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(Number(roomId));
                    return newSet;
                });
                // Clear pending unlock if this room was waiting to be unlocked
                if (pendingUnlockRoom && String(pendingUnlockRoom.id) === String(roomId)) {
                    setPendingUnlockRoom(null);
                }
                return { success: true };
            } else {
                return { success: false, error: data.error };
            }
        } catch (err) {
            console.error('Failed to remove lock:', err);
            return { success: false, error: 'Network error' };
        }
    };

    // Request unlock for a room (set pending unlock room)
    const requestUnlock = (room) => {
        setPendingUnlockRoom(room);
    };

    // Cancel pending unlock
    const cancelUnlock = () => {
        setPendingUnlockRoom(null);
    };

    // Complete unlock (clear pending)
    const completeUnlock = () => {
        const room = pendingUnlockRoom;
        setPendingUnlockRoom(null);
        return room;
    };

    return (
        <ChatLockContext.Provider value={{
            lockedRooms,
            pendingUnlockRoom,
            isLoading,
            isRoomLocked,
            lockRoom,
            verifyPasscode,
            removeLock,
            requestUnlock,
            cancelUnlock,
            completeUnlock
        }}>
            {children}
        </ChatLockContext.Provider>
    );
};
