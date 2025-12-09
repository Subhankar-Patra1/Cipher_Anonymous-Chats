
// Need to read token from args or file, hardcoding for now or reading file
import { io } from "socket.io-client";
import fs from 'fs';

const token = fs.readFileSync('../server/token.txt', 'utf8').trim();

console.log('Connecting with token:', token.substring(0, 10) + '...');

const socket = io("http://localhost:3000", {
  auth: {
    token: token
  }
});

socket.on("connect", () => {
  console.log("Connected! ID:", socket.id);
  // Send heartbeat
  socket.emit('presence:heartbeat');
});

socket.on("presence:update", (data) => {
  console.log("Presence Update:", data);
});

socket.on("disconnect", () => {
  console.log("Disconnected");
});

socket.on("connect_error", (err) => {
  console.log("Connect Error:", err.message);
});

// Keep alive for 30s
setInterval(() => {
    socket.emit('presence:heartbeat');
}, 5000);

setTimeout(() => {
    console.log("Exiting...");
    process.exit(0);
}, 30000);
