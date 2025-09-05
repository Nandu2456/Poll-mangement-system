// src/App.js
import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

const SOCKET_URL = "https://poll-backend-service.onrender.com";

const socket = io(SOCKET_URL, {
  transports: ["websocket", "polling"], // prefer websocket, fallback to polling
  withCredentials: true, // required for CORS with credentials
});


function App() {
  // ---------- Core state ----------
  const [role, setRole] = useState(null); // "teacher" | "student" | null
  const [studentName, setStudentName] = useState("");
  const [poll, setPoll] = useState(null);
  const [responses, setResponses] = useState({});
  const [questions, setQuestions] = useState([{ questionText: "", options: ["", ""], correctAnswer: "" }]);
  const [timeLimit, setTimeLimit] = useState(30);
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [timer, setTimer] = useState(0);
  const [finalPollResults, setFinalPollResults] = useState(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  // chat & interaction panel
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [showInteractionPanel, setShowInteractionPanel] = useState(false);
  const [activeTab, setActiveTab] = useState("chat"); // "chat" or "participants"
  const chatContainerRef = useRef(null);
  const pollRef = useRef(poll);

  // keep pollRef up to date for pollEnded rendering
  useEffect(() => {
    pollRef.current = poll;
  }, [poll]);

  // ---------- Socket listeners (single effect) ----------
  useEffect(() => {
    // connected
    socket.on("connect", () => {
      console.log("🔌 connected to server", socket.id);
    });

    // poll created
    socket.on("pollCreated", (pollData) => {
      setPoll(pollData);
      setResponses({});
      setSelectedAnswers({});
      setTimer(Number(pollData.timeLimit) || 0);
      setFinalPollResults(null);
      setHasSubmitted(false);
    });

    // answers update
    socket.on("answerUpdate", (res) => {
      setResponses(res || {});
    });

    // poll ended
    socket.on("pollEnded", (finalResponses) => {
      setFinalPollResults({ pollData: pollRef.current, responses: finalResponses });
      setPoll(null);
      setResponses(finalResponses || {});
      setTimer(0);
      alert("⏰ Poll ended!");
    });

    // chat message in
    socket.on("chatMessage", (msg) => {
      setMessages((prev) => [...prev, msg]);
    });

    // chat history
    socket.on("chatHistory", (history) => {
      setMessages(history || []);
    });

    // teacher removed this student
    socket.on("studentRemoved", (msg) => {
      // show alert and reset UI to login
      alert(msg || "You were removed by the teacher");
      resetToLogin();
    });

    return () => {
      socket.off("connect");
      socket.off("pollCreated");
      socket.off("answerUpdate");
      socket.off("pollEnded");
      socket.off("chatMessage");
      socket.off("chatHistory");
      socket.off("studentRemoved");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Helpers ----------
  function resetToLogin() {
    setRole(null);
    setStudentName("");
    setPoll(null);
    setResponses({});
    setSelectedAnswers({});
    setFinalPollResults(null);
    setHasSubmitted(false);
    setMessages([]);
    setTimer(0);
  }

  // register student on server when they login
  const handleStudentLogin = () => {
    if (!studentName.trim()) {
      alert("Please enter your name before continuing.");
      return;
    }
    socket.emit("registerStudent", studentName.trim());
    setRole("student");
  };

  // teacher login button (sets name to Teacher)
  const handleTeacherLogin = () => {
    setStudentName("Teacher");
    setRole("teacher");
  };

  // ---------- Poll creation / teacher actions ----------
  const addQuestion = () => {
    setQuestions([...questions, { questionText: "", options: ["", ""], correctAnswer: "" }]);
  };

  const addOption = (qIndex) => {
    const newQuestions = [...questions];
    newQuestions[qIndex].options.push("");
    setQuestions(newQuestions);
  };

  const handleQuestionChange = (qIndex, field, value) => {
    const newQuestions = [...questions];
    if (field === "questionText") newQuestions[qIndex].questionText = value;
    else if (field === "correctAnswer") newQuestions[qIndex].correctAnswer = value;
    else if (field.startsWith("option")) {
      const oIndex = parseInt(field.split("-")[1], 10);
      newQuestions[qIndex].options[oIndex] = value;
    }
    setQuestions(newQuestions);
  };

  const createPoll = () => {
    const pollData = {
      questions: questions.map((q) => ({ ...q, options: q.options.filter((o) => o.trim() !== "") })),
      timeLimit: Number(timeLimit) || 30,
    };
    socket.emit("createPoll", pollData);
    setMessages([]);
    setPoll(pollData);
    setTimer(Number(pollData.timeLimit) || 30);
  };

  const endPoll = () => {
    socket.emit("endPoll");
  };

  // teacher removes a student
  const kickStudent = (name) => {
    if (!window.confirm(`Kick out ${name}?`)) return;
    socket.emit("removeStudent", name);
  };

  // ---------- Student answers ----------
  const handleStudentAnswerChange = (qIndex, value) => {
    setSelectedAnswers({
      ...selectedAnswers,
      [qIndex]: value,
    });
  };

  const submitAnswers = () => {
    if (!studentName || studentName.trim() === "") {
      alert("Please enter your name before submitting.");
      return;
    }
    socket.emit("submitAnswers", { name: studentName.trim(), answers: selectedAnswers });
    setHasSubmitted(true);
  };

  // ---------- Chat ----------
  const sendMessage = () => {
    if (!newMessage.trim() || !studentName.trim()) return;
    const msgObj = { name: studentName.trim(), message: newMessage.trim(), timestamp: Date.now() };
    socket.emit("chatMessage", msgObj);
    setNewMessage("");
    // local echo will arrive via socket 'chatMessage' too (server emits it to all)
  };

  // autoscroll when messages change
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  // ---------- TIMER ----------
  useEffect(() => {
    let interval;
    if (poll && timer > 0) {
      interval = setInterval(() => setTimer((t) => t - 1), 1000);
    } else if (poll && timer === 0) {
      socket.emit("endPoll");
    }
    return () => clearInterval(interval);
  }, [poll, timer]);

  // ---------- Results rendering ----------
  const renderPollResults = (pollDataProp = null, responsesDataProp = null) => {
    const pollData = pollDataProp || poll || (finalPollResults ? finalPollResults.pollData : null);
    const responsesData = responsesDataProp || (poll ? responses : (finalPollResults ? finalPollResults.responses : {}));

    if (!pollData || !pollData.questions) return <p>No poll.</p>;
    if (!responsesData || Object.keys(responsesData).length === 0) return <p>No responses yet.</p>;

    const allStudentAnswers = Object.values(responsesData).map((studentAnswers) =>
      Array.isArray(studentAnswers) ? studentAnswers : Object.values(studentAnswers)
    );

    return (
      <div>
        {pollData.questions.map((q, qIndex) => {
          const questionResponses = allStudentAnswers.map((answers) => answers[qIndex]).filter(Boolean);
          const totalQuestionResponses = questionResponses.length;
          const counts = {};
          questionResponses.forEach((a) => (counts[a] = (counts[a] || 0) + 1));

          return (
            <div key={qIndex} style={{ border: "1px solid #ddd", padding: 12, margin: "16px 0", borderRadius: 8 }}>
              <h4 style={{ margin: "0 0 8px 0" }}>
                Q{qIndex + 1}: {q.questionText}
              </h4>
              {q.options.map((option, oIndex) => {
                const count = counts[option] || 0;
                const percentage = totalQuestionResponses > 0 ? Math.round((count / totalQuestionResponses) * 100) : 0;
                const isCorrect = q.correctAnswer === option;
                const barColor = isCorrect ? "#4caf50" : "#6f42c1";
                return (
                  <div key={oIndex} style={{ marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        {option} {isCorrect && <span style={{ color: "#4caf50" }}>✅</span>}
                      </div>
                      <div>{percentage}%</div>
                    </div>
                    <div style={{ background: "#eee", height: 12, borderRadius: 6, marginTop: 6 }}>
                      <div style={{ width: `${percentage}%`, height: "100%", borderRadius: 6, background: barColor }} />
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  };

  // ---------- Interaction Panel component (Chat + Participants) ----------
  const InteractionPanel = () => {
    const participantNames = Object.keys(responses || {});

    return (
      <div>
        {!showInteractionPanel && (
          <button
            onClick={() => setShowInteractionPanel(true)}
            style={{
              position: "fixed",
              bottom: 20,
              right: 20,
              padding: "12px 16px",
              borderRadius: 50,
              border: "none",
              background: "#6f42c1",
              color: "white",
              cursor: "pointer",
              boxShadow: "0 6px 20px rgba(0,0,0,0.12)",
            }}
            aria-label="Open Interaction Panel"
            title="Open Interaction Panel"
          >
            💬
          </button>
        )}

        {showInteractionPanel && (
          <div
            style={{
              position: "fixed",
              bottom: 20,
              right: 20,
              width: 360,
              height: 480,
              background: "#fff",
              borderRadius: 10,
              boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              zIndex: 1000,
            }}
          >
            {/* header with tabs */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: "#f7f7fb" }}>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => setActiveTab("chat")}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "none",
                    background: activeTab === "chat" ? "#fff" : "transparent",
                    fontWeight: activeTab === "chat" ? 700 : 500,
                    cursor: "pointer",
                  }}
                >
                  Chat
                </button>

                <button
                  onClick={() => setActiveTab("participants")}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "none",
                    background: activeTab === "participants" ? "#fff" : "transparent",
                    fontWeight: activeTab === "participants" ? 700 : 500,
                    cursor: "pointer",
                  }}
                >
                  Participants
                </button>
              </div>

              <button
                onClick={() => setShowInteractionPanel(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: 20,
                  cursor: "pointer",
                  color: "#666",
                }}
                aria-label="Close panel"
              >
                ×
              </button>
            </div>

            {/* body */}
            <div style={{ flex: 1, padding: 12, overflowY: "auto" }}>
              {activeTab === "chat" ? (
                <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                  <div ref={chatContainerRef} style={{ flex: 1, overflowY: "auto", padding: 8, borderRadius: 6, background: "#fbfbfd", border: "1px solid #eee" }}>
                    {messages.length === 0 ? (
                      <div style={{ textAlign: "center", color: "#888", paddingTop: 16 }}>No messages yet</div>
                    ) : (
                      messages.map((m, i) => (
                        <div key={i} style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{m.name}</div>
                          <div style={{ fontSize: 14 }}>{m.message}</div>
                          <div style={{ fontSize: 11, color: "#999" }}>{m.timestamp ? new Date(m.timestamp).toLocaleTimeString() : ""}</div>
                        </div>
                      ))
                    )}
                  </div>

                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <input
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") sendMessage(); }}
                      placeholder="Type a message..."
                      style={{ flex: 1, padding: "10px", borderRadius: 8, border: "1px solid #ddd" }}
                    />
                    <button onClick={sendMessage} style={{ padding: "10px 12px", borderRadius: 8, background: "#28a745", color: "white", border: "none", cursor: "pointer" }}>
                      Send
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  {participantNames.length === 0 ? (
                    <div style={{ textAlign: "center", color: "#777" }}>No participants yet</div>
                  ) : (
                    participantNames.map((name) => (
                      <div key={name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 8px", borderBottom: "1px solid #f0f0f0" }}>
                        <div style={{ fontWeight: 600 }}>{name}</div>
                        {role === "teacher" ? (
                          <button onClick={() => kickStudent(name)} style={{ color: "#e55353", border: "none", background: "transparent", cursor: "pointer" }}>
                            Kick out
                          </button>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  // ---------- UI layout ----------
  return (
    <div style={{ padding: 20, fontFamily: "Inter, Arial, sans-serif", maxWidth: 1200, margin: "0 auto" }}>
      <h1 style={{ textAlign: "center", color: "#222" }}>Live Poll System</h1>

      {/* LOGIN */}
      {!role && (
        <div style={{ textAlign: "center", marginTop: 40 }}>
          <h2 style={{ marginBottom: 12 }}>Login</h2>

          <input
            type="text"
            placeholder="Enter your name (unique per tab)"
            value={studentName}
            onChange={(e) => setStudentName(e.target.value)}
            style={{ padding: 10, width: "60%", maxWidth: 420, marginBottom: 12, borderRadius: 8, border: "1px solid #ddd" }}
          />

          <div style={{ marginTop: 10 }}>
            <button onClick={handleTeacherLogin} style={{ padding: "10px 18px", marginRight: 8, backgroundColor: "#007bff", color: "white", border: "none", borderRadius: 8, cursor: "pointer" }}>
              I am a Teacher
            </button>

            <button onClick={handleStudentLogin} style={{ padding: "10px 18px", backgroundColor: "#28a745", color: "white", border: "none", borderRadius: 8, cursor: "pointer" }}>
              I am a Student
            </button>
          </div>
        </div>
      )}

      {/* TEACHER VIEW */}
      {role === "teacher" && (
        <div style={{ display: "flex", gap: 20, marginTop: 20 }}>
          <div style={{ flex: 2 }}>
            <h2 style={{ color: "#007bff" }}>Teacher Panel</h2>

            <div style={{ border: "1px solid #eee", padding: 16, borderRadius: 8, background: "#fff" }}>
              <h3>Create a New Poll</h3>

              {questions.map((q, qIndex) => (
                <div key={qIndex} style={{ border: "1px solid #f0f0f0", padding: 12, margin: "12px 0", borderRadius: 8, background: "#fafafa" }}>
                  <input
                    type="text"
                    placeholder={`Enter Question ${qIndex + 1}`}
                    value={q.questionText}
                    onChange={(e) => handleQuestionChange(qIndex, "questionText", e.target.value)}
                    style={{ width: "100%", padding: 8, marginBottom: 8, borderRadius: 8, border: "1px solid #ddd" }}
                  />
                  {q.options.map((opt, oIndex) => (
                    <div key={oIndex} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                      <input
                        type="text"
                        placeholder={`Option ${oIndex + 1}`}
                        value={opt}
                        onChange={(e) => handleQuestionChange(qIndex, `option-${oIndex}`, e.target.value)}
                        style={{ flex: 1, padding: 8, borderRadius: 8, border: "1px solid #ddd" }}
                      />
                      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <input
                          type="radio"
                          name={`correctAnswer-${qIndex}`}
                          value={opt}
                          checked={q.correctAnswer === opt}
                          onChange={(e) => handleQuestionChange(qIndex, "correctAnswer", e.target.value)}
                        />
                        Correct
                      </label>
                    </div>
                  ))}

                  <button onClick={() => addOption(qIndex)} style={{ padding: "8px 10px", borderRadius: 8, cursor: "pointer" }}>
                    + Add Option
                  </button>
                </div>
              ))}

              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button onClick={addQuestion} style={{ padding: "8px 12px", borderRadius: 8, cursor: "pointer" }}>
                  + Add New Question
                </button>

                <input type="number" min={5} value={timeLimit} onChange={(e) => setTimeLimit(Number(e.target.value))} style={{ padding: 8, width: 140, borderRadius: 8, border: "1px solid #ddd" }} />

                <button onClick={createPoll} style={{ padding: "8px 12px", borderRadius: 8, background: "#007bff", color: "white", border: "none", cursor: "pointer" }}>
                  Create Poll
                </button>

                {poll && (
                  <button onClick={endPoll} style={{ padding: "8px 12px", borderRadius: 8, background: "#e55353", color: "white", border: "none", cursor: "pointer" }}>
                    End Poll
                  </button>
                )}
              </div>
            </div>

            {/* live results */}
            {poll && (
              <div style={{ marginTop: 20 }}>
                <h3 style={{ color: "#007bff" }}>Live Poll Results</h3>
                {renderPollResults()}
              </div>
            )}

            {finalPollResults && (
              <div style={{ marginTop: 20 }}>
                <h3>Final Results</h3>
                {renderPollResults(finalPollResults.pollData, finalPollResults.responses)}
              </div>
            )}
          </div>

          {/* Right: compact participants list (teacher) */}
          <div style={{ flex: 1, border: "1px solid #eee", padding: 16, borderRadius: 8, background: "#fff", height: "fit-content" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0 }}>Participants</h3>
              <button onClick={() => setShowInteractionPanel(true)} style={{ background: "transparent", border: "none", color: "#6f42c1", cursor: "pointer" }}>
                Open
              </button>
            </div>

            <div style={{ marginTop: 12 }}>
              {Object.keys(responses).length === 0 ? (
                <div style={{ color: "#777" }}>No participants yet.</div>
              ) : (
                Object.entries(responses).map(([name]) => (
                  <div key={name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f5f5f5" }}>
                    <div style={{ fontWeight: 600 }}>{name}</div>
                    <button onClick={() => kickStudent(name)} style={{ padding: "6px 10px", background: "#e55353", color: "white", border: "none", borderRadius: 6, cursor: "pointer" }}>
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Interaction panel toggle */}
          <InteractionPanel />
        </div>
      )}

      {/* STUDENT VIEW */}
      {role === "student" && (
        <div style={{ display: "flex", gap: 20, marginTop: 20 }}>
          <div style={{ flex: 2 }}>
            <h2 style={{ color: "#28a745" }}>Student Panel</h2>

            {poll ? (
              <div>
                <h3>Time Left: {timer}s</h3>
                {poll.questions.map((q, qIndex) => (
                  <div key={qIndex} style={{ border: "1px solid #eee", padding: 12, marginBottom: 12, borderRadius: 8, background: "#fafafa" }}>
                    <h4 style={{ marginTop: 0 }}>{q.questionText}</h4>
                    {q.options.map((opt, oIndex) => (
                      <div key={oIndex} style={{ marginBottom: 8 }}>
                        <label>
                          <input type="radio" name={`q-${qIndex}`} value={opt} checked={selectedAnswers[qIndex] === opt} onChange={() => handleStudentAnswerChange(qIndex, opt)} /> {opt}
                        </label>
                      </div>
                    ))}
                  </div>
                ))}

                {!hasSubmitted ? (
                  <button onClick={submitAnswers} style={{ padding: "10px 14px", borderRadius: 8, background: "#28a745", color: "white", border: "none", cursor: "pointer" }}>
                    Submit Answers
                  </button>
                ) : (
                  <p>✅ You have submitted your answers!</p>
                )}
              </div>
            ) : (
              <p>No active poll currently.</p>
            )}

            {finalPollResults && (
              <div style={{ marginTop: 20 }}>
                <h3>Poll Results</h3>
                {renderPollResults(finalPollResults.pollData, finalPollResults.responses)}
              </div>
            )}
          </div>

          {/* Right: participants (students only see names) */}
          <div style={{ flex: 1, border: "1px solid #eee", padding: 16, borderRadius: 8, background: "#fff" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0 }}>Participants</h3>
              <button onClick={() => setShowInteractionPanel(true)} style={{ background: "transparent", border: "none", color: "#6f42c1", cursor: "pointer" }}>
                Open
              </button>
            </div>

            <div style={{ marginTop: 12 }}>
              {Object.keys(responses).length === 0 ? (
                <div style={{ color: "#777" }}>No participants yet.</div>
              ) : (
                Object.keys(responses).map((name) => (
                  <div key={name} style={{ padding: "8px 0", borderBottom: "1px solid #f5f5f5" }}>
                    <div style={{ fontWeight: 600 }}>{name}</div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Interaction Panel */}
          <InteractionPanel />
        </div>
      )}

      {/* always keep the interaction panel component mounted */}
      <InteractionPanel />
    </div>
  );
}

export default App;
