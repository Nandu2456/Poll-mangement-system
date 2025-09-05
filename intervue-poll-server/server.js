// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();

// Replace with your deployed frontend URL
const FRONTEND_URL = "https://poll-frontend-70fs.onrender.com";

// Enable CORS for your frontend only
app.use(cors({
  origin: FRONTEND_URL,
  methods: ["GET", "POST"],
  credentials: true
}));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: FRONTEND_URL,
    methods: ["GET", "POST"],
    credentials: true
  }
});

let currentPoll = null;
let responses = {};
let chatMessages = [];
let studentSockets = {}; // { name -> socket.id }

io.on("connection", (socket) => {
  console.log("🟢 Connected:", socket.id);

  // Send initial state
  if (currentPoll) {
    socket.emit("pollCreated", currentPoll);
    socket.emit("answerUpdate", responses);
  }
  socket.emit("chatHistory", chatMessages);

  // Teacher creates a poll
  socket.on("createPoll", (pollData) => {
    currentPoll = {
      ...pollData,
      students: Object.keys(studentSockets),
    };
    responses = {};
    io.emit("pollCreated", currentPoll);
    io.emit("answerUpdate", responses);
  });

  // Student submits answers
  socket.on("submitAnswers", ({ name, answers }) => {
    responses[name] = answers;
    io.emit("answerUpdate", responses);
  });

  // Teacher ends poll
  socket.on("endPoll", () => {
    io.emit("pollEnded", responses);
    currentPoll = null;
    responses = {};
  });

  // Chat
  socket.on("chatMessage", (msg) => {
    chatMessages.push({ ...msg, timestamp: Date.now() });
    io.emit("chatMessage", msg);
  });

  // Student registers
  socket.on("registerStudent", (name) => {
    studentSockets[name] = socket.id;
    console.log(`👤 Registered: ${name} (${socket.id})`);

    if (currentPoll) {
      currentPoll.students = Object.keys(studentSockets);
      io.emit("pollCreated", currentPoll);
    }
  });

  // Teacher removes student
  socket.on("removeStudent", (studentName) => {
    console.log(`🚫 Teacher removed: ${studentName}`);
    delete responses[studentName];

    const studentSocketId = studentSockets[studentName];
    if (studentSocketId) {
      io.to(studentSocketId).emit(
        "studentRemoved",
        "You were removed by the teacher"
      );
      delete studentSockets[studentName];
    }

    if (currentPoll) {
      currentPoll.students = Object.keys(studentSockets);
      io.emit("pollCreated", currentPoll);
    }

    io.emit("answerUpdate", responses);
  });

  // Disconnect
  socket.on("disconnect", () => {
    console.log("🔴 Disconnected:", socket.id);
    const studentName = Object.keys(studentSockets).find(
      (n) => studentSockets[n] === socket.id
    );
    if (studentName) delete studentSockets[studentName];
  });
});

// Dynamic port for Render deployment
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`✅ Server running at port ${PORT}`));
