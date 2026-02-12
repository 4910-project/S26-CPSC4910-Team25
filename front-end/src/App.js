import "./App.css";
import React, { useState } from "react";
import Login from "./login.js";
import MFASettings from "./MFASettings";
import DriverProfile from "./components/DriverProfile";
import SponsorProfile from "./components/SponsorProfile";
import PasswordReset from "./components/PasswordReset";
import ChangePassword from "./components/ChangePassword";

function App() {
  const [token, setToken] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [screen, setScreen] = useState("login"); 
  // Screens: "login", "mfa", "driver-profile", "sponsor-profile", "reset-password"
  const [showChangePassword, setShowChangePassword] = useState(false);

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
  };

  const handleMFAComplete = () => {
    if (userRole === "DRIVER") {
      setScreen("driver-profile");
    } else if (userRole === "SPONSOR") {
      setScreen("sponsor-profile");
    } else {
      setScreen("driver-profile"); // fallback
    }
  };

  /* -------------------- SCREEN FLOW -------------------- */

  // Password Reset (not logged in)
  if (screen === "reset-password") {
    return <PasswordReset onBack={() => setScreen("login")} />;
  }

  // Not logged in → show Login
  if (!token) {
    return (
      <Login
        onLogin={handleLogin}
        onForgotPassword={() => setScreen("reset-password")}
      />
    );
  }

  // MFA Screen (logged in, before profile)
  if (screen === "mfa") {
    return (
      <MFASettings
        token={token}
        onBack={() => setScreen("login")}
        onLogout={handleLogout}
        onContinue={handleMFAComplete} 
      />
    );
  }

  // Driver Profile
  if (screen === "driver-profile" && userRole === "DRIVER") {
    return (
      <>
        <DriverProfile
          token={token}
          onLogout={handleLogout}
          onChangePassword={() => setShowChangePassword(true)}
        />
        {showChangePassword && (
          <ChangePassword
            token={token}
            onClose={() => setShowChangePassword(false)}
          />
        )}
      </>
    );
  }

  // Sponsor Profile
  if (screen === "sponsor-profile" && userRole === "SPONSOR") {
    return (
      <>
        <SponsorProfile
          token={token}
          onLogout={handleLogout}
          onChangePassword={() => setShowChangePassword(true)}
        />
        {showChangePassword && (
          <ChangePassword
            token={token}
            onClose={() => setShowChangePassword(false)}
          />
        )}
      </>
    );
  }

  // Fallback (shouldn't happen)
  return <Login onLogin={handleLogin} />;
}

export default App;


/*
import "./App.css";
import React, { useState } from "react";
import Login from "./login.js";
import MFASettings from "./MFASettings";

function App() {
  const [token, setToken] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [screen, setScreen] = useState("login"); 
  


  const handleLogin = (t) => {
    console.log("Logged in token:", t);
    setToken(t);
    setScreen("mfa"); 
  };

  const handleLogout = () => {
    setToken(null);
    setScreen("login");
  };

  if (!token) {
    return <Login onLogin={handleLogin} />;
  }

  if (screen === "mfa") {
    return (
      <MFASettings
        token={token}
        onBack={() => setScreen("login")}
        onLogout={handleLogout}
      />
    );
  }

  return <Login onLogin={handleLogin} />;
}

export default App;
*/