import { useChatLock } from '../context/ChatLockContext';
import ChatUnlockScreen from './ChatUnlockScreen';

/**
 * Wrapper component that shows ChatUnlockScreen in right panel when needed
 * Uses ChatLockContext to detect pending unlock requests
 */
export default function ChatAreaLockGuard({ children, onUnlockComplete }) {
    const { pendingUnlockRoom, cancelUnlock, completeUnlock, verifyPasscode, removeLock } = useChatLock();

    if (pendingUnlockRoom) {
        return (
            <div className="flex-1 flex flex-col h-full bg-gray-50 dark:bg-slate-950 relative z-0 min-w-0 overflow-hidden">
                <ChatUnlockScreen
                    room={pendingUnlockRoom}
                    onUnlock={() => {
                        const room = completeUnlock();
                        if (onUnlockComplete && room) {
                            onUnlockComplete(room);
                        }
                    }}
                    onCancel={cancelUnlock}
                    verifyPasscode={verifyPasscode}
                    removeLock={removeLock}
                />
            </div>
        );
    }

    return children;
}
