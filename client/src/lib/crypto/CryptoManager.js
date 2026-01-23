import { 
    saveDeviceIdentity, getDeviceIdentity, saveRoomKey, getRoomKey, getLatestRoomKey, 
    saveTrustedKey, getTrustedKey, getAllRoomKeys, getAllTrustedKeys, saveBulkRoomKeys, saveBulkTrustedKeys,
    saveBackupConfig, getBackupConfig
} from './db';

/**
 * CryptoManager - Handles all Client-Side E2EE Operations
 * - RSA-OAEP: Room key encryption
 * - Ed25519: Message signing
 * - AES-GCM: Message encryption
 */
class CryptoManager {
    constructor() {
        this.deviceId = null;
        this.keyPair = null; // RSA-OAEP { publicKey, privateKey }
        this.signingKeyPair = null; // Ed25519 { publicKey, privateKey }
        this.roomKeyCache = new Map(); // [NEW] Cache for room keys
        this.keyDistributionLog = new Map(); // [NEW] roomId:version -> Set<deviceId> (Track who we sent keys to)
        
        // [NEW] Auto-backup properties
        this.autoBackupDerivedKey = null; // In-memory derived key (not persisted for security)
        this.autoBackupSalt = null;
        this.autoBackupTimeout = null; // Debounce timer
        this.autoBackupToken = null; // Auth token for API calls
    }

    // --- 1. Initialization ---

    /**
     * Initializes the manager. Checks if keys exist, if not generates them.
     * Returns both Public Keys (base64) to be sent to server if new.
     */
    async init() {
        try {
            const identity = await getDeviceIdentity();
            if (identity) {
                this.deviceId = identity.deviceId;
                this.keyPair = identity.keyPair;
                this.signingKeyPair = identity.signingKeyPair;
                
                // [FIX] Legacy Identity Support: Generate signing key if missing
                if (!this.signingKeyPair) {
                    console.log('[Crypto] Upgrading identity: Generating missing signing key...');
                    const signingKeyPair = await window.crypto.subtle.generateKey(
                        "Ed25519",
                        false,
                        ["sign", "verify"]
                    );
                    this.signingKeyPair = signingKeyPair;
                    
                    // Update DB
                    await saveDeviceIdentity({
                        id: 'current',
                        deviceId: this.deviceId,
                        keyPair: this.keyPair,
                        signingKeyPair: this.signingKeyPair
                    });
                    
                    // Return keys to trigger server update
                    const exportedPub = await window.crypto.subtle.exportKey("spki", this.keyPair.publicKey);
                    const exportedSigningPub = await window.crypto.subtle.exportKey("spki", signingKeyPair.publicKey);
                    
                    return {
                        deviceId: this.deviceId,
                        publicKey: this.arrayBufferToBase64(exportedPub),
                        signingPublicKey: this.arrayBufferToBase64(exportedSigningPub)
                    };
                }

                console.log('[Crypto] Identity loaded:', this.deviceId);
                return null; // Already fully initialized
            }

            console.log('[Crypto] Generating new identity...');
            
            // Generate RSA-OAEP KeyPair for Key Exchange
            const keyPair = await window.crypto.subtle.generateKey(
                {
                    name: "RSA-OAEP",
                    modulusLength: 2048,
                    publicExponent: new Uint8Array([1, 0, 1]),
                    hash: "SHA-256",
                },
                false, // Non-extractable
                ["encrypt", "decrypt"]
            );

            // Generate Ed25519 KeyPair for Signing
            const signingKeyPair = await window.crypto.subtle.generateKey(
                "Ed25519",
                false, // Non-extractable
                ["sign", "verify"]
            );

            this.deviceId = crypto.randomUUID();
            this.keyPair = keyPair;
            this.signingKeyPair = signingKeyPair;

            // Save to DB
            await saveDeviceIdentity({
                id: 'current',
                deviceId: this.deviceId,
                keyPair: keyPair,
                signingKeyPair: signingKeyPair
            });

            // Export Public Keys to upload
            const exportedPub = await window.crypto.subtle.exportKey("spki", keyPair.publicKey);
            const exportedSigningPub = await window.crypto.subtle.exportKey("spki", signingKeyPair.publicKey);
            
            return {
                deviceId: this.deviceId,
                publicKey: this.arrayBufferToBase64(exportedPub),
                signingPublicKey: this.arrayBufferToBase64(exportedSigningPub)
            };

        } catch (err) {
            console.error('[Crypto] Init failed:', err);
            throw err;
        }
    }

