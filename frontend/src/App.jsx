import { Routes, Route } from "react-router-dom";
import RequireAuth from "./config/RequireAuth";

import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import CreateRoom from "./pages/CreateRoom";
import Lobby from "./pages/Lobby";
import BattleEditor from "./pages/BattleEditor"; // ✅ NEW
import MainLayout from "./layout/MainLayout";
import BattleDetails from "./pages/BattleDetails";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route
        element={
          <RequireAuth>
            <MainLayout />
          </RequireAuth>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/create-room" element={<CreateRoom />} />
        <Route path="/room/:roomId" element={<Lobby />} />
        <Route path="/history/:roomCode" element={<BattleDetails />} />

        {/* ✅ Battle page */}
        <Route path="/battle/:roomId" element={<BattleEditor />} />
      </Route>
    </Routes>
  );
}