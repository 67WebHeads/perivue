import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import App from "./App.jsx";
import Login from "./pages/auth/Login.jsx";
import CompleteProfile from "./pages/general/CompleteProfile";
import Dashboard from "./pages/general/Dashboard.jsx";
import Records from "./pages/general/Records.jsx";
import Layout from "./components/Layout.jsx";
import TestHome from "./pages/general/TestHome.jsx";
import TestScreen from './pages/general/TestScreen.jsx';

createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <StrictMode>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/login" element={<Login />} />
          <Route path="/complete-profile" element={<CompleteProfile />} />

          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            {/* <Route path="/home" element={<Dashboard />} /> */}
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/records" element={<Records />} />
            <Route path="/test-menu" element={<TestHome/>} />
          </Route>
          <Route>
            <Route path="/test/canvas" element={<TestScreen />} />
          </Route>
        </Routes>
      </AuthProvider>
    </StrictMode>
  </BrowserRouter>
);