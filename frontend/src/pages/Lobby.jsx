// src/pages/Lobby.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../store/auth";
import { makeSocket } from "../lib/socket";

function formatMMSS(ms) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function Lobby() {
  const { roomId } = useParams();
  const nav = useNavigate();
  const { token, user } = useAuth();

  const socket = useMemo(() => (token ? makeSocket(token) : null), [token]);

  const [room, setRoom] = useState(null);
  const [err, setErr] = useState("");
  const [status, setStatus] = useState("connecting...");
  const [lobbyClosesAtMs, setLobbyClosesAtMs] = useState(0);
  const [timeLeftMs, setTimeLeftMs] = useState(0);

  useEffect(() => {
    if (!socket) return;

    socket.on("connect", () => setStatus("connected"));
    socket.on("disconnect", () => setStatus("disconnected"));
    socket.on("connect_error", (e) => setErr(e?.message || "Socket error"));
    socket.on("room:error", (m) => setErr(String(m || "Room error")));

    socket.on("room:update", (r) => {
      setRoom(r);
      setErr("");
    });

    socket.on("lobby:timer", ({ lobbyClosesAtMs }) => {
      setLobbyClosesAtMs(Number(lobbyClosesAtMs || 0));
    });

    // ✅ auto redirect when battle starts
    socket.on("battle:started", (startedRoom) => {
      nav(`/battle/${startedRoom.roomId}`);
    });

    socket.on("room:cancelled", () => nav("/dashboard"));

    // initial load
    socket.emit("room:get", { roomId }, (ack) => {
      if (!ack?.ok) setErr(ack?.message || "Room not found");
      else setRoom(ack.room);
    });

    return () => {
      socket.off();
      socket.disconnect();
    };
  }, [socket, roomId, nav]);

  // timer tick (lobby countdown)
  useEffect(() => {
    if (!lobbyClosesAtMs) {
      setTimeLeftMs(0);
      return;
    }

    const tick = () => setTimeLeftMs(lobbyClosesAtMs - Date.now());
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [lobbyClosesAtMs]);

  const isFull = !!room && room.players?.length === room.maxPlayers;

  const readyMe = () => socket?.emit("player:ready", { roomId, ready: true });
  const notReady = () => socket?.emit("player:ready", { roomId, ready: false });

  const showInfo = () => {
    setErr("");
    if (!isFull) return setErr("Room must be FULL to start");
    setErr("Battle will auto-start when ALL players click READY ✅");
  };

  return (
    <div className="bg-slate-950 text-white min-h-[calc(100vh-64px)]">
      {/* TOP BAR (dashboard style) */}
      <div className="border-b border-slate-800 bg-slate-950">
        <div className="max-w-5xl mx-auto px-5 py-5 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <button
              onClick={() => nav("/dashboard")}
              className="text-xl font-extrabold tracking-tight text-slate-100 hover:text-white"
            >
              CodeBattle
            </button>
            
            {err && <div className="text-sm text-rose-300 mt-2">{err}</div>}
          </div>
       

          <div className="flex items-center gap-3">
            <div className="px-3 py-2 rounded-xl bg-slate-900/60 border border-slate-800 text-sm">
              <div className="text-slate-400 text-xs">Lobby ends in</div>
              <div className="font-bold">{lobbyClosesAtMs ? formatMMSS(timeLeftMs) : "--:--"}</div>
            </div>

            <button
              onClick={() => nav("/dashboard")}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 font-semibold"
            >
              Exit
            </button>
          </div>
        </div>
      </div>

      {/* CONTENT */}
      <div className="max-w-5xl mx-auto px-5 py-6 space-y-4">
        {/* Actions */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-8 text-center">
  
  <div className="text-sm text-slate-400 mb-3">
    Share this Room Code
  </div>

  <div className="flex justify-center items-center gap-4">
    
    <div className="px-8 py-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30">
      <span className="text-4xl md:text-5xl font-extrabold tracking-widest text-emerald-300">
        {roomId}
      </span>
    </div>

    <button
      onClick={() => navigator.clipboard?.writeText?.(roomId)}
      className="px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 font-semibold"
    >
      Copy
    </button>

  </div>

</div>
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
          <div className="min-w-0">
            
            <div className="text-lg font-bold">Ready Up</div>
            <div className="text-sm text-slate-400">
              Battle starts automatically when the room is full and everyone is ready.
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            <button
              onClick={readyMe}
              className="px-4 py-2 rounded-xl bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/20 font-semibold"
            >
              Ready
            </button>

            <button
              onClick={notReady}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 font-semibold"
            >
              Not Ready
            </button>

            <button
              onClick={showInfo}
              disabled={!isFull}
              className="px-4 py-2 rounded-xl bg-slate-200 text-slate-900 hover:bg-white font-semibold disabled:opacity-60"
            >
              Info
            </button>
          </div>
        </div>

        {/* 2 Columns */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Players */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <div className="text-lg font-bold">Players</div>
              <div className="text-sm text-slate-400">
                {room?.players?.length || 0}/{room?.maxPlayers || 0}
              </div>
            </div>

            {!room?.players?.length ? (
              <div className="text-slate-400 text-sm mt-3">Waiting for players...</div>
            ) : (
              <div className="mt-3 space-y-2">
                {room.players.map((p) => {
                  const isReady = !!room.ready?.[p.userId];
                  const isYou = p.userId === user?.id;

                  return (
                    <div
                      key={p.userId}
                      className="flex items-center justify-between bg-slate-950 border border-slate-800 rounded-xl px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="text-sm truncate text-slate-200">
                          {p.email} {isYou ? <span className="text-slate-400">(you)</span> : ""}
                        </div>
                        <div className="text-xs text-slate-500 truncate">{p.userId}</div>
                      </div>

                      <div
                        className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
                          isReady
                            ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                            : "bg-slate-500/10 text-slate-300 border-slate-600/30"
                        }`}
                      >
                        {isReady ? "READY" : "NOT READY"}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Room Settings */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
            <div className="text-lg font-bold">Room Settings</div>

            {!room ? (
              <div className="text-slate-400 text-sm mt-3">Loading...</div>
            ) : (
              <div className="mt-3 grid grid-cols-1 gap-3 text-sm">
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                  Topic: <span className="text-slate-100 font-semibold">{room.topic}</span>
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                  Questions:{" "}
                  <span className="text-slate-100 font-semibold">{room.questionCount}</span>
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                  Battle Timer:{" "}
                  <span className="text-slate-100 font-semibold">
                    {Math.round((room.timerSeconds || 0) / 60)} min
                  </span>
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                  Status: <span className="text-slate-100 font-semibold">{room.status}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Hint */}
        <div className="text-xs text-slate-500">
          Tip: Share the room code with your friend so they can join from the dashboard.
        </div>
      </div>
    </div>
  );
}