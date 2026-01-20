const io = require('../client/node_modules/socket.io-client');
const crypto = require('crypto');

// Config
const API_URL = 'http://localhost:3000';
const ROOM_ID = 1; // Assuming room 1 exists
const DEVICE_ID = crypto.randomUUID();
const TEMP_ID = crypto.randomUUID(); 

console.log('--- Starting Replay Attack Simulation ---');
console.log(`Targeting URL: ${API_URL}`);
console.log(`Using MessageID (temp_id): ${TEMP_ID}`);

// Helper to create a client
const createClient = (name) => {
    const socket = io(API_URL, {
        transports: ['websocket'],
        auth: { token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MTQsInVzZXJuYW1lIjoiQGpvaG4iLCJkaXNwbGF5X25hbWUiOiJKb2huIiwiaWF0IjoxNzY1MzA0NjE5fQ.cF4wOLb-_34aNbfNwOHFo5ZcJ-PR4kUIe2oZIxQM48k' } 
    });
    
    socket.on('connect', () => {
        console.log(`[${name}] Connected: ${socket.id}`);
        socket.emit('join_room', ROOM_ID);
    });

    socket.on('connect_error', (err) => {
        console.error(`[${name}] Connection Error:`, err.message);
    });

    return socket;
};

// 1. Setup Attacker
// Note: In a real scenario we need valid auth. 
// For this test, assume we have a valid way to send or the server allows it (dev mode).
// If auth fails, we'll see connection errors.
const attacker = createClient('Attacker');
const victim = createClient('Victim');

victim.on('new_message', (msg) => {
    console.log(`[Victim] RECEIVED MESSAGE: ${msg.temp_id}`);
    if (msg.temp_id === TEMP_ID) {
        console.log(`[Victim] -> Received Target Message!`);
    }
});

// Payload
const payload = {
    roomId: ROOM_ID,
    content: 'REPLAY_TEST_PAYLOAD',
    tempId: TEMP_ID,
    senderDeviceId: DEVICE_ID,
    ciphertext: 'encrypted_content_mock',
    iv: 'iv_mock',
    keyVersion: 1,
    signatureVersion: 1
    // ... other fields optional depending on server validation
};

// Execute Attack
setTimeout(() => {
    console.log('[Attacker] Sending Message #1 (Legitimate)...');
    attacker.emit('send_message', payload);

    setTimeout(() => {
        console.log('[Attacker] Sending Message #2 (REPLAY ATTACK)...');
        attacker.emit('send_message', payload); // EXACT SAME PAYLOAD
    }, 2000);

}, 2000);

// Cleanup
setTimeout(() => {
    console.log('--- Test Complete ---');
    attacker.disconnect();
    victim.disconnect();
    process.exit(0);
}, 6000);
