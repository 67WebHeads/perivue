import React from "react";
function Dashboard() {
  return (
    <div className="text-white h-full p-4 w-full">
      
      <div className="grid grid-cols-1 md:grid-cols-3 overflow-x-auto gap-4">
        
        <div className="h-56 w-full border border-white/20 rounded-2xl bg-white/10 backdrop-blur-xl" />
        
        <div className="h-56 w-full border border-white/20 rounded-2xl bg-white/10 backdrop-blur-xl" />
        
        <div className="h-56 w-full border border-white/20 rounded-2xl bg-white/10 backdrop-blur-xl" />
        
      </div>

    </div>
  );
} 
export default Dashboard;