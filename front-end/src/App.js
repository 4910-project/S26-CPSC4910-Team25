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

// ── Login page wrapper: navigates after successful login ───────────────────
function LoginPage({ onLogin, dark, onToggleDark }) {
  const navigate = useNavigate();

  const handleLogin = (t, role) => {
    onLogin(t, role);
    navigate("/mfa", { replace: true });
  };

  return (
    <>
      <PreAuthToggle dark={dark} onToggleDark={onToggleDark} />
      <Login onLogin={handleLogin} />
    </>
  );
}

// ── MFA page wrapper: navigates to dashboard after completion ──────────────
function MFAPage({ token, userRole, onLogout, dark, onToggleDark }) {
  const navigate = useNavigate();

  const handleContinue = () => {
    if (userRole === "DRIVER") navigate("/driver", { replace: true });
    else if (userRole === "SPONSOR") navigate("/sponsor", { replace: true });
    else if (userRole === "ADMIN") navigate("/admin", { replace: true });
    else navigate("/driver", { replace: true });
  };

  return (
    <AuthLayout userRole={userRole} onLogout={onLogout} dark={dark} onToggleDark={onToggleDark}>
      <MFASettings
        token={token}
        onBack={onLogout}
        onLogout={onLogout}
        onContinue={handleContinue}
      />
    </AuthLayout>
  );
}

// ── Main App ───────────────────────────────────────────────────────────────
export default function App() {
  // Persist session across page refresh using sessionStorage
  const [token, setToken] = useState(() => sessionStorage.getItem("token") || null);
  const [userRole, setUserRole] = useState(() => sessionStorage.getItem("userRole") || null);
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

  // Persist token + role so refresh doesn't log you out
  useEffect(() => {
    if (token) sessionStorage.setItem("token", token);
    else sessionStorage.removeItem("token");
  }, [token]);

  useEffect(() => {
    if (userRole) sessionStorage.setItem("userRole", userRole);
    else sessionStorage.removeItem("userRole");
  }, [userRole]);

  const toggleDark = () => setDark((d) => !d);

  const handleLogin = (t, role) => {
    setToken(t);
    setUserRole(role);
  };

  const handleLogout = () => {
    setToken(null);
    setUserRole(null);
    setShowChangePassword(false);
    setShowChangeUsername(false);
    sessionStorage.clear();
  };

  // ── Route guards ──
  const RequireAuth = ({ children }) => {
    if (!token) return <Navigate to="/login" replace />;
    return children;
  };

  const RequireGuest = ({ children }) => {
    if (token) {
      if (userRole === "DRIVER")  return <Navigate to="/driver"  replace />;
      if (userRole === "SPONSOR") return <Navigate to="/sponsor" replace />;
      if (userRole === "ADMIN")   return <Navigate to="/admin"   replace />;
      return <Navigate to="/mfa" replace />;
    }
    return children;
  };

  return (
    <Routes>

      {/* ── Public / guest routes ── */}
      <Route path="/login" element={
        <RequireGuest>
          <LoginPage onLogin={handleLogin} dark={dark} onToggleDark={toggleDark} />
        </RequireGuest>
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

      {/* ── MFA (logged in, pre-dashboard) ── */}
      <Route path="/mfa" element={
        <RequireAuth>
          <MFAPage
            token={token}
            userRole={userRole}
            onLogout={handleLogout}
            dark={dark}
            onToggleDark={toggleDark}
          />
        </RequireAuth>
      } />

      {/* ── Driver dashboard ── */}
      <Route path="/driver" element={
        <RequireAuth>
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
        </RequireAuth>
      } />

      {/* ── Sponsor dashboard ── */}
      <Route path="/sponsor" element={
        <RequireAuth>
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
        </RequireAuth>
      } />

      {/* ── Catch-all redirect ── */}
      <Route path="*" element={
        token
          ? userRole === "DRIVER"  ? <Navigate to="/driver"  replace />
          : userRole === "SPONSOR" ? <Navigate to="/sponsor" replace />
          : userRole === "ADMIN"   ? <Navigate to="/admin"   replace />
          : <Navigate to="/mfa"   replace />
          : <Navigate to="/login" replace />
      } />

    </Routes>
  );
}