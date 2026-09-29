const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    maxHttpBufferSize: 1e7 // 10MB limit for image/audio uploads
});

app.use(express.static(path.join(__dirname, 'public')));

// Store room data: { roomName: { password: "xxx", messages: [], users: {} } }
const rooms = {};

io.on('connection', (socket) => {

    socket.on('join-room', ({ codename, room, password }, callback) => {
        if (!room || !codename || !password) {
            return callback({ success: false, message: 'Codename, room name, and password are required.' });
        }

        const roomKey = room.toLowerCase();

        if (rooms[roomKey]) {
            if (rooms[roomKey].password !== password) {
                return callback({ success: false, message: 'Incorrect keycode for this room.' });
            }
        } else {
            // Create room if it doesn't exist
            rooms[roomKey] = {
                password: password,
                displayName: room,
                messages: [],
                users: {}
            };
        }

        socket.join(roomKey);
        socket.roomKey = roomKey;
        socket.codename = codename;

        rooms[roomKey].users[socket.id] = codename;

        callback({ success: true, room: rooms[roomKey].displayName });

        // Broadcast updated user count
        const userList = Object.values(rooms[roomKey].users);
        io.to(roomKey).emit('room-users-update', {
            count: userList.length,
            users: userList
        });

        // Send existing room messages to newly joined user
        rooms[roomKey].messages.forEach(msg => {
            socket.emit('receive-message', msg);
        });

        io.to(roomKey).emit('system-message', `<b>${codename}</b> joined the room.`);
    });

    socket.on('send-message', (data) => {
        const roomKey = socket.roomKey;
        if (!roomKey || !rooms[roomKey]) return;

        const msgData = {
            id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            sender: socket.codename,
            type: data.type, // 'text', 'image', 'audio'
            content: data.content,
            replyTo: data.replyTo || null, // Stores quoted parent message
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        rooms[roomKey].messages.push(msgData);

        // Keep last 100 messages in memory per room
        if (rooms[roomKey].messages.length > 100) {
            rooms[roomKey].messages.shift();
        }

        io.to(roomKey).emit('receive-message', msgData);
    });

    socket.on('delete-message', (msgId) => {
        const roomKey = socket.roomKey;
        if (!roomKey || !rooms[roomKey]) return;

        rooms[roomKey].messages = rooms[roomKey].messages.filter(m => m.id !== msgId);
        io.to(roomKey).emit('message-deleted', msgId);
    });

    socket.on('clear-chat', () => {
        const roomKey = socket.roomKey;
        if (!roomKey || !rooms[roomKey]) return;

        rooms[roomKey].messages = [];
        io.to(roomKey).emit('chat-cleared');
    });

    socket.on('disconnect', () => {
        const roomKey = socket.roomKey;
        if (roomKey && rooms[roomKey]) {
            const user = rooms[roomKey].users[socket.id];
            delete rooms[roomKey].users[socket.id];

            const userList = Object.values(rooms[roomKey].users);
            io.to(roomKey).emit('room-users-update', {
                count: userList.length,
                users: userList
            });

            if (user) {
                io.to(roomKey).emit('system-message', `<b>${user}</b> left the room.`);
            }

            // Cleanup empty room memory after 1 hour if inactive
            if (userList.length === 0) {
                setTimeout(() => {
                    if (rooms[roomKey] && Object.keys(rooms[roomKey].users).length === 0) {
                        delete rooms[roomKey];
                    }
                }, 3600000);
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Alpha server running on port ${PORT}`));