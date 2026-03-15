import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import Home from "./Home.jsx";
import Dashboard from "./pages/general/Dashboard.jsx";
import Records from "./pages/general/Records.jsx";
import Layout from "./components/Layout.jsx";

createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <StrictMode>
      <Routes>
        <Route element={<Layout />}>
          <Route path='/' element={<Dashboard />}/>
          <Route path='/records' element={<Records />}/>
        </Route>
      </Routes>
    </StrictMode>
  </BrowserRouter>
);
