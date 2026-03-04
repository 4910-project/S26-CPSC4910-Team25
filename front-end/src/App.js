import "./App.css";
import React, { useState, useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Navbar from "./components/Navbar";

import Login from "./login.js";
import MFASettings from "./MFASettings";

import About from "./components/About";
import DriverProfile from "./components/DriverProfile";
import SponsorProfile from "./components/SponsorProfile";
import PasswordReset from "./components/PasswordReset";
import ChangePassword from "./components/ChangePassword";
import ForgotPassword from "./components/ForgotPassword";
import ForgotUsername from "./components/ForgotUsername";
import ChangeUsername from "./components/ChangeUsername";

function App() {
  const [token, setToken] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [screen, setScreen] = useState("login"); // "login" | "mfa" | "driver-profile" | "sponsor-profile" | "reset-password"
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showChangeUsername, setShowChangeUsername] = useState(false);

  // ----- Dark Mode -----
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "dark") setDark(true);
    else if (saved === "light") setDark(false);
    else {
      const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
      setDark(!!prefersDark);
    }
  }, []);

  useEffect(() => {
    document.body.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);


  // Called after successful login
  const handleLogin = (t, role) => {
    console.log("Logged in token:", t, "Role:", role);
    setToken(t);
    setUserRole(role);
    setScreen("mfa"); // Go to MFA first
  };

  const handleLogout = () => {
    setToken(null);
    setUserRole(null);
    setScreen("login");
    setShowChangePassword(false);
    setShowChangeUsername(false);
  };

  const handleMFAComplete = () => {
    if (userRole === "DRIVER") setScreen("driver-profile");
    else if (userRole === "SPONSOR") setScreen("sponsor-profile");
    else setScreen("driver-profile");
  };

  // Password Reset (not logged in)
  if (screen === "reset-password") {
    return (
      <>
        <div style={{ display: "flex", justifyContent: "flex-end", padding: 12 }}>
          <button type="button" onClick={() => setDark((d) => !d)}
            style={{ border: "1px solid #ccc", background: "transparent", borderRadius: 10, padding: "8px 12px", cursor: "pointer" }}>
            {dark ? "☀️ Light" : "🌙 Dark"}
          </button>
        </div>
        <PasswordReset onBack={() => setScreen("login")} />
      </>
    );
  }

  // Not logged in → show auth routes
  if (!token) {
    return (
      <>
        <div style={{ display: "flex", justifyContent: "flex-end", padding: 12 }}>
          <button type="button" onClick={() => setDark((d) => !d)}
            style={{ border: "1px solid #ccc", background: "transparent", borderRadius: 10, padding: "8px 12px", cursor: "pointer" }}>
            {dark ? "☀️ Light" : "🌙 Dark"}
          </button>
        </div>
        <Routes>
          <Route path="/login" element={<Login onLogin={handleLogin} />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/forgot-username" element={<ForgotUsername />} />
          <Route path="/about" element={<About />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </>
    );
  }

  // MFA Screen (logged in, before profile)
  if (screen === "mfa") {
    return (
      <>
        <Navbar
          userRole={userRole}
          screen={screen}
          onNavigate={setScreen}
          onLogout={handleLogout}
          dark={dark}
          onToggleDark={() => setDark((d) => !d)}
        />
        <MFASettings
          token={token}
          onBack={handleLogout}
          onLogout={handleLogout}
          onContinue={handleMFAComplete}
        />
      </>
    );
  }

  // Driver Profile
  if (screen === "driver-profile" && userRole === "DRIVER") {
    return (
      <>
        <Navbar
          userRole={userRole}
          screen={screen}
          onNavigate={setScreen}
          onLogout={handleLogout}
          dark={dark}
          onToggleDark={() => setDark((d) => !d)}
        />
        <DriverProfile
          token={token}
          onLogout={handleLogout}
          onChangePassword={() => setShowChangePassword(true)}
          onChangeUsername={() => setShowChangeUsername(true)}
        />
        {showChangePassword && (
          <ChangePassword token={token} onClose={() => setShowChangePassword(false)} />
        )}
        {showChangeUsername && (
          <ChangeUsername token={token} onClose={() => setShowChangeUsername(false)} />
        )}
      </>
    );
  }

  // Sponsor Profile
  if (screen === "sponsor-profile" && userRole === "SPONSOR") {
    return (
      <>
        <Navbar
          userRole={userRole}
          screen={screen}
          onNavigate={setScreen}
          onLogout={handleLogout}
          dark={dark}
          onToggleDark={() => setDark((d) => !d)}
        />
        <SponsorProfile
          token={token}
          onLogout={handleLogout}
          onChangePassword={() => setShowChangePassword(true)}
          onChangeUsername={() => setShowChangeUsername(true)}
        />
        {showChangePassword && (
          <ChangePassword token={token} onClose={() => setShowChangePassword(false)} />
        )}
        {showChangeUsername && (
          <ChangeUsername token={token} onClose={() => setShowChangeUsername(false)} />
        )}
      </>
    );
  }

  // Fallback
  return <Login onLogin={handleLogin} />;
}

export default App;