    async getPublicKey() {
        if (!this.keyPair) await this.init();
        const exported = await window.crypto.subtle.exportKey("spki", this.keyPair.publicKey);
        return this.arrayBufferToBase64(exported);
    }

    async getSigningPublicKey() {
        if (!this.signingKeyPair) await this.init();
        const exported = await window.crypto.subtle.exportKey("spki", this.signingKeyPair.publicKey);
        return this.arrayBufferToBase64(exported);
    }

    // --- 2. Room Key Management ---

    async getRoomKey(roomId, version = null) {
        roomId = String(roomId); // Ensure string
        
        // 1. Check in-memory cache
        const cacheKey = version ? `${roomId}:${version}` : roomId;
        if (this.roomKeyCache.has(cacheKey)) {
            // If requesting specific version, exact match
            // If requesting latest (no version), cache might store latest under 'roomId' key
            return this.roomKeyCache.get(cacheKey);
        }
        
        // [Optimization] If requesting latest, but we have *some* specific version in cache?
        // No, 'getLatestRoomKey' logic is specific (finds max version).
        // Check if we have the explicit 'latest' entry for this room
        if (!version && this.roomKeyCache.has(roomId)) {
             return this.roomKeyCache.get(roomId);
        }

        // 2. Fetch from DB
        if (version) {
            const specific = await getRoomKey(roomId, version);
            if (specific) {
                const data = { key: specific.key, version: specific.version };
                this.roomKeyCache.set(`${roomId}:${version}`, data); // Cache specific
                return data;
            }
        } else {
             // Try to get latest local key
             const latest = await getLatestRoomKey(roomId);
             if (latest) {
                  // console.log('[Crypto] Found local room key v', latest.version);
                  const data = { key: latest.key, version: latest.version };
                  
                  // Cache as latest AND specific
                  this.roomKeyCache.set(roomId, data); 
                  this.roomKeyCache.set(`${roomId}:${latest.version}`, data);
                  
                  return data;
             }
        }
        return null;
    }

    async saveRoomKey(roomId, key, version) {
        roomId = String(roomId);
        
        // Save to DB
        await saveRoomKey(roomId, version, { key });
        
        // Update Cache
        const data = { key, version };
        this.roomKeyCache.set(`${roomId}:${version}`, data);
        this.roomKeyCache.set(roomId, data); // Assume newest is now latest
        
        // [NEW] Trigger auto-backup (debounced)
        this.triggerAutoBackup();

        // [NEW] Notify UI that keys have been updated
        window.dispatchEvent(new CustomEvent('cipher:keys-updated', { detail: { roomId, version } }));
    }

    /**
     * [Optimization] Pre-fetch keys for a list of rooms
     * This warms up the cache so clicking a chat is instant.
     */
    async prefetchKeys(rooms) {
        if (!rooms || rooms.length === 0) return;
        
        console.log(`[Crypto] Pre-fetching keys for ${rooms.length} rooms...`);
        
        // Use Promise.all to fetch in parallel (IndexedDB handles concurrency well)
        await Promise.all(rooms.map(async (room) => {
            try {
                // Determine version to fetch: priority to last_message_key_version, else valid latest
                const version = room.last_message_key_version; 
                
                // Just calling getRoomKey populates the cache
                await this.getRoomKey(room.id, version);
            } catch (e) {
                // Ignore individual failures
            }
        }));
        
        console.log('[Crypto] Key pre-fetch complete.');
    }

