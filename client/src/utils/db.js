import { openDB } from 'idb';

const DB_NAME = 'cipher_offline_db';
const STORE_NAME = 'pending_messages';

export const initDB = async () => {
    return openDB(DB_NAME, 1, {
        upgrade(db) {
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'tempId' });
            }
        },
    });
};

export const savePendingMessage = async (message) => {
    const db = await initDB();
    await db.put(STORE_NAME, message);
};

export const getPendingMessages = async () => {
    const db = await initDB();
    return db.getAll(STORE_NAME);
};

export const deletePendingMessage = async (tempId) => {
    const db = await initDB();
    await db.delete(STORE_NAME, tempId);
};

export const clearPendingMessages = async () => {
    const db = await initDB();
    await db.clear(STORE_NAME);
};
