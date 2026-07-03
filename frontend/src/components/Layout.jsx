import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import background from "../assets/PeriVue_Background.webp";
import splash_art_perivue from "../assets/splash_art_perivue.png";
import SpaceDashboardIcon from "@mui/icons-material/SpaceDashboard";
import GroupIcon from "@mui/icons-material/Group";
import LogoutIcon from "@mui/icons-material/Logout";
import TrackChangesIcon from "@mui/icons-material/TrackChanges";

function Layout() {
  const [isOpen, setIsOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const navItems = [
    { path: "/dashboard", label: "Dashboard", icon: <SpaceDashboardIcon /> },
    { path: "/records", label: "Users", icon: <GroupIcon /> },
    { path: "/test-menu", label: "Test", icon: <TrackChangesIcon /> },
    ...(user?.role === "admin" ? [
      { path: "/users", label: "User Management" }
    ] : []),
  ];

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) setIsOpen(false);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (isMobile) setIsOpen(false);
  }, [location, isMobile]);

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="h-dvh bg-cover bg-center bg-no-repeat" style={{ backgroundImage: `url(${background})` }}>
      <div className="h-full bg-white/10 backdrop-blur-xl border border-white/20 shadow-2xl overflow-hidden flex flex-col text-white">

        <div className="h-16 flex items-center justify-between px-6 border-b border-white/10">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="p-2 rounded-lg hover:cursor-pointer transition-all duration-200"
              aria-label="Toggle sidebar"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {isOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
            <img src={splash_art_perivue} alt="Splash" className="w-[90px] h-[90px] object-cover" />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm opacity-80">{user?.full_name ?? "—"}</span>
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt="avatar" className="w-8 h-8 rounded-full object-cover" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-xs font-medium">
                {user?.full_name?.split(" ").map((n) => n[0]).slice(0, 2).join("") ?? "?"}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden relative">
          {isMobile && isOpen && (
            <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setIsOpen(false)} />
          )}

          <aside
            className={`
              ${isMobile ? "fixed z-50" : "relative"}
              h-full border-r border-white/10
              transition-all duration-300 ease-in-out flex flex-col
              ${isMobile
                ? isOpen
                  ? "translate-x-0 w-64 shadow-2xl bg-[#0d1325]/80 backdrop-blur-xl"
                  : "-translate-x-full w-64"
                : isOpen ? "w-64" : "w-20"
              }
            `}
          >
            <nav className="flex-1 p-4">
              <ul className="space-y-2">
                {navItems.map((item) => {
                  const isActive = location.pathname === item.path;
                  return (
                    <li key={item.path}>
                      <Link
                        to={item.path}
                        className={`
                          flex items-center gap-3 px-3 py-2.5 rounded-lg
                          transition-all duration-200
                          ${isActive
                            ? "bg-white/20 text-white shadow-lg"
                            : "hover:bg-white/10 text-white/80 hover:text-white"
                          }
                        `}
                      >
                        <span className="text-xl flex-shrink-0">{item.icon}</span>
                        <span
                          className={`whitespace-nowrap transition-all duration-300 overflow-hidden ${
                            isOpen ? "opacity-100 max-w-xs" : "opacity-0 max-w-0"
                          }`}
                        >
                          {item.label}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>

            <div className="p-4 border-t border-white/10">
              <button
                onClick={handleLogout}
                className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg hover:bg-red-500/20 text-white/80 hover:text-white transition-all duration-200"
              >
                <span className="text-xl flex-shrink-0">
                  <LogoutIcon fontSize="small" />
                </span>
                <span
                  className={`whitespace-nowrap transition-all duration-300 overflow-hidden ${
                    isOpen ? "opacity-100 max-w-xs" : "opacity-0 max-w-0"
                  }`}
                >
                  Logout
                </span>
              </button>
            </div>
          </aside>

          <main className="flex-1 overflow-y-auto relative">
            <div className="h-full m-2 bg-white/5 border border-white/10 rounded-2xl overflow-x-hidden p-4">
              <Outlet />
            </div>
          </main>
        </div>

      </div>
    </div>
  );
}

export default Layout;
