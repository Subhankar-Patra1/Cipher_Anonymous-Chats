import {
    KeyHelper,
    SessionBuilder,
    SessionCipher,
    SignalProtocolAddress,
} from '@privacyresearch/libsignal-protocol-typescript';
import localforage from 'localforage';

function bufferToBase64(buffer) {
    if (!buffer) return buffer;
    if (typeof buffer === 'string') return buffer;
    let bytes = new Uint8Array(buffer);
    if (buffer.length === undefined && buffer.byteLength === undefined) {
        bytes = new Uint8Array(Object.values(buffer)); // Handle serialized arraybuffer
    }
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function base64ToBuffer(base64) {
    if (!base64) return base64;
    // if JSON objectified ArrayBuffer, convert back to buffer
    if (typeof base64 === 'object' && base64.byteLength === undefined) {
        return new Uint8Array(Object.values(base64)).buffer;
    }
    if (typeof base64 !== 'string') return base64;
    const binary_string = atob(base64);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
}

/**
 * 1. The Store (The Safe)
 * This is an in-memory implementation of the Signal Protocol Store.
 * In a real-world app, you would swap this out to save to IndexedDB so keys persist on refresh.
 */
class InMemorySignalProtocolStore {
    constructor() {
        this.store = localforage.createInstance({
            name: "CipherSignalStoreV3"
        });
    }

    serializeObject(obj) {
        if (obj === null || obj === undefined) return obj;
        if (obj instanceof ArrayBuffer || obj instanceof Uint8Array || (obj.buffer && obj.buffer instanceof ArrayBuffer)) {
            return { __buffer: bufferToBase64(obj) };
        }
        if (Array.isArray(obj)) {
            return obj.map(v => this.serializeObject(v));
        }
        if (typeof obj === 'object') {
            const res = {};
            for (let k in obj) {
                res[k] = this.serializeObject(obj[k]);
            }
            return res;
        }
        return obj;
    }

    deserializeObject(obj) {
        if (obj === null || obj === undefined) return obj;
        if (typeof obj === 'object' && obj.__buffer) {
            return base64ToBuffer(obj.__buffer);
        }
        if (Array.isArray(obj)) {
            return obj.map(v => this.deserializeObject(v));
        }
        if (typeof obj === 'object') {
            const res = {};
            for (let k in obj) {
                res[k] = this.deserializeObject(obj[k]);
            }
            return res;
        }
        return obj;
    }

    async get(key, defaultValue) {
        if (key === null || key === undefined)
            throw new Error("Tried to get value for undefined/null key");       
        let val = await this.store.getItem(key);
        val = this.deserializeObject(val);
        if (val !== null) {
            return val;
        } else {
            return defaultValue;
        }
    }

    async remove(key) {
        if (key === null || key === undefined)
            throw new Error("Tried to remove value for undefined/null key");    
        await this.store.removeItem(key);
    }

    async put(key, value) {
        if (key === undefined || key === null || value === undefined || value === null)
            throw new Error("Tried to store undefined/null");
        await this.store.setItem(key, this.serializeObject(value));
        const kp = await this.get('identityKey');
        if (!kp) return undefined;
        return typeof kp === 'string' ? kp : kp;
    }

    async getLocalRegistrationId() {
        return await this.get('registrationId');
    }

    async putIdentity(identifier, identityKey) {
        await this.put('identityKey' + identifier, identityKey);
    }

    async getIdentity(identifier) {
        return await this.get('identityKey' + identifier);
    }

    async saveIdentity(identifier, identityKey) {
        if (identifier === null || identifier === undefined) throw new Error('undef id');
        return await this.put('identityKey' + identifier, identityKey);
    }

    async isTrustedIdentity(identifier, identityKey, direction) {
        if (identifier === null || identifier === undefined) throw new Error('undef id');
        const trusted = await this.get('identityKey' + identifier);
        if (trusted === undefined) {
            return true;
        }
        return JSON.stringify(trusted) === JSON.stringify(identityKey);
    }

    async storePreKey(preKeyId, preKeyRecord) {
        await this.put('25519KeypreKey' + preKeyId, preKeyRecord);
    }

    async loadPreKey(preKeyId) {
        const res = await this.get('25519KeypreKey' + preKeyId);
        if (res !== undefined) {
            return res;
        }
        return undefined;
    }

    async removePreKey(preKeyId) {
        await this.remove('25519KeypreKey' + preKeyId);
    }

    async storeSignedPreKey(signedPreKeyId, signedPreKeyRecord) {
        return await this.put('25519KeysignedKey' + signedPreKeyId, signedPreKeyRecord);
    }

    async loadSignedPreKey(signedPreKeyId) {
        const res = await this.get('25519KeysignedKey' + signedPreKeyId);
        if (res !== undefined) {
            return res;
        }
        return undefined;
    }

    async removeSignedPreKey(signedPreKeyId) {
        return await this.remove('25519KeysignedKey' + signedPreKeyId);
    }

    async loadSession(identifier) {
        return await this.get('session' + identifier);
    }

    async storeSession(identifier, record) {
        return await this.put('session' + identifier, record);
    }

    async removeSession(identifier) {
        return await this.remove('session' + identifier);

    }
}

/**
 * 2. The Manager (The Brains)
 * This helper class uses the Signal engine and our Store to generate keys,
 * build sessions, and encrypt/decrypt messages.
 */
class SignalManager {
    constructor() {
        this.store = new InMemorySignalProtocolStore();
    }

    /**
     * Step 1: Initialize the user's local keys.
     * This runs when a user logs in. It generates their core Identity and PreKeys.
     */
    

    async initializeStore() {
        let registrationId = await this.store.get('registrationId');
        let identityKeyPair = await this.store.get('identityKey');
        let preKeyRecord = await this.store.loadPreKey(1);
        let signedPreKeyRecord = await this.store.loadSignedPreKey(1);

        if (registrationId && identityKeyPair && preKeyRecord && signedPreKeyRecord) {
            return {
                registrationId,
                identityKey: bufferToBase64(identityKeyPair.pubKey),
                preKey: {
                    keyId: 1,
                    publicKey: bufferToBase64(preKeyRecord.keyPair.pubKey)
                },
                signedPreKey: {
                    keyId: 1,
                    publicKey: bufferToBase64(signedPreKeyRecord.keyPair.pubKey),
                    signature: bufferToBase64(signedPreKeyRecord.signature)
                }
            };
        }

        registrationId = KeyHelper.generateRegistrationId();
        await this.store.put('registrationId', registrationId);

        identityKeyPair = await KeyHelper.generateIdentityKeyPair();
        await this.store.put('identityKey', identityKeyPair);

        const preKeyId = 1;
        const preKey = await KeyHelper.generatePreKey(preKeyId);
        await this.store.storePreKey(preKeyId, preKey);

        const signedPreKeyId = 1;
        const signedPreKey = await KeyHelper.generateSignedPreKey(identityKeyPair, signedPreKeyId);
        await this.store.storeSignedPreKey(signedPreKeyId, signedPreKey);

        return {
            registrationId,
            identityKey: bufferToBase64(identityKeyPair.pubKey),
            preKey: {
                keyId: preKey.keyId,
                publicKey: bufferToBase64(preKey.keyPair.pubKey)
            },
            signedPreKey: {
                keyId: signedPreKey.keyId,
                publicKey: bufferToBase64(signedPreKey.keyPair.pubKey),
                signature: bufferToBase64(signedPreKey.signature)
            }
        };
    }

    /**
     * Step 2: Build a session with someone.
     * When User A wants to talk to User B, they get User B's public keys from the server
     * and use this function to establish an encrypted session line.
     */
    async buildSession(remoteUserId, remoteUserBundle) {
        const address = new SignalProtocolAddress(remoteUserId, 1);
        const sessionBuilder = new SessionBuilder(this.store, address);

        console.log('REMOTE BUNDLE', JSON.stringify(remoteUserBundle, null, 2)); await sessionBuilder.processPreKey({
            registrationId: remoteUserBundle.registrationId,
            identityKey: base64ToBuffer(remoteUserBundle.identityKey),
            preKey: {
                keyId: remoteUserBundle.preKey.keyId,
                publicKey: base64ToBuffer(remoteUserBundle.preKey.publicKey)
            },
            signedPreKey: {
                keyId: remoteUserBundle.signedPreKey.keyId,
                publicKey: base64ToBuffer(remoteUserBundle.signedPreKey.publicKey),
                signature: base64ToBuffer(remoteUserBundle.signedPreKey.signature)  
            }
        });
    }

    /**
     * Step 3: Encrypt a message
     */
    async encryptMessage(remoteUserId, message) {
        const address = new SignalProtocolAddress(remoteUserId, 1);
        const sessionCipher = new SessionCipher(this.store, address);

        // Encode our string to a buffer
        const enc = new TextEncoder();
        const buffer = enc.encode(message);

        const ciphertext = await sessionCipher.encrypt(buffer.buffer);
        // Ciphertext often comes out as JSON-friendly, but we must protect body chunks
        return {
            type: ciphertext.type,
            body: ciphertext.body,
            registrationId: ciphertext.registrationId
        };
    }

    /**
     * Step 4: Decrypt an incoming message
     */
    async decryptMessage(remoteUserId, ciphertextMsg) {
        const address = new SignalProtocolAddress(remoteUserId, 1);
        const sessionCipher = new SessionCipher(this.store, address);

        let plaintextBuffer;

        // Signal has two types of messages: PreKeyWireMessage (used to start a session) and WireMessage (normal message)
        if (ciphertextMsg.type === 3) { // PreKeyWireMessage
            plaintextBuffer = await sessionCipher.decryptPreKeyWhisperMessage(ciphertextMsg.body, 'binary');
        } else if (ciphertextMsg.type === 1) { // WireMessage
            plaintextBuffer = await sessionCipher.decryptWhisperMessage(ciphertextMsg.body, 'binary');
        }

        // Decode buffer back to string
        const dec = new TextDecoder();
        return dec.decode(new Uint8Array(plaintextBuffer));
    }
}

export const signalManager = new SignalManager();



