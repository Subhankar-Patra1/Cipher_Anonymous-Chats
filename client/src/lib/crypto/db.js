import { openDB } from 'idb';

const DB_NAME = 'CipherE2EE';
const DB_VERSION = 2; // Bumped for TOFU store

export const initDB = async () => {
    return openDB(DB_NAME, DB_VERSION, {
        upgrade(db, oldVersion) {
            // Store the user's own Device Keys (RSA + Ed25519)
            if (!db.objectStoreNames.contains('device_identity')) {
                db.createObjectStore('device_identity', { keyPath: 'id' });
            }
            
            // Store Room Keys (AES)
            // Key: [roomId]_[version]
            if (!db.objectStoreNames.contains('room_keys')) {
                db.createObjectStore('room_keys', { keyPath: 'id' });
            }

            // [NEW] Store TOFU trusted signing keys
            // Key: deviceId, Value: signing_public_key
            if (!db.objectStoreNames.contains('trusted_keys')) {
                db.createObjectStore('trusted_keys', { keyPath: 'deviceId' });
            }
        },
    });
};

export const saveDeviceIdentity = async (identity) => {
    const db = await initDB();
    // Identity contains: deviceId, keyPair (RSA), signingKeyPair (Ed25519)
    await db.put('device_identity', identity);
};

export const getDeviceIdentity = async () => {
    const db = await initDB();
    // We assume single identity per browser context for now
    return await db.get('device_identity', 'current');
};

export const saveRoomKey = async (roomId, version, keyData) => {
    const db = await initDB();
    // keyData: { key: CryptoKey, version: number, roomId: string }
    const rId = String(roomId); 
    await db.put('room_keys', {
        id: `${rId}_${version}`,
        roomId: rId,
        version,
        key: keyData.key,
        createdAt: Date.now()
    });
};

export const getRoomKey = async (roomId, version) => {
    const db = await initDB();
    const rId = String(roomId);
    return await db.get('room_keys', `${rId}_${version}`);
};

export const getLatestRoomKey = async (roomId) => {
    const db = await initDB();
    // Inefficient scan but works for now. 
    // Ideally use index on roomId + version.
    // Given low volume of keys per room (rotations rare), getAll is fine.
    const all = await db.getAll('room_keys');
    const rId = String(roomId);
    const roomKeys = all.filter(k => String(k.roomId) === rId).sort((a,b) => b.version - a.version);
    return roomKeys[0]; // Latest
};

// --- TOFU Trusted Keys ---

export const saveTrustedKey = async (deviceId, signingPublicKey) => {
    const db = await initDB();
    await db.put('trusted_keys', {
        deviceId,
        signingPublicKey,
        trustedAt: Date.now()
    });
};

export const getTrustedKey = async (deviceId) => {
    const db = await initDB();
    return await db.get('trusted_keys', deviceId);
};

export const getAllTrustedKeys = async () => {
    const db = await initDB();
    return await db.getAll('trusted_keys');
};

/**
 * [NEW] Key Sync Helpers
 */

export const countRoomKeys = async () => {
    const db = await initDB();
    return await db.count('room_keys');
};

export const getAllRoomKeys = async () => {
    const db = await initDB();
    return await db.getAll('room_keys');
};

export const saveBulkRoomKeys = async (keys) => {
    const db = await initDB();
    const tx = db.transaction('room_keys', 'readwrite');
    await Promise.all(keys.map(k => tx.store.put(k)));
    await tx.done;
};

export const saveBulkTrustedKeys = async (keys) => {
    const db = await initDB();
    const tx = db.transaction('trusted_keys', 'readwrite');
    await Promise.all(keys.map(k => tx.store.put(k)));
    await tx.done;
};
