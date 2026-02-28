import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../store/auth";
import { makeSocket } from "../lib/socket";

const TOPICS = ["arrays", "strings", "dp", "graphs", "trees"];
const MIN_MINUTES = 1;
const MAX_MINUTES = 120;

function Field({ label, children, hint }) {
  return (
    <div>
      <label className="text-sm text-slate-300">{label}</label>
      <div className="mt-2">{children}</div>
      {hint && <p className="text-xs text-slate-500 mt-2">{hint}</p>}
    </div>
  );
}

export default function CreateRoom() {
  const nav = useNavigate();
  const { token } = useAuth();
  const socketRef = useRef(null);

  const [status, setStatus] = useState("connecting...");
  const [err, setErr] = useState("");

  const [topic, setTopic] = useState("");
  const [questionCount, setQuestionCount] = useState("3");
  const [maxPlayers, setMaxPlayers] = useState("2");
  const [timerMinutes, setTimerMinutes] = useState("10");

  useEffect(() => {
    if (!token) return;

    const socket = makeSocket(token);
    socketRef.current = socket;

    socket.on("connect", () => setStatus("connected"));
    socket.on("disconnect", () => setStatus("disconnected"));
    socket.on("connect_error", (e) => setStatus(e?.message || "connect_error"));
    socket.on("room:error", (msg) => setErr(String(msg || "Room error")));

    return () => {
      socket.off();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token]);

  const validateCreate = () => {
    if (!topic) return "Select topic";
    const qc = Number(questionCount);
    const mp = Number(maxPlayers);
    const tm = Number(timerMinutes);

    if (!qc || qc < 1 || qc > 10) return "Question count must be 1 to 10";
    if (!mp || mp < 2 || mp > 10) return "Max players must be 2 to 10";
    if (!tm || tm < MIN_MINUTES || tm > MAX_MINUTES)
      return `Timer must be ${MIN_MINUTES}-${MAX_MINUTES} minutes`;

    return "";
  };

  const createRoom = () => {
    setErr("");
    const socket = socketRef.current;
    if (!socket || !socket.connected) return setErr("Socket not connected");

    const v = validateCreate();
    if (v) return setErr(v);

    socket.emit(
      "room:create",
      {
        topic,
        questionCount: Number(questionCount),
        maxPlayers: Number(maxPlayers),
        timerSeconds: Number(timerMinutes) * 60,
      },
      (ack) => {
        if (!ack?.ok) return setErr(ack?.message || "Create failed");
        nav(`/room/${ack.room.roomId}`);
      }
    );
  };

  const validationMsg = validateCreate();
  const canCreate = !validationMsg;

  return (
    <div className="bg-slate-950 text-white min-h-[calc(100vh-64px)]">
      <div className="max-w-3xl mx-auto px-5 py-6 space-y-5">
        {/* Header */}
        <div className="border border-slate-800 bg-slate-900/60 rounded-2xl p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-2xl font-extrabold tracking-tight">Create Room</h1>
              <p className="text-sm text-slate-300 mt-1">
                Configure a battle room and share the room code with your friend.
              </p>
            </div>

            <div className="text-xs px-3 py-2 rounded-xl border border-slate-800 bg-slate-950 text-slate-300">
              Socket: <span className="text-white font-semibold">{status}</span>
            </div>
          </div>

          {err && (
            <div className="mt-4 text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-xl p-3">
              {err}
            </div>
          )}

          {!err && !canCreate && (
            <div className="mt-4 text-amber-200 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
              {validationMsg}
            </div>
          )}
        </div>

        {/* Form */}
        <div className="border border-slate-800 bg-slate-900/60 rounded-2xl p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Field label="Topic" hint="Choose the topic set for random problems.">
                <select
                  className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 outline-none focus:border-slate-600"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                >
                  <option value="">Select topic</option>
                  {TOPICS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Question Count" hint="1 to 10 problems per battle.">
              <input
                className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 outline-none focus:border-slate-600"
                type="number"
                value={questionCount}
                onChange={(e) => setQuestionCount(e.target.value)}
                min={1}
                max={10}
              />
            </Field>

            <Field label="Max Players" hint="2 to 10 players.">
              <input
                className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 outline-none focus:border-slate-600"
                type="number"
                value={maxPlayers}
                onChange={(e) => setMaxPlayers(e.target.value)}
                min={2}
                max={10}
              />
            </Field>

            <div className="md:col-span-2">
              <Field label="Timer (minutes)" hint={`Allowed: ${MIN_MINUTES}-${MAX_MINUTES} minutes`}>
                <input
                  className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 outline-none focus:border-slate-600"
                  type="number"
                  value={timerMinutes}
                  onChange={(e) => setTimerMinutes(e.target.value)}
                  min={MIN_MINUTES}
                  max={MAX_MINUTES}
                />
              </Field>
            </div>

            <div className="md:col-span-2 flex gap-2">
              <button
                onClick={createRoom}
                disabled={!canCreate}
                className="flex-1 px-4 py-3 rounded-xl font-semibold bg-slate-200 text-slate-900 hover:bg-white disabled:opacity-50 disabled:hover:bg-slate-200"
              >
                Create Room
              </button>

              <button
                onClick={() => nav("/dashboard")}
                className="px-4 py-3 rounded-xl font-semibold bg-slate-800 hover:bg-slate-700 border border-slate-700"
              >
                Back
              </button>
            </div>
          </div>
        </div>

        {/* Small footer */}
        <div className="text-xs text-slate-500">
          After room creation, you will be redirected to Lobby (<code>/room/:roomId</code>).
        </div>
      </div>
    </div>
  );
}