    /**
     * Orchestrator: Generate new key, save locally, and encrypt for all target devices.
     */
    async generateAndEncryptRoomKey(roomId, devices) {
        console.log('[Crypto] Generating new room key for', devices.length, 'devices');
        const roomKey = await this.generateRoomKey();
        
        // Save locally (my device)
        // Use timestamp to prevent collisions with old v1 keys if state is reset
        const version = Date.now(); 
        await this.saveRoomKey(roomId, roomKey, version);

        const encryptedKeys = {};
        
        for (const device of devices) {
            try {
                // device: { deviceId, publicKey (base64) }
                const encrypted = await this.encryptRoomKeyForDevice(roomKey, device.publicKey);
                encryptedKeys[device.deviceId] = encrypted;
            } catch (e) {
                console.error('Failed to encrypt for device', device.deviceId, e);
            }
        }
        
        return { roomKey, encryptedKeys, version };
    }

    /**
     * [NEW] Piggybacking: Generate Distribution Headers
     * Checks which devices need the key and encrypts it for them.
     */
    async getDistributionHeaders(roomId, roomKey, version, devices) {
        if (!devices || devices.length === 0) return null;
        if (!this.deviceId) await this.init();

        const distKey = `${roomId}:${version}`;
        if (!this.keyDistributionLog.has(distKey)) {
            this.keyDistributionLog.set(distKey, new Set());
        }
        const sentLog = this.keyDistributionLog.get(distKey);
        
        const headers = {};
        let needsHeader = false;

        for (const device of devices) {
            // Skip self
            if (device.deviceId === this.deviceId) continue;

            // Skip if already sent to this device for this key version
            // [FIX] Disable optimization to ensure robust delivery ("Stateless" Mode)
            // if (sentLog.has(device.deviceId)) continue;

            try {
                if (device.publicKey) {
                    const encrypted = await this.encryptRoomKeyForDevice(roomKey, device.publicKey);
                    headers[device.deviceId] = encrypted;
                    sentLog.add(device.deviceId); // Mark as sent (Optimistic)
                    needsHeader = true;
                }
            } catch (e) {
                console.warn(`[Crypto] Failed to piggyback key for ${device.deviceId}`, e);
            }
        }

        return needsHeader ? headers : null;
    }

    /**
     * [NEW] Piggybacking: Extract Key from Headers
     * Checks if headers contain a key for my device.
     */
    async extractRoomKeyFromHeaders(headers, roomId, version) {
        if (!headers || !this.deviceId) return null;

        const myEncryptedKey = headers[this.deviceId];
        if (myEncryptedKey) {
            try {
                console.log(`[Crypto] Found piggybacked key v${version} for me!`);
                const roomKey = await this.decryptRoomKey(myEncryptedKey);
                
                // Save it!
                await this.saveRoomKey(roomId, roomKey, version);
                return roomKey;
            } catch (e) {
                console.error('[Crypto] Failed to decrypt piggybacked key', e);
            }
        }
        return null;
    }

    /**
     * Generates a new random AES-GCM Key for a room (Group Sender Key)
     */
    async generateRoomKey() {
        return await window.crypto.subtle.generateKey(
            {
                name: "AES-GCM",
                length: 256
            },
            true, // Extractable so we can encrypt it for others
            ["encrypt", "decrypt"]
        );
    }

    /**
     * Import a raw/exported key (e.g. from server) back to CryptoKey
     */
    async importRoomKey(rawKeyBuffer) {
        return await window.crypto.subtle.importKey(
            "raw",
            rawKeyBuffer,
            "AES-GCM",
            true,
            ["encrypt", "decrypt"]
        );
    }
    
    /**
     * Import a public RSA Key (from another user's device)
     */
    async importPublicKey(base64Key) {
        const binary = this.base64ToArrayBuffer(base64Key);
        return await window.crypto.subtle.importKey(
            "spki",
            binary,
            {
                name: "RSA-OAEP",
                hash: "SHA-256"
            },
            true,
            ["encrypt"]
        );
    }

