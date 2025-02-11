const express = require('express');
const { createServer } = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, '../public')));

// Create HTTP server
const server = createServer(app);

// Create WebSocket server
const wss = new WebSocketServer({ 
  server,
  path: '/chat' // Use specific path to avoid conflicts
});

// WebSocket connection handling
wss.on('connection', (ws) => {
  console.log('Client connected to WebSocket server');

  // Send welcome message
  ws.send(JSON.stringify({
    type: 'system',
    message: 'Connected to chat server'
  }));

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log('Received message:', message);

      // Broadcast message to all clients
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: 'message',
            content: message.content,
            timestamp: new Date().toISOString()
          }));
        }
      });
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected from WebSocket server');
  });
});

// Start server
server.listen(port, '0.0.0.0', () => {
  console.log(`Server running on port ${port}`);
});
