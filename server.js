const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Force WebSockets and enable CORS for multi-user stability
const io = new Server(server, {
    maxHttpBufferSize: 1e7, // 10MB limit
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    transports: ['websocket', 'polling']
});

const ROOM_PASSWORD = "love"; 

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    console.log(`New user connecting: ${socket.id}`);

    socket.on('join-room', ({ codename, password }, callback) => {
        if (password !== ROOM_PASSWORD) {
            return callback({ success: false, message: 'Incorrect Room Password!' });
        }
        
        socket.codename = codename;
        callback({ success: true });

        // Notify room user joined
        io.emit('system-message', `${codename} joined the chat ✨`);
    });

    socket.on('send-message', (data) => {
        if (!socket.codename) return;
        
        const messageData = {
            id: 'msg-' + Date.now(),
            sender: socket.codename,
            type: data.type,
            content: data.content,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        io.emit('receive-message', messageData);
    });

    socket.on('delete-message', (msgId) => {
        io.emit('message-deleted', msgId);
    });

    socket.on('clear-chat', () => {
        io.emit('chat-cleared');
    });

    socket.on('disconnect', () => {
        if (socket.codename) {
            io.emit('system-message', `${socket.codename} left the chat.`);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server live on http://localhost:${PORT}`);
});