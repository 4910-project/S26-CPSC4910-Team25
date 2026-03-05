import "./App.css";
import React, { useState, useEffect } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";

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

// ── Small dark toggle for unauthenticated pages ────────────────────────────
function PreAuthToggle({ dark, onToggleDark }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", padding: 12 }}>
      <button
        type="button"
        onClick={onToggleDark}
        style={{
          border: "1px solid #ccc",
          background: "transparent",
          borderRadius: 10,
          padding: "8px 12px",
          cursor: "pointer",
        }}
      >
        {dark ? "☀️ Light" : "🌙 Dark"}
      </button>
    </div>
  );
}

// ── Authenticated layout: Navbar + page content ────────────────────────────
function AuthLayout({ userRole, onLogout, dark, onToggleDark, children }) {
  const navigate = useNavigate();
  return (
    <>
      <Navbar
        userRole={userRole}
        onNavigate={(screen) => {
          if (screen === "driver-profile") navigate("/driver");
          else if (screen === "sponsor-profile") navigate("/sponsor");
          else if (screen === "admin-dashboard") navigate("/admin");
        }}
        onLogout={onLogout}
        dark={dark}
        onToggleDark={onToggleDark}
      />
      {children}
    </>
  );
}

// ── Main App ───────────────────────────────────────────────────────────────
export default function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem("token") || null);
  const [userRole, setUserRole] = useState(() => sessionStorage.getItem("userRole") || null);

  // mfaComplete: true means user has passed the MFA step this session
  const [mfaComplete, setMfaComplete] = useState(
    () => sessionStorage.getItem("mfaComplete") === "true"
  );

  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showChangeUsername, setShowChangeUsername] = useState(false);

  // ── Dark mode ──
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "dark") return true;
    if (saved === "light") return false;
    return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
  });

  useEffect(() => {
    document.body.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  const toggleDark = () => setDark((d) => !d);

  const handleLogin = (t, role) => {
    sessionStorage.setItem("token", t);
    sessionStorage.setItem("userRole", role);
    sessionStorage.removeItem("mfaComplete"); // always re-do MFA on fresh login
    setToken(t);
    setUserRole(role);
    setMfaComplete(false);
  };

  const handleMFAComplete = () => {
    sessionStorage.setItem("mfaComplete", "true");
    setMfaComplete(true);
  };

  const handleLogout = () => {
    sessionStorage.clear();
    setToken(null);
    setUserRole(null);
    setMfaComplete(false);
    setShowChangePassword(false);
    setShowChangeUsername(false);
  };

  // ── NOT logged in: show public routes ─────────────────────────────────────
  if (!token) {
    return (
      <Routes>
        <Route path="/login" element={
          <>
            <PreAuthToggle dark={dark} onToggleDark={toggleDark} />
            <Login onLogin={handleLogin} />
          </>
        } />
        <Route path="/forgot-password" element={
          <><PreAuthToggle dark={dark} onToggleDark={toggleDark} /><ForgotPassword /></>
        } />
        <Route path="/forgot-username" element={
          <><PreAuthToggle dark={dark} onToggleDark={toggleDark} /><ForgotUsername /></>
        } />
        <Route path="/reset-password" element={
          <><PreAuthToggle dark={dark} onToggleDark={toggleDark} /><PasswordReset /></>
        } />
        <Route path="/about" element={
          <><PreAuthToggle dark={dark} onToggleDark={toggleDark} /><About /></>
        } />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  // ── LOGGED IN but MFA not done yet: show MFA gate (no route needed) ───────
  if (!mfaComplete) {
    return (
      <>
        <Navbar
          userRole={userRole}
          onNavigate={() => {}}
          onLogout={handleLogout}
          dark={dark}
          onToggleDark={toggleDark}
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

  // ── LOGGED IN + MFA done: show dashboard routes with proper URLs ───────────
  const dashboardRedirect =
    userRole === "DRIVER"  ? "/driver"  :
    userRole === "SPONSOR" ? "/sponsor" :
    userRole === "ADMIN"   ? "/admin"   : "/driver";

  return (
    <Routes>
      {/* Driver dashboard */}
      <Route path="/driver" element={
        <AuthLayout userRole={userRole} onLogout={handleLogout} dark={dark} onToggleDark={toggleDark}>
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
        </AuthLayout>
      } />

      {/* Sponsor dashboard */}
      <Route path="/sponsor" element={
        <AuthLayout userRole={userRole} onLogout={handleLogout} dark={dark} onToggleDark={toggleDark}>
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
        </AuthLayout>
      } />

      {/* Catch-all: send to correct dashboard */}
      <Route path="*" element={<Navigate to={dashboardRedirect} replace />} />
    </Routes>
  );
}