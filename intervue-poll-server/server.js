// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

let currentPoll = null;
let responses = {};
let chatMessages = [];
let studentSockets = {}; // { name -> socket.id }

io.on("connection", (socket) => {
  console.log("🟢 Connected:", socket.id);

  // send initial state
  if (currentPoll) {
    socket.emit("pollCreated", currentPoll);
    socket.emit("answerUpdate", responses);
  }
  socket.emit("chatHistory", chatMessages);

  // Teacher creates a poll
  socket.on("createPoll", (pollData) => {
    currentPoll = {
      ...pollData,
      students: Object.keys(studentSockets), // attach student list
    };
    responses = {}; // reset
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

    // update poll with new student if poll active
    if (currentPoll) {
      currentPoll.students = Object.keys(studentSockets);
      io.emit("pollCreated", currentPoll);
    }
  });

  // Teacher removes student
  socket.on("removeStudent", (studentName) => {
    console.log(`🚫 Teacher removed: ${studentName}`);
    delete responses[studentName];
    io.emit("answerUpdate", responses);

    const studentSocketId = studentSockets[studentName];
    if (studentSocketId) {
      io.to(studentSocketId).emit("studentRemoved", "You were removed by the teacher");
      delete studentSockets[studentName];
    }

    if (currentPoll) {
      currentPoll.students = Object.keys(studentSockets);
      io.emit("pollCreated", currentPoll);
    }
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

server.listen(4000, () => console.log("✅ Server running at http://localhost:4000"));
