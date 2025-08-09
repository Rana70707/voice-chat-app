const express = require('express');
const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server);
const { v4: uuidV4 } = require('uuid');
const { ExpressPeerServer } = require('peer');

app.use(express.static('public'));
app.use(express.json());

// إعداد خادم WebRTC
const peerServer = ExpressPeerServer(server, {
    debug: true,
    path: '/myapp'
});

app.use('/peerjs', peerServer);

// إضافة تتبع للأخطاء
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).send('حدث خطأ في الخادم');
});

// التأكد من تحميل الصفحة الرئيسية
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

const rooms = new Map();

io.on('connection', socket => {
    socket.on('join-room', (roomId, userId, userName) => {
        if (!rooms.has(roomId)) {
            rooms.set(roomId, new Set());
        }
        
        if (rooms.get(roomId).size >= 4) {
            socket.emit('room-full');
            return;
        }

        socket.join(roomId);
        rooms.get(roomId).add(userId);
        
        socket.to(roomId).emit('user-connected', userId, userName);
        
        io.to(roomId).emit('participant-count', rooms.get(roomId).size);

        socket.on('disconnect', () => {
            rooms.get(roomId)?.delete(userId);
            socket.to(roomId).emit('user-disconnected', userId);
            if (rooms.get(roomId)?.size === 0) {
                rooms.delete(roomId);
            } else {
                io.to(roomId).emit('participant-count', rooms.get(roomId).size);
            }
        });
    });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} in your browser`);
});
