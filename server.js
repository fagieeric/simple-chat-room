const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingTimeout: 60000,   // Keeps connections alive on mobile
  pingInterval: 25000
});

app.use(express.static(path.join(__dirname, 'public')));

// Store room details: { roomName: { password: "xxx", messages: [], users: {} } }
const rooms = {};
const MESSAGE_TTL = 60 * 1000; 

function updateRoomUsers(room) {
  if (!rooms[room]) return;
  const onlineUsers = Object.values(rooms[room].users);
  io.to(room).emit('room-users-update', {
    count: onlineUsers.length,
    users: onlineUsers
  });
}

io.on('connection', (socket) => {
  let currentRoom = null;
  let currentUser = null;

  socket.on('join-room', ({ room = 'Alpha', password, codename }, callback) => {
    if (!codename || !password) {
      return callback({ success: false, message: 'Name and password required!' });
    }

    if (!rooms[room]) {
      rooms[room] = { password: password, messages: [], users: {} };
    }

    if (rooms[room].password !== password) {
      return callback({ success: false, message: 'Incorrect room password!' });
    }

    socket.join(room);
    currentRoom = room;
    currentUser = codename;

    // Add user to online list
    rooms[room].users[socket.id] = codename;

    callback({ success: true, room });

    io.to(room).emit('system-message', `✨ ${codename} joined ${room}`);
    updateRoomUsers(room);
  });

  socket.on('send-message', (msgData) => {
    if (!currentRoom || !currentUser) return;

    const message = {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 5),
      sender: currentUser,
      type: msgData.type,
      content: msgData.content,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    if (rooms[currentRoom]) {
      rooms[currentRoom].messages.push(message);
    }

    io.to(currentRoom).emit('receive-message', message);

    // Auto-delete message after TTL
    setTimeout(() => {
      if (rooms[currentRoom]) {
        rooms[currentRoom].messages = rooms[currentRoom].messages.filter(m => m.id !== message.id);
      }
      io.to(currentRoom).emit('message-deleted', message.id);
    }, MESSAGE_TTL);
  });

  socket.on('delete-message', (msgId) => {
    if (!currentRoom) return;
    if (rooms[currentRoom]) {
      rooms[currentRoom].messages = rooms[currentRoom].messages.filter(m => m.id !== msgId);
    }
    io.to(currentRoom).emit('message-deleted', msgId);
  });

  socket.on('clear-chat', () => {
    if (!currentRoom) return;
    if (rooms[currentRoom]) {
      rooms[currentRoom].messages = [];
    }
    io.to(currentRoom).emit('chat-cleared');
  });

  socket.on('disconnect', () => {
    if (currentRoom && rooms[currentRoom] && rooms[currentRoom].users[socket.id]) {
      delete rooms[currentRoom].users[socket.id];
      io.to(currentRoom).emit('system-message', `${currentUser} left the chat.`);
      updateRoomUsers(currentRoom);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));