    /**
     * Encrypts the RoomKey for a specific Device's Public Key
     */
    async encryptRoomKeyForDevice(roomKey, targetPublicKeyBase64) {
        const targetPubKey = await this.importPublicKey(targetPublicKeyBase64);
        
        // Export AES key to raw bytes
        const rawRoomKey = await window.crypto.subtle.exportKey("raw", roomKey);

        // Encrypt with RSA
        const encryptedBuffer = await window.crypto.subtle.encrypt(
            {
                name: "RSA-OAEP"
            },
            targetPubKey,
            rawRoomKey
        );
        
        return this.arrayBufferToBase64(encryptedBuffer);
    }

    /**
     * Decrypts an encrypted Room Key using my Private Key
     */
    async decryptRoomKey(encryptedKeyBase64) {
        if (!this.keyPair) throw new Error("Identity not initialized");
        
        const encryptedBuffer = this.base64ToArrayBuffer(encryptedKeyBase64);
        
        const rawKeyBuffer = await window.crypto.subtle.decrypt(
            {
                name: "RSA-OAEP"
            },
            this.keyPair.privateKey,
            encryptedBuffer
        );
        
        return await this.importRoomKey(rawKeyBuffer);
    }

    // --- 3. Message Encryption (HKDF + AES) ---
    // For simplicity in V1, we will use the RoomKey DIRECTLY for AES-GCM 
    // instead of complex HKDF ratcheting per message, 
    // as specifically requested "Minimal Fix" was acceptable too, but Plan said HKDF.
    // Let's do a simple HKDF derivation if possible, or stick to RoomKey directly for Phase 2 start?
    // User asked for "Check: Ephemeral Message Keys ... derived using HKDF".
    // Let's implement HKDF.
    
    /**
     * Derive a message key using HKDF with deterministic salt from messageId
     * This ensures sender and receiver derive the EXACT same key
     */
    async deriveMessageKey(roomKey, messageId) {
         if (!messageId) throw new Error("messageId is required for key derivation");
         
         // Derive salt deterministically from messageId using SHA-256
         const salt = await window.crypto.subtle.digest(
             "SHA-256",
             new TextEncoder().encode(String(messageId))
         );
         
         const rawRoomKey = await window.crypto.subtle.exportKey("raw", roomKey);

         // [DEBUG] Log Key Checksum and Salt
         try {
             // const keyView = new Uint8Array(rawRoomKey);
             // const saltView = new Uint8Array(salt);
             // console.log(`[Crypto] DeriveKey: Key[0]=${keyView[0]} Key[L]=${keyView[keyView.length-1]} Salt[0]=${saltView[0]} MsgId=${messageId}`);
         } catch(e) { console.error('Log error', e); }
         
         const keyMaterial = await window.crypto.subtle.importKey(
             "raw", 
             rawRoomKey, 
             "HKDF", 
             false, 
             ["deriveKey"]
         );

         return await window.crypto.subtle.deriveKey(
             {
                 name: "HKDF",
                 salt: salt,
                 info: new TextEncoder().encode("CipherMessageKey"),
                 hash: "SHA-256"
             },
             keyMaterial,
             { name: "AES-GCM", length: 256 },
             false,
             ["encrypt", "decrypt"]
         );
    }

    /**
     * Encrypt a text message
     * Returns: { ciphertext, iv }
     * Note: Salt is now derived from messageId, not stored
     */
    async encryptMessage(text, roomKey, messageId) {
        if (!messageId) throw new Error("messageId is required for encryption");
        
        const messageKey = await this.deriveMessageKey(roomKey, messageId);
        
        const iv = window.crypto.getRandomValues(new Uint8Array(12)); // For AES-GCM
        const encoded = new TextEncoder().encode(text);
        
        const encryptedBuffer = await window.crypto.subtle.encrypt(
            {
                name: "AES-GCM",
                iv: iv
            },
            messageKey,
            encoded
        );

        return {
            ciphertext: this.arrayBufferToBase64(encryptedBuffer),
            iv: this.arrayBufferToBase64(iv)
            // No salt - it's derived from messageId
        };
    }

