import "./App.css";
import React, { useState } from "react";
import Login from "./login.js";
import MFASettings from "./MFASettings";

function App() {
  const [token, setToken] = useState(null);
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
