import express from "express";
import { createServer } from "http";
import { Server as SocketIOServer } from 'socket.io';
import { db } from "@db";
import path from "path";
import cors from "cors";

const app = express();
const port = process.env.PORT || 4000; // Use different port than Vite

// Enable CORS for all routes
app.use(cors());

// Parse JSON bodies
app.use(express.json());

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, '../public')));

// Create HTTP server
const server = createServer(app);

// Create Socket.IO server with CORS configuration
const io = new SocketIOServer(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  },
  path: '/ws'
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected to WebSocket server');

  socket.on('message', (data) => {
    console.log('Received:', data);

    // Broadcast to all connected clients
    io.emit('message', data);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

// Start server
server.listen(port, '0.0.0.0', () => {
  console.log(`WebSocket server running on port ${port}`);
});