    /**
     * Decrypt a message
     * Salt is derived from messageId, not passed separately
     */
    async decryptMessage(ciphertext, ivBase64, messageId, roomKey, distributionHeaders = null, roomId = null, keyVersion = null) {
        try {
            if (!messageId) throw new Error("messageId is required for decryption");
            
            // [NEW] Piggyback Check
            if (!roomKey && distributionHeaders && roomId && keyVersion) {
                console.log('[Crypto] Key missing, checking piggyback headers...');
                roomKey = await this.extractRoomKeyFromHeaders(distributionHeaders, roomId, keyVersion);
            }

            // [FIX] Explicitly handle missing key to distinguish from corruption
            if (!roomKey) {
                // console.warn('[Crypto] Decrypt skipped: Missing Room Key for msg', messageId);
                return null; // Return null to signal "Waiting for key"
            }

            // ... (rest of decryption logic)

            // console.log('[Crypto] Decrypting:', { 
            //     cipherLen: ciphertext?.length, 
            //     ivLen: ivBase64?.length, 
            //     messageId: messageId,
            //     hasKey: !!roomKey
            // });

            const messageKey = await this.deriveMessageKey(roomKey, messageId);
            
            const iv = this.base64ToArrayBuffer(ivBase64);
            const encryptedData = this.base64ToArrayBuffer(ciphertext);
            
            const decryptedBuffer = await window.crypto.subtle.decrypt(
                {
                    name: "AES-GCM",
                    iv: iv
                },
                messageKey,
                encryptedData
            );
            
            return new TextDecoder().decode(decryptedBuffer);
        } catch (e) {
            console.error('Decryption failed', e);
            // [FIX] Only return error string if we actually tried and failed (e.g. bad tag/key)
            return '[Decryption Error]';
        }
    }

    // --- 4. Sender Authentication (Ed25519) ---

    /**
     * Import an Ed25519 Public Key
     */
    async importSigningKey(base64Key) {
        const binary = this.base64ToArrayBuffer(base64Key);
        return await window.crypto.subtle.importKey(
            "spki",
            binary,
            "Ed25519",
            true,
            ["verify"]
        );
    }

    /**
     * Create canonical string for signing: ciphertext|iv|temp_id|key_version
     * Never sign raw JSON to avoid ordering issues.
     */
    canonicalizeMessage(ciphertext, iv, tempId, keyVersion) {
        return `${ciphertext}|${iv}|${tempId}|${keyVersion}`;
    }

    /**
     * Sign a message using my Ed25519 Private Key
     */
    async signMessage(ciphertext, iv, tempId, keyVersion) {
        if (!this.signingKeyPair) throw new Error("Signing identity not initialized");

        const data = this.canonicalizeMessage(ciphertext, iv, tempId, keyVersion);
        const encoded = new TextEncoder().encode(data);

        const signature = await window.crypto.subtle.sign(
            "Ed25519",
            this.signingKeyPair.privateKey,
            encoded
        );

        return this.arrayBufferToBase64(signature);
    }

