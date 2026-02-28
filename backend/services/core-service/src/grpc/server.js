import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import grpc from "@grpc/grpc-js";
import protoLoader from "@grpc/proto-loader";
import { prisma } from "../config/prisma.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROTO_PATH = path.resolve(__dirname, "../../../../proto/core.proto");

console.log("CORE DB:", process.env.DATABASE_URL);

function ms(d) {
  return d ? String(d.getTime()) : "0"; // int64 -> string (because proto-loader longs:String)
}

export function startGrpcServer(port = 50051) {
  const def = protoLoader.loadSync(PROTO_PATH, {
    keepCase: false,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });

  const pkg = grpc.loadPackageDefinition(def);
  const core = pkg.core;

  const server = new grpc.Server();

  /* ============================================================
     ✅ ProblemService
     ============================================================ */
  server.addService(core.ProblemService.service, {
    GetRandomProblems: async (call, cb) => {
      try {
        const topic = String(call.request.topic || "").toLowerCase().trim();
        const count = Math.max(1, Math.min(10, Number(call.request.count || 1)));
        if (!topic) return cb(null, { problems: [] });

        // ✅ include LeetCode-style fields
        const problems = await prisma.$queryRaw`
          SELECT
            id, title, statement, topic, difficulty,
            "fnName", "inputFormat", "outputFormat",
            "starterJava", "starterPython", "starterCpp", "starterJs"
          FROM "Problem"
          WHERE lower(topic) = ${topic}
          ORDER BY random()
          LIMIT ${count}
        `;

        cb(null, { problems });
      } catch (e) {
        console.error("GetRandomProblems error:", e);
        cb(e);
      }
    },

    GetProblemDetails: async (call, cb) => {
      try {
        const problemId = String(call.request.problemId || "").trim();
        const includeHidden = !!call.request.includeHidden;

        if (!problemId) return cb(new Error("problemId is required"));

        // ✅ include LeetCode-style fields
        const problem = await prisma.problem.findUnique({
          where: { id: problemId },
          select: {
            id: true,
            title: true,
            statement: true,
            topic: true,
            difficulty: true,

            fnName: true,
            inputFormat: true,
            outputFormat: true,

            starterJava: true,
            starterPython: true,
            starterCpp: true,
            starterJs: true,
          },
        });

        if (!problem) return cb(new Error("Problem not found"));

        const testcases = await prisma.testcase.findMany({
          where: includeHidden ? { problemId } : { problemId, isSample: true },
          select: { input: true, expected: true, isSample: true },
          orderBy: { createdAt: "asc" },
        });

        cb(null, { problem, testcases });
      } catch (e) {
        console.error("GetProblemDetails error:", e);
        cb(e);
      }
    },
  });

  /* ============================================================
     ✅ BattleService
     ============================================================ */
  server.addService(core.BattleService.service, {
    PersistBattleResult: async (call, cb) => {
      try {
        const r = call.request?.room;
        if (!r?.roomId) return cb(new Error("room.roomId is required"));
        if (!r?.hostUserId) return cb(new Error("room.hostUserId is required"));

        const roomCode = String(r.roomId);
        const startTime = r.startTimeMs ? new Date(Number(r.startTimeMs)) : null;
        const endTime = r.endTimeMs ? new Date(Number(r.endTimeMs)) : null;

        const dbRoom = await prisma.room.upsert({
          where: { roomCode },
          update: {
            status: r.status || "FINISHED",
            topic: r.topic || null,
            questionCount: r.questionCount ?? null,
            timerSeconds: r.timerSeconds ?? null,
            startTime,
            endTime,
            hostUserId: r.hostUserId,
          },
          create: {
            roomCode,
            status: r.status || "FINISHED",
            topic: r.topic || null,
            questionCount: r.questionCount ?? null,
            timerSeconds: r.timerSeconds ?? null,
            startTime,
            endTime,
            hostUserId: r.hostUserId,
          },
          select: { id: true },
        });

        const dbRoomId = dbRoom.id;

        const players = Array.isArray(r.players) ? r.players : [];
        const scores = r.scores || {};
        const readyMap = r.ready || {};

        const roomPlayerRows = players
          .filter((p) => p?.userId)
          .map((p) => {
            const userId = String(p.userId);
            return {
              roomId: dbRoomId,
              userId,
              score: Number(scores[userId] ?? 0),
              isReady: !!readyMap[userId],
            };
          });

        const questions = Array.isArray(r.questions) ? r.questions : [];
        const roomProblemRows = questions
          .filter((q) => q?.problemId)
          .map((q) => ({
            roomId: dbRoomId,
            problemId: String(q.problemId),
            order: Number(q.order ?? 1),
          }));

        await prisma.$transaction([
          prisma.roomPlayer.deleteMany({ where: { roomId: dbRoomId } }),
          prisma.roomProblem.deleteMany({ where: { roomId: dbRoomId } }),

          ...(roomPlayerRows.length ? [prisma.roomPlayer.createMany({ data: roomPlayerRows })] : []),
          ...(roomProblemRows.length ? [prisma.roomProblem.createMany({ data: roomProblemRows })] : []),
        ]);

        cb(null, { ok: true, dbRoomId, message: "Battle saved successfully" });
      } catch (e) {
        console.error("PersistBattleResult error:", e);
        cb(e);
      }
    },

    PersistSubmission: async (call, cb) => {
      try {
        const s = call.request;

        if (!s?.roomId) return cb(new Error("roomId is required"));
        if (!s?.userId) return cb(new Error("userId is required"));
        if (!s?.problemId) return cb(new Error("problemId is required"));

        const roomCode = String(s.roomId);

        // Ensure Room exists
        const room = await prisma.room.upsert({
          where: { roomCode },
          update: {},
          create: {
            roomCode,
            status: "ACTIVE",
            hostUserId: String(s.userId), // fallback
          },
          select: { id: true },
        });

        const created = await prisma.submission.create({
          data: {
            roomId: room.id,
            userId: String(s.userId),
            problemId: String(s.problemId),
            language: String(s.language || "unknown"),
            sourceCode: String(s.sourceCode || ""),
            verdict: String(s.verdict || "PENDING"),
            scoreDelta: Number(s.scoreDelta || 0),
            timeMs: s.timeMs ? Number(s.timeMs) : null,
            memoryKb: s.memoryKb ? Number(s.memoryKb) : null,
            errorMessage: s.errorMessage ? String(s.errorMessage) : null,
          },
          select: { id: true },
        });

        cb(null, { ok: true, submissionId: created.id, message: "Submission saved" });
      } catch (e) {
        console.error("PersistSubmission error:", e);
        cb(e);
      }
    },
  });

  /* ============================================================
     ✅ HistoryService (unchanged)
     ============================================================ */
  server.addService(core.HistoryService.service, {
    GetRecentBattles: async (call, cb) => {
      try {
        const limit = Math.max(1, Math.min(100, Number(call.request?.limit || 20)));

        const rooms = await prisma.room.findMany({
          orderBy: { createdAt: "desc" },
          take: limit,
          select: {
            id: true,
            roomCode: true,
            status: true,
            topic: true,
            questionCount: true,
            timerSeconds: true,
            createdAt: true,
            startTime: true,
            endTime: true,
            hostUserId: true,
          },
        });

        if (!rooms.length) return cb(null, { battles: [] });

        const roomIds = rooms.map((r) => r.id);

        const roomPlayers = await prisma.roomPlayer.findMany({
          where: { roomId: { in: roomIds } },
          select: { roomId: true, userId: true, score: true },
        });

        const rpByRoom = new Map();
        for (const rp of roomPlayers) {
          if (!rpByRoom.has(rp.roomId)) rpByRoom.set(rp.roomId, []);
          rpByRoom.get(rp.roomId).push(rp);
        }

        const winnerIds = [];
        const winnerByRoomId = new Map();

        for (const r of rooms) {
          const arr = rpByRoom.get(r.id) || [];
          arr.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
          const winner = arr[0] || null;
          winnerByRoomId.set(r.id, winner);
          if (winner?.userId) winnerIds.push(winner.userId);
        }

        const uniqWinnerIds = [...new Set(winnerIds)];

        const users = uniqWinnerIds.length
          ? await prisma.user.findMany({
              where: { id: { in: uniqWinnerIds } },
              select: { id: true, username: true, email: true },
            })
          : [];

        const userMap = new Map(users.map((u) => [u.id, u]));

        const battles = rooms.map((r) => {
          const arr = rpByRoom.get(r.id) || [];
          const winner = winnerByRoomId.get(r.id);
          const u = winner?.userId ? userMap.get(winner.userId) : null;

          return {
            roomCode: r.roomCode,
            status: r.status,
            topic: r.topic || "",
            questionCount: r.questionCount ?? 0,
            timerSeconds: r.timerSeconds ?? 0,

            createdAtMs: ms(r.createdAt),
            startTimeMs: ms(r.startTime),
            endTimeMs: ms(r.endTime),

            hostUserId: r.hostUserId || "",
            winnerUserId: winner?.userId || "",
            winnerUsername: u?.username || u?.email || "",

            playerCount: arr.length,
          };
        });

        cb(null, { battles });
      } catch (e) {
        console.error("GetRecentBattles error:", e);
        cb(e);
      }
    },

    GetBattleDetails: async (call, cb) => {
      try {
        const roomCode = String(call.request?.roomCode || "").trim();
        if (!roomCode) return cb(null, { ok: false, message: "roomCode required" });

        const room = await prisma.room.findUnique({
          where: { roomCode },
          select: {
            id: true,
            roomCode: true,
            status: true,
            topic: true,
            questionCount: true,
            timerSeconds: true,
            createdAt: true,
            startTime: true,
            endTime: true,
            hostUserId: true,
          },
        });

        if (!room) return cb(null, { ok: false, message: "Battle not found" });

        const playersRows = await prisma.roomPlayer.findMany({
          where: { roomId: room.id },
          orderBy: { score: "desc" },
          select: { userId: true, score: true, isReady: true },
        });

        const playerUserIds = [...new Set(playersRows.map((p) => p.userId))];

        const playerUsers = playerUserIds.length
          ? await prisma.user.findMany({
              where: { id: { in: playerUserIds } },
              select: { id: true, username: true, email: true },
            })
          : [];

        const playerUserMap = new Map(playerUsers.map((u) => [u.id, u]));

        const players = playersRows.map((p) => {
          const u = playerUserMap.get(p.userId);
          return {
            userId: p.userId,
            score: p.score ?? 0,
            isReady: !!p.isReady,
            username: u?.username || "",
            email: u?.email || "",
          };
        });

        const winnerUserId = playersRows.length ? playersRows[0].userId : "";
        const winnerUser = winnerUserId ? playerUserMap.get(winnerUserId) : null;
        const winnerUsername = winnerUser?.username || winnerUser?.email || "";

        const roomProblemRows = await prisma.roomProblem.findMany({
          where: { roomId: room.id },
          orderBy: { order: "asc" },
          select: { problemId: true, order: true },
        });

        const problemIds = [...new Set(roomProblemRows.map((rp) => rp.problemId))];

        const problemsMeta = problemIds.length
          ? await prisma.problem.findMany({
              where: { id: { in: problemIds } },
              select: { id: true, title: true, topic: true, difficulty: true },
            })
          : [];

        const problemMap = new Map(problemsMeta.map((p) => [p.id, p]));

        const problems = roomProblemRows.map((rp) => {
          const p = problemMap.get(rp.problemId);
          return {
            problemId: rp.problemId,
            order: rp.order ?? 0,
            title: p?.title || "",
            topic: p?.topic || "",
            difficulty: p?.difficulty || "",
          };
        });

        const submissionRows = await prisma.submission.findMany({
          where: { roomId: room.id },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            userId: true,
            problemId: true,
            verdict: true,
            scoreDelta: true,
            language: true,
            createdAt: true,
          },
        });

        const subUserIds = [...new Set(submissionRows.map((s) => s.userId))];

        const subUsers = subUserIds.length
          ? await prisma.user.findMany({
              where: { id: { in: subUserIds } },
              select: { id: true, username: true, email: true },
            })
          : [];

        const subUserMap = new Map(subUsers.map((u) => [u.id, u]));

        const submissions = submissionRows.map((s) => {
          const u = subUserMap.get(s.userId);
          return {
            id: s.id,
            userId: s.userId,
            problemId: s.problemId,
            verdict: s.verdict,
            scoreDelta: s.scoreDelta ?? 0,
            language: s.language,
            createdAtMs: ms(s.createdAt),
            username: u?.username || u?.email || "",
          };
        });

        cb(null, {
          ok: true,
          message: "OK",

          roomCode: room.roomCode,
          status: room.status,
          topic: room.topic || "",
          questionCount: room.questionCount ?? 0,
          timerSeconds: room.timerSeconds ?? 0,

          createdAtMs: ms(room.createdAt),
          startTimeMs: ms(room.startTime),
          endTimeMs: ms(room.endTime),

          hostUserId: room.hostUserId || "",
          winnerUserId,
          winnerUsername,

          players,
          problems,
          submissions,
        });
      } catch (e) {
        console.error("GetBattleDetails error:", e);
        cb(e);
      }
    },
  });

  server.bindAsync(
    `0.0.0.0:${port}`,
    grpc.ServerCredentials.createInsecure(),
    (err) => {
      if (err) throw err;
      console.log(`[core] gRPC running on :${port}`);
      server.start();
    }
  );
}