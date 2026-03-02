import React from "react";
import ArrowOutwardIcon from "@mui/icons-material/ArrowOutward";
import SpaceDashboardIcon from "@mui/icons-material/SpaceDashboard";
import AddIcon from "@mui/icons-material/Add";
import PersonIcon from "@mui/icons-material/Person";
import NightsStayIcon from "@mui/icons-material/NightsStay";
import Sidebar from "./components/Layout";
import Dashboard from "./pages/general/Dashboard";

function Home() {
  return (
    <div className="flex gap-4 flex-row min-h-dvh bg-[url('./assets/PeriVue_Background.webp')] bg-cover bg-center bg-no-repeat p-4 text-black">
      <Sidebar/>
      <div className="outline grow rounded-xl overflow-hidden">
        <Dashboard/>
      </div>
    </div>
  );
}

export default Home;