    /**
     * Verify a message signature + TOFU (Trust On First Use) Key Pinning
     */
    async verifySignature(ciphertext, iv, tempId, keyVersion, signatureBase64, senderDeviceId, senderPublicKeyBase64) {
        try {
            // 1. TOFU Check: Ensure public key hasn't changed for this device
            const trusted = await getTrustedKey(senderDeviceId);
            if (trusted) {
                if (trusted.signingPublicKey !== senderPublicKeyBase64) {
                     console.error(`[Crypto] SECURITY ALERT: Key mismatch for device ${senderDeviceId}`);
                     console.error(`Expected: ${trusted.signingPublicKey}`);
                     console.error(`Received: ${senderPublicKeyBase64}`);
                     throw new Error("SECURITY_ALERT_KEY_MISMATCH");
                }
            } else {
                // First time seeing this device - Trust it
                console.log(`[Crypto] TOFU: Trusting new device ${senderDeviceId}`);
                await saveTrustedKey(senderDeviceId, senderPublicKeyBase64);
            }

            // 2. Verify Signature
            const publicKey = await this.importSigningKey(senderPublicKeyBase64);
            const data = this.canonicalizeMessage(ciphertext, iv, tempId, keyVersion);
            const encoded = new TextEncoder().encode(data);
            const signature = this.base64ToArrayBuffer(signatureBase64);

            const isValid = await window.crypto.subtle.verify(
                "Ed25519",
                publicKey,
                signature,
                encoded
            );

            if (!isValid) throw new Error("Invalid Signature");
            
            return true;
        } catch (e) {
            console.error('[Crypto] Verification failed:', e);
            throw e;
        }
    }

    // --- 5. Key Rotation (Revocation Support) ---

