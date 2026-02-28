import { Outlet } from "react-router-dom";
import Navbar from "../components/common/navbar";

export default function MainLayout() {
  return (
    <div className=" w-full text-white bg-slate-950   min-h-screen">
      
      <div >
        <Outlet />
      </div>
    </div>
  );
}