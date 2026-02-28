import "dotenv/config";
import { startGrpcServer } from "./grpc/server.js";
import { startAuthGrpcServer } from "./grpc/authServer.js";
const port = Number(process.env.CORE_GRPC_PORT || 50051);
startGrpcServer(port);

startAuthGrpcServer(50053);
