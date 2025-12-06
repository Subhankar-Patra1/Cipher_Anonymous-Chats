import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import ChatWindow from '../components/ChatWindow';
import CreateRoomModal from '../components/CreateRoomModal';
import JoinRoomModal from '../components/JoinRoomModal';
import GroupInfoModal from '../components/GroupInfoModal';
import io from 'socket.io-client';

export default function Dashboard() {
    const { user, token, logout } = useAuth();
    const [rooms, setRooms] = useState([]);
    const [activeRoom, setActiveRoom] = useState(null);
    const [socket, setSocket] = useState(null);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showJoinModal, setShowJoinModal] = useState(false);
    const [showGroupInfo, setShowGroupInfo] = useState(false);
    const activeRoomRef = useRef(null);
    
    // Resize Logic
    const [sidebarWidth, setSidebarWidth] = useState(288); // Default w-72 (288px)
    const [isResizing, setIsResizing] = useState(false);
    const sidebarRef = useRef(null);

    const startResizing = useCallback(() => setIsResizing(true), []);
    const stopResizing = useCallback(() => setIsResizing(false), []);

    const resize = useCallback((mouseMoveEvent) => {
        if (isResizing) {
            const newWidth = mouseMoveEvent.clientX;
            if (newWidth >= 200 && newWidth <= 600) {
                setSidebarWidth(newWidth);
            }
        }
    }, [isResizing]);

    useEffect(() => {
        window.addEventListener("mousemove", resize);
        window.addEventListener("mouseup", stopResizing);
        return () => {
            window.removeEventListener("mousemove", resize);
            window.removeEventListener("mouseup", stopResizing);
        };
    }, [resize, stopResizing]);

    useEffect(() => {
        activeRoomRef.current = activeRoom;
        setShowGroupInfo(false); // Close group info modal when changing rooms
    }, [activeRoom]);

    // Fetch rooms on mount
    useEffect(() => {
        fetch(`${import.meta.env.VITE_API_URL}/api/rooms`, {
            headers: { Authorization: `Bearer ${token}` }
        })
        .then(res => res.json())
        .then(data => {
            if (Array.isArray(data)) {
                setRooms(data);
            }
        })
        .catch(err => console.error(err));
    }, [token]);

    useEffect(() => {
        const newSocket = io(import.meta.env.VITE_API_URL, {
            auth: { token }
        });

        newSocket.on('connect', () => {
            console.log('Connected to socket');
        });

        newSocket.on('room_added', (newRoom) => {
            setRooms(prev => {
                if (prev.find(r => r.id === newRoom.id)) return prev;
                return [newRoom, ...prev];
            });
            newSocket.emit('join_room', newRoom.id);
        });

        newSocket.on('new_message', (msg) => {
            setRooms(prev => prev.map(r => {
                if (r.id === msg.room_id) {
                    if (activeRoomRef.current?.id !== r.id) {
                        return { ...r, unread_count: (r.unread_count || 0) + 1 };
                    }
                }
                return r;
            }));
        });

        setSocket(newSocket);

        return () => newSocket.close();
    }, [token]);

    // Join rooms when they are loaded or socket connects
    useEffect(() => {
        if (socket && rooms.length > 0) {
            rooms.forEach(room => {
                socket.emit('join_room', room.id);
            });
        }
    }, [socket, rooms]);

    // Consolidated Data Fetching
    useEffect(() => {
        if (!token) return;

        console.log('Dashboard mounted/token changed. Fetching data...');

        const fetchData = async () => {
            try {
                // Fetch Rooms
                console.log('Fetching rooms...');
                const res = await fetch(`${import.meta.env.VITE_API_URL}/api/rooms`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                
                if (res.ok) {
                    const data = await res.json();
                    console.log('Rooms fetched:', data.length);
                    setRooms(data);
                } else {
                    console.error('Failed to fetch rooms:', res.status);
                }

                // Handle Pending Invites (moved here to run sequentially)
                await handlePendingInvite();
            } catch (err) {
                console.error('Error in data fetch:', err);
            }
        };

        const handlePendingInvite = async () => {
            const params = new URLSearchParams(window.location.search);
            const joinCode = params.get('joinCode');
            const chatUser = params.get('chatUser');

            if (joinCode) {
                window.history.replaceState({}, document.title, window.location.pathname);
                await handleJoinRoom(joinCode);
                return;
            }

            if (chatUser) {
                window.history.replaceState({}, document.title, window.location.pathname);
                try {
                    const searchRes = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/search?q=${chatUser}`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    const users = await searchRes.json();
                    const target = users.find(u => u.username === chatUser);
                    if (target) {
                        await handleCreateRoom({ type: 'direct', targetUserId: target.id });
                    }
                } catch (err) {
                    console.error('Error resolving invite:', err);
                }
                return;
            }
        };

        fetchData();
    }, [token]);

    const markAsRead = async (roomId) => {
        try {
            await fetch(`${import.meta.env.VITE_API_URL}/api/rooms/${roomId}/read`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });
            // Update local state
            setRooms(prev => prev.map(r => 
                r.id === roomId ? { ...r, unread_count: 0 } : r
            ));
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => {
        if (activeRoom) {
            markAsRead(activeRoom.id);
        }
    }, [activeRoom]);

    const handleCreateRoom = async (roomData) => {
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/rooms`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}` 
                },
                body: JSON.stringify(roomData)
            });
            if (res.ok) {
                const newRoom = await res.json();
                
                // Check if room already exists in list
                const exists = rooms.find(r => r.id === newRoom.id);
                if (!exists) {
                    setRooms([newRoom, ...rooms]);
                }
                
                setActiveRoom(newRoom);
                setShowCreateModal(false);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleJoinRoom = async (code) => {
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/rooms/join`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}` 
                },
                body: JSON.stringify({ code })
            });
            const newRoom = await res.json();
            if (res.ok) {
                // Check if already in list (shouldn't be, but safety first)
                if (!rooms.find(r => r.id === newRoom.id)) {
                    setRooms(prev => [newRoom, ...prev]);
                }
                setActiveRoom(newRoom);
                setShowJoinModal(false);
            } else {
                alert(newRoom.error);
            }
        } catch (err) {
            console.error(err);
        }
    };

    return (
        <div className={`flex h-screen bg-gray-900 text-white overflow-hidden ${isResizing ? 'select-none cursor-col-resize' : ''}`}>
            {/* Mobile: Sidebar hidden if activeRoom exists. Desktop: Always visible */}
            <div 
                className={`
                    ${activeRoom ? 'hidden md:flex' : 'flex'} 
                    h-full z-10 shrink-0
                `}
                style={{ width: window.innerWidth >= 768 ? sidebarWidth : '100%' }}
            >
                <Sidebar 
                    rooms={rooms} 
                    activeRoom={activeRoom} 
                    onSelectRoom={setActiveRoom}
                    onCreateRoom={() => setShowCreateModal(true)}
                    onJoinRoom={() => setShowJoinModal(true)}
                    user={user}
                    onLogout={logout}
                />
            </div>

            {/* Drag Handle (Desktop Only) */}
            {!showGroupInfo && (
                <div 
                    className="hidden md:block w-1 hover:w-1.5 cursor-col-resize bg-slate-800 hover:bg-violet-500 transition-all z-10 shrink-0"
                    onMouseDown={startResizing}
                />
            )}
            
            {/* Mobile: Chat visible if activeRoom exists. Desktop: Always visible (flex-1) */}
            <div className={`
                ${activeRoom ? 'flex' : 'hidden md:flex'} 
                flex-1 flex-col h-full bg-gray-900 relative z-0 min-w-0
            `}>
                {activeRoom ? (
                    <ChatWindow 
                        socket={socket} 
                        room={activeRoom} 
                        user={user} 
                        onBack={() => setActiveRoom(null)}
                        showGroupInfo={showGroupInfo}
                        setShowGroupInfo={setShowGroupInfo}
                    />
                ) : (
                    <div className="flex-1 flex items-center justify-center text-gray-500">
                        <div className="text-center">
                            <span className="material-symbols-outlined text-6xl text-slate-700 mb-4">chat_bubble_outline</span>
                            <p>Select a room to start chatting</p>
                        </div>
                    </div>
                )}
            </div>

            {showCreateModal && (
                <CreateRoomModal 
                    onClose={() => setShowCreateModal(false)} 
                    onCreate={handleCreateRoom} 
                />
            )}

            {showJoinModal && (
                <JoinRoomModal 
                    onClose={() => setShowJoinModal(false)} 
                    onJoin={handleJoinRoom} 
                />
            )}

            {showGroupInfo && activeRoom && (
                <GroupInfoModal 
                    room={activeRoom} 
                    onClose={() => setShowGroupInfo(false)}
                    onLeave={async () => {
                         if (!confirm('Are you sure you want to leave this group?')) return;
                         try {
                             await fetch(`${import.meta.env.VITE_API_URL}/api/rooms/${activeRoom.id}/leave`, {
                                 method: 'POST',
                                 headers: { Authorization: `Bearer ${token}` }
                             });
                             window.location.reload(); 
                         } catch (err) {
                             console.error(err);
                         }
                    }}
                    // Kick would be handled within modal or via props if needed, but GroupInfoModal handles it internally mostly or via context
                />
            )}
        </div>
    );
}
