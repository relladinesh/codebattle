import "dotenv/config";
import grpc from "@grpc/grpc-js";
import protoLoader from "@grpc/proto-loader";
import path from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import { OAuth2Client } from "google-auth-library";

const prisma = new PrismaClient();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROTO_PATH = path.resolve(__dirname, "../../../../proto/auth.proto");

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "7d" });
}

function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

// ✅ Create server-side session
async function createSession(userId, token) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  await prisma.session.create({
    data: { userId, token, expiresAt },
  });
}

export function startAuthGrpcServer(port = 50053) {
  const def = protoLoader.loadSync(PROTO_PATH, {
    keepCase: false,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });

  const pkg = grpc.loadPackageDefinition(def);
  const auth = pkg.auth;

  const server = new grpc.Server();

  server.addService(auth.AuthService.service, {
    Register: async (call, cb) => {
      try {
        const { username, email, password } = call.request;

        if (!username || !email || !password) {
          return cb(new Error("username, email, password required"));
        }

        const exists = await prisma.user.findUnique({ where: { email } });
        if (exists) return cb(new Error("Email already registered"));

        const passwordHash = await bcrypt.hash(password, 10);

        const user = await prisma.user.create({
          data: { username, email, passwordHash },
        });

        const token = signToken({ userId: user.id, email: user.email });

        // ✅ store session
        await createSession(user.id, token);

        cb(null, {
          token,
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            avatarUrl: user.avatarUrl || "",
          },
        });
      } catch (e) {
        cb(e);
      }
    },

    Login: async (call, cb) => {
      try {
        const { email, password } = call.request;

        if (!email || !password) {
          return cb(new Error("email, password required"));
        }

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.passwordHash) return cb(new Error("Invalid credentials"));

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return cb(new Error("Invalid credentials"));

        const token = signToken({ userId: user.id, email: user.email });

        // ✅ store session
        await createSession(user.id, token);

        cb(null, {
          token,
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            avatarUrl: user.avatarUrl || "",
          },
        });
      } catch (e) {
        cb(e);
      }
    },

    GoogleLogin: async (call, cb) => {
      try {
        const { idToken } = call.request;
        if (!idToken) return cb(new Error("idToken required"));

        const ticket = await googleClient.verifyIdToken({
          idToken,
          audience: process.env.GOOGLE_CLIENT_ID,
        });

        const payload = ticket.getPayload();
        const googleId = payload.sub;
        const email = payload.email;
        const username = payload.name || email.split("@")[0];
        const avatarUrl = payload.picture || "";

        let user = await prisma.user.findFirst({
          where: { OR: [{ googleId }, { email }] },
        });

        if (!user) {
          user = await prisma.user.create({
            data: { username, email, googleId, avatarUrl },
          });
        } else {
          user = await prisma.user.update({
            where: { id: user.id },
            data: {
              googleId: user.googleId || googleId,
              avatarUrl: user.avatarUrl || avatarUrl,
            },
          });
        }

        const token = signToken({ userId: user.id, email: user.email });

        // ✅ store session
        await createSession(user.id, token);

        cb(null, {
          token,
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            avatarUrl: user.avatarUrl || "",
          },
        });
      } catch (e) {
        cb(e);
      }
    },

    GetMe: async (call, cb) => {
      try {
        const { token } = call.request;
        if (!token) return cb(new Error("token required"));

        const decoded = verifyToken(token);

        // ✅ check server-side session exists
        const session = await prisma.session.findUnique({ where: { token } });
        if (!session) return cb(new Error("Session not found (logged out)"));
        if (session.expiresAt < new Date()) return cb(new Error("Session expired"));

        const user = await prisma.user.findUnique({
          where: { id: decoded.userId },
        });

        if (!user) return cb(new Error("User not found"));

        cb(null, {
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            avatarUrl: user.avatarUrl || "",
          },
        });
      } catch (e) {
        cb(e);
      }
    },

    // ✅ NEW: Logout
    Logout: async (call, cb) => {
      try {
        const { token } = call.request;
        if (!token) return cb(new Error("token required"));

        await prisma.session.deleteMany({ where: { token } });

        cb(null, { ok: true, message: "Logged out" });
      } catch (e) {
        cb(e);
      }
    },
  });

  server.bindAsync(
    `0.0.0.0:${port}`,
    grpc.ServerCredentials.createInsecure(),
    (err) => {
      if (err) throw err;
      console.log(`[core] Auth gRPC running on :${port}`);
      server.start();
    }
  );
}