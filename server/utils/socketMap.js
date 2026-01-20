/**
 * User Device Socket Mapping
 * Structure: Map<UserId, Map<DeviceId, SocketId>>
 */
const userDevices = new Map();

/**
 * Registers a device and its socket for a user.
 */
function registerDevice(userId, deviceId, socketId) {
    const uId = String(userId);
    if (!userDevices.has(uId)) {
        userDevices.set(uId, new Map());
    }
    userDevices.get(uId).set(deviceId, socketId);
    console.log(`[SocketMap] Registered User:${uId} Device:${deviceId} Socket:${socketId}`);
}

/**
 * Removes a socket connection.
 */
function unregisterSocket(userId, socketId) {
    const uId = String(userId);
    const devices = userDevices.get(uId);
    if (!devices) return;

    for (const [deviceId, sId] of devices.entries()) {
        if (sId === socketId) {
            devices.delete(deviceId);
            console.log(`[SocketMap] Unregistered User:${uId} Device:${deviceId}`);
            break;
        }
    }

    if (devices.size === 0) {
        userDevices.delete(uId);
    }
}

/**
 * Gets the socket ID for a specific device of a user.
 */
function getSocketId(userId, deviceId) {
    return userDevices.get(String(userId))?.get(deviceId);
}

/**
 * Gets all active device IDs for a user except the sender.
 */
function getOtherDevices(userId, excludeDeviceId) {
    const uId = String(userId);
    const devices = userDevices.get(uId);
    if (!devices) {
        console.log(`[SocketMap] getOtherDevices: No devices found for user ${uId}`);
        return [];
    }
    
    const result = Array.from(devices.keys())
        .filter(dId => dId !== excludeDeviceId)
        .map(dId => ({ deviceId: dId, socketId: devices.get(dId) }));
    
    console.log(`[SocketMap] getOtherDevices for user ${uId} (excluding ${excludeDeviceId}): Found ${result.length} devices.`);
    return result;
}

module.exports = {
    registerDevice,
    unregisterSocket,
    getSocketId,
    getOtherDevices
};