    /**
     * Rotates the key for a specific room.
     * Fetches valid devices, generates new key, encrypts, and uploads.
     */
    async rotateRoomKey(roomId, token) {
        if (!this.deviceId) await this.init();

        console.log(`[Crypto] Starting key rotation for room ${roomId}...`);

        // 1. Fetch valid devices
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/rooms/${roomId}/devices`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Failed to fetch devices');
        const devices = await res.json();
        
        // 2. Generate and Encrypt
        // Filter out devices with missing keys if any (robustness)
        const validDevices = devices.filter(d => d.publicKey);
        const setup = await this.generateAndEncryptRoomKey(roomId, validDevices);
        
        // 3. Upload with senderDeviceId
        const uploadRes = await fetch(`${import.meta.env.VITE_API_URL}/api/rooms/${roomId}/keys`, {
             method: 'POST',
             headers: { 
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}` 
             },
             body: JSON.stringify({ 
                 keys: setup.encryptedKeys, 
                 keyVersion: setup.version,
                 senderDeviceId: this.deviceId 
             })
        });
        
        if (!uploadRes.ok) {
            const err = await uploadRes.json();
            if (err.code === 'RACE_CONDITION') {
                console.warn('[Crypto] Race condition during rotation - another device won. This is fine.');
                return { success: true, raced: true };
            }
            console.error('[Crypto] Rotation upload failed:', err);
            throw new Error('Upload failed: ' + err.error);
        }
        
        console.log(`[Crypto] Rotated key for room ${roomId} to v${setup.version}`);
        
        // [NEW] Notify UI
        window.dispatchEvent(new CustomEvent('cipher:keys-updated', { detail: { roomId, version: setup.version } }));
        
        return { success: true, version: setup.version };
    }


    // --- 5. Key Sync & Serialization (The Serialization Trap) ---

    /**
     * Export all room keys and trusted keys as a JWK-serialized JSON blob.
     */
    async exportAllKeysSync() {
        const roomKeys = await getAllRoomKeys();
        const trustedKeys = await getAllTrustedKeys();

        // Serialize RoomKeys (CryptoKey -> JWK)
        const serializedRoomKeys = await Promise.all(roomKeys.map(async (k) => ({
            ...k,
            key: await window.crypto.subtle.exportKey('jwk', k.key)
        })));

        return JSON.stringify({
            roomKeys: serializedRoomKeys,
            trustedKeys
        });
    }

    /**
     * Import JWK-serialized keys back into IndexedDB.
     */
    async importKeysSync(jsonBlob) {
        const { roomKeys, trustedKeys } = JSON.parse(jsonBlob);

        // Deserialize RoomKeys (JWK -> CryptoKey)
        const deserializedRoomKeys = await Promise.all(roomKeys.map(async (k) => ({
            ...k,
            key: await window.crypto.subtle.importKey(
                'jwk',
                k.key,
                'AES-GCM',
                true,
                ['encrypt', 'decrypt']
            )
        })));

        await saveBulkRoomKeys(deserializedRoomKeys);
        await saveBulkTrustedKeys(trustedKeys);
        
        // Clear in-memory cache to force refresh from DB
        this.roomKeyCache.clear();
        
        console.log(`[Crypto] Successfully synced ${roomKeys.length} room keys and ${trustedKeys.length} trusted keys.`);
        
        // [NEW] Notify UI
        window.dispatchEvent(new CustomEvent('cipher:keys-updated', { detail: { type: 'bulk-import' } }));
    }

    /**
     * Generate an ephemeral ECDH key pair for secure device-to-device transfer.
     */
    async generateECDHKeyPair() {
        return await window.crypto.subtle.generateKey(
            { name: "ECDH", namedCurve: "P-256" },
            true,
            ["deriveKey", "deriveBits"]
        );
    }

    /**
     * Derive a shared encryption key from another device's public key.
     */
    async deriveSharedSyncKey(myPrivateKey, otherPublicKeyBase64) {
        const otherPubKey = await window.crypto.subtle.importKey(
            "spki",
            this.base64ToArrayBuffer(otherPublicKeyBase64),
            { name: "ECDH", namedCurve: "P-256" },
            true,
            []
        );

        return await window.crypto.subtle.deriveKey(
            { name: "ECDH", public: otherPubKey },
            myPrivateKey,
            { name: "AES-GCM", length: 256 },
            true,
            ["encrypt", "decrypt"]
        );
    }

    /**
     * Encrypt the key bundle with the shared ECDH secret.
     */
    async encryptSyncBundle(bundle, sharedKey) {
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const encrypted = await window.crypto.subtle.encrypt(
            { name: "AES-GCM", iv },
            sharedKey,
            new TextEncoder().encode(bundle)
        );

        return {
            ciphertext: this.arrayBufferToBase64(encrypted),
            iv: this.arrayBufferToBase64(iv)
        };
    }

    /**
     * Decrypt the key bundle with the shared ECDH secret.
     */
    async decryptSyncBundle(encryptedBlob, sharedKey) {
        const iv = this.base64ToArrayBuffer(encryptedBlob.iv);
        const ciphertext = this.base64ToArrayBuffer(encryptedBlob.ciphertext);

        const decrypted = await window.crypto.subtle.decrypt(
            { name: "AES-GCM", iv },
            sharedKey,
            ciphertext
        );

        return new TextDecoder().decode(decrypted);
    }

    /**
     * Phase 2: Cloud Backup (Signal Style)
     * Derive a key from a password using PBKDF2.
     */
    async deriveKeyFromPassword(password, saltBuffer) {
        const passwordBuffer = new TextEncoder().encode(password);
        
        // Import raw password as key material
        const keyMaterial = await window.crypto.subtle.importKey(
            "raw",
            passwordBuffer,
            "PBKDF2",
            false,
            ["deriveKey"]
        );

        // Derive AES-GCM key
        return await window.crypto.subtle.deriveKey(
            {
                name: "PBKDF2",
                salt: saltBuffer,
                iterations: 100000,
                hash: "SHA-256"
            },
            keyMaterial,
            { name: "AES-GCM", length: 256 },
            true,
            ["encrypt", "decrypt"]
        );
    }

    /**
     * Encrypt the key bundle with a password.
     */
    async encryptBackup(bundle, password) {
        const salt = window.crypto.getRandomValues(new Uint8Array(16));
        const derivedKey = await this.deriveKeyFromPassword(password, salt);
        const iv = window.crypto.getRandomValues(new Uint8Array(12));

        const encrypted = await window.crypto.subtle.encrypt(
            { name: "AES-GCM", iv },
            derivedKey,
            new TextEncoder().encode(bundle)
        );

        return {
            encryptedBlob: this.arrayBufferToBase64(encrypted),
            salt: this.arrayBufferToBase64(salt),
            iv: this.arrayBufferToBase64(iv)
        };
    }

    /**
     * Decrypt the key bundle with a password.
     */
    async decryptBackup(encryptedBlobBase64, saltBase64, ivBase64, password) {
        const salt = this.base64ToArrayBuffer(saltBase64);
        const iv = this.base64ToArrayBuffer(ivBase64);
        const encrypted = this.base64ToArrayBuffer(encryptedBlobBase64);

        const derivedKey = await this.deriveKeyFromPassword(password, salt);

        const decrypted = await window.crypto.subtle.decrypt(
            { name: "AES-GCM", iv },
            derivedKey,
            encrypted
        );

        return new TextDecoder().decode(decrypted);
    }

    // --- Utils ---
    arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    }

    base64ToArrayBuffer(base64) {
        const binary_string = window.atob(base64);
        const len = binary_string.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binary_string.charCodeAt(i);
        }
        return bytes.buffer;
    }

    // --- 6. Auto-Backup ---

    /**
     * Enable auto-backup by storing the derived key and salt.
     * Called after successful backup creation.
     */
    async enableAutoBackup(password, salt, token) {
        try {
            // Derive key from password (same as encryptBackup)
            const saltBuffer = this.base64ToArrayBuffer(salt);
            this.autoBackupDerivedKey = await this.deriveKeyFromPassword(password, saltBuffer);
            this.autoBackupSalt = salt;
            this.autoBackupToken = token;
            
            // Store salt in DB (not the derived key for security)
            await saveBackupConfig({ salt });
            
            console.log('[Crypto] Auto-backup enabled');
            return true;
        } catch (err) {
            console.error('[Crypto] Failed to enable auto-backup:', err);
            return false;
        }
    }

    /**
     * Set auth token for auto-backup (called on login)
     */
    setAutoBackupToken(token) {
        this.autoBackupToken = token;
    }

    /**
     * Check if auto-backup is available (derived key in memory)
     */
    isAutoBackupEnabled() {
        return !!this.autoBackupDerivedKey && !!this.autoBackupToken;
    }

    /**
     * Trigger auto-backup with debouncing (5 second delay).
     * Called after saveRoomKey.
     */
    triggerAutoBackup() {
        if (!this.isAutoBackupEnabled()) return;
        
        // Debounce: clear existing timeout and set new one
        if (this.autoBackupTimeout) {
            clearTimeout(this.autoBackupTimeout);
        }
        
        this.autoBackupTimeout = setTimeout(() => {
            this.performAutoBackup();
        }, 5000); // 5 second delay
    }

    /**
     * Perform the actual auto-backup.
     * Re-exports all keys, encrypts with stored derived key, and uploads.
     */
    async performAutoBackup() {
        if (!this.autoBackupDerivedKey || !this.autoBackupToken) {
            console.log('[Crypto] Auto-backup skipped: not enabled');
            return;
        }

        try {
            console.log('[Crypto] Performing auto-backup...');
            
            // 1. Export all keys
            const bundle = await this.exportAllKeysSync();
            
            // 2. Encrypt with stored derived key
            const iv = window.crypto.getRandomValues(new Uint8Array(12));
            const encrypted = await window.crypto.subtle.encrypt(
                { name: "AES-GCM", iv },
                this.autoBackupDerivedKey,
                new TextEncoder().encode(bundle)
            );
            
            const encryptedBlob = this.arrayBufferToBase64(encrypted);
            const ivBase64 = this.arrayBufferToBase64(iv);
            
            // 3. Upload to server (using existing salt)
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/backup`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${this.autoBackupToken}`
                },
                body: JSON.stringify({
                    encryptedBlob,
                    salt: this.autoBackupSalt,
                    iv: ivBase64
                })
            });
            
            if (res.ok) {
                console.log('[Crypto] Auto-backup completed successfully');
            } else {
                console.error('[Crypto] Auto-backup upload failed:', res.status);
            }
        } catch (err) {
            console.error('[Crypto] Auto-backup failed:', err);
        }
    }
}

export const cryptoManager = new CryptoManager();
