// src/pages/BattleDetails.jsx
import { useEffect, useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { getBattleDetailsApi } from "../api/historyApi";

function Badge({ children, tone = "slate" }) {
  const cls =
    tone === "green"
      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
      : tone === "red"
      ? "bg-rose-500/15 text-rose-300 border-rose-500/30"
      : tone === "yellow"
      ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
      : "bg-slate-500/15 text-slate-300 border-slate-500/30";

  return (
    <span className={`px-2.5 py-1 rounded-full border text-xs font-semibold ${cls}`}>
      {children}
    </span>
  );
}

function statusTone(status) {
  const s = String(status || "").toUpperCase();
  if (s === "FINISHED") return "green";
  if (s === "CANCELLED") return "red";
  if (s === "ACTIVE") return "yellow";
  return "slate";
}

export default function BattleDetails() {
  const { roomCode } = useParams();
  const nav = useNavigate();

  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        setErr("");
        setLoading(true);

        const res = await getBattleDetailsApi(roomCode);
        if (!res?.ok) {
          setErr(res?.message || "Not found");
          setData(null);
          return;
        }
        setData(res);
      } catch (e) {
        setErr(e?.message || "Failed");
        setData(null);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [roomCode]);

  const winnerLabel = useMemo(() => {
    if (!data) return "—";
    return (
      data.winnerUsername ||
      data.players?.find((p) => p.userId === data.winnerUserId)?.username ||
      data.players?.find((p) => p.userId === data.winnerUserId)?.email ||
      data.winnerUserId ||
      "Unknown"
    );
  }, [data]);

  const status = String(data?.status || "").toUpperCase();

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header (same as dashboard style) */}
      <div className="border-b border-slate-800 bg-gradient-to-b from-purple-950/40 to-slate-950">
        <div className="max-w-7xl mx-auto px-5 py-6 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-2xl font-extrabold tracking-tight">
              Battle Details
            </div>
            <div className="text-sm text-slate-300 mt-1 truncate">
              Room <span className="text-slate-100 font-semibold">{roomCode}</span>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => nav("/dashboard")}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 font-semibold"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-5 py-6 space-y-5">
        {/* Errors / Loading */}
        {err && (
          <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-4 text-rose-200">
            <div className="font-semibold">Error</div>
            <div className="text-sm mt-1">{err}</div>
            <Link className="inline-block mt-3 text-purple-300 underline" to="/dashboard">
              ← Back
            </Link>
          </div>
        )}

        {loading && !err && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 text-slate-300">
            Loading battle details...
          </div>
        )}

        {!loading && !err && data && (
          <>
            {/* Summary Card */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="text-lg font-bold">
                      {(data.topic || "TOPIC").toUpperCase()}
                    </div>
                    <Badge tone={statusTone(status)}>{status || "—"}</Badge>
                    <span className="text-xs text-slate-400">
                      Room: <span className="text-slate-200">{data.roomCode}</span>
                    </span>
                  </div>

                  <div className="text-sm text-slate-300 mt-2">
                    Winner:{" "}
                    <span className="text-emerald-300 font-semibold">
                      {winnerLabel}
                    </span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      navigator.clipboard?.writeText?.(data.roomCode);
                    }}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 font-semibold"
                  >
                    Copy Room Code
                  </button>

                  <Link
                    to="/dashboard"
                    className="px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-600 font-semibold text-center"
                  >
                    Dashboard
                  </Link>
                </div>
              </div>
            </div>

            {/* Two Columns: Players / Problems */}
            <div className="grid md:grid-cols-2 gap-5">
              {/* Players */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-800">
                  <div className="text-lg font-bold">Players</div>
                  <div className="text-xs text-slate-400 mt-1">
                    Sorted by score
                  </div>
                </div>

                {(data.players || []).length === 0 ? (
                  <div className="px-5 py-6 text-slate-400">No players</div>
                ) : (
                  <div className="divide-y divide-slate-800">
                    {(data.players || []).map((p) => {
                      const name = p.username || p.email || p.userId;
                      const isWinner = p.userId === data.winnerUserId;

                      return (
                        <div
                          key={p.userId}
                          className="px-5 py-4 flex items-center justify-between hover:bg-slate-900"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p
                                className={`text-sm font-semibold truncate ${
                                  isWinner ? "text-emerald-300" : "text-slate-100"
                                }`}
                              >
                                {name}
                              </p>
                              {isWinner && <Badge tone="green">Winner</Badge>}
                            </div>
                            <p className="text-xs text-slate-400 truncate">
                              {p.userId}
                            </p>
                          </div>

                          <div className="text-right">
                            <div className="text-emerald-300 font-bold">
                              {p.score}
                            </div>
                            <div className="text-xs text-slate-500">
                              score
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Problems */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-800">
                  <div className="text-lg font-bold">Problems</div>
                  <div className="text-xs text-slate-400 mt-1">
                    Battle questions list
                  </div>
                </div>

                {(data.problems || []).length === 0 ? (
                  <div className="px-5 py-6 text-slate-400">No problems</div>
                ) : (
                  <div className="divide-y divide-slate-800">
                    {(data.problems || []).map((pr) => (
                      <div key={pr.problemId} className="px-5 py-4 hover:bg-slate-900">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-semibold truncate">
                            {pr.order}. {pr.title}
                          </p>
                          <span className="text-xs text-slate-400 truncate">
                            {pr.difficulty}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">
                          {pr.topic}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Submissions */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-800">
                <div className="text-lg font-bold">Submissions</div>
                <div className="text-xs text-slate-400 mt-1">
                  All submissions in this battle
                </div>
              </div>

              {(data.submissions || []).length === 0 ? (
                <div className="px-5 py-6 text-slate-400">No submissions</div>
              ) : (
                <div className="divide-y divide-slate-800">
                  {(data.submissions || []).map((s) => {
                    const submitter = s.username || s.userId;
                    const verdict = String(s.verdict || "").toUpperCase();

                    return (
                      <div
                        key={s.id}
                        className="px-5 py-4 flex items-center justify-between gap-4 hover:bg-slate-900"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{submitter}</p>
                          <p className="text-xs text-slate-400 truncate">
                            {s.problemId} • {s.language}
                          </p>
                        </div>

                        <Badge tone={verdict === "AC" ? "green" : "red"}>
                          {verdict || "—"}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Back footer */}
            <div className="text-xs text-slate-500">
              <Link className="text-purple-300 underline" to="/dashboard">
                ← Back to Dashboard
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}