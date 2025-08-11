const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server, { cors: { origin: '*'} });
const { v4: uuidV4 } = require('uuid');
const { ExpressPeerServer } = require('peer');
const path = require('path');

// Security & rate-limit basics
const censorHitsWindowMs = 5000; // 5s window
const censorHitsLimit = 10; // max per window per socket
const censorHitTracker = new Map(); // socket.id => {count, ts}

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// PeerJS server
const peerServer = ExpressPeerServer(server, { debug: false, path: '/' });
app.use('/peerjs', peerServer);

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).send('حدث خطأ في الخادم');
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Room structure: roomId => Map(userId => { userName, socketId })
const rooms = new Map();

function getParticipantCount(roomId) {
  return rooms.get(roomId)?.size || 0;
}

io.on('connection', socket => {
  // join room
  socket.on('join-room', (roomId, userId, userName) => {
    if (!roomId || !userId || !userName) return;

    if (!rooms.has(roomId)) rooms.set(roomId, new Map());

    const room = rooms.get(roomId);
    if (room.size >= 4) {
      socket.emit('room-full');
      return;
    }

    room.set(userId, { userName, socketId: socket.id });
    socket.join(roomId);

    socket.to(roomId).emit('user-connected', userId, userName);
    io.to(roomId).emit('participant-count', getParticipantCount(roomId));

    socket.on('censor-hit', () => {
      // Rate limiting
      const now = Date.now();
      const entry = censorHitTracker.get(socket.id) || { count: 0, ts: now };
      if (now - entry.ts > censorHitsWindowMs) {
        entry.count = 0;
        entry.ts = now;
      }
      entry.count += 1;
      censorHitTracker.set(socket.id, entry);
      if (entry.count <= censorHitsLimit) {
        socket.to(roomId).emit('censor-hit');
      }
    });

    socket.on('disconnect', () => {
      const room = rooms.get(roomId);
      if (room) {
        room.delete(userId);
        socket.to(roomId).emit('user-disconnected', userId);
        if (room.size === 0) {
          rooms.delete(roomId);
        } else {
          io.to(roomId).emit('participant-count', getParticipantCount(roomId));
        }
      }
      censorHitTracker.delete(socket.id);
    });
  });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} in your browser`);
});
