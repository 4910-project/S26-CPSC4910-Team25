import React, { useState } from "react";
import "./login.css";

const API_BASE = "http://localhost:8001/api"; // Adjust if needed

export default function Login({ onLogin }) {
  const [isRegister, setIsRegister] = useState(false);
  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
    identifier: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError("");
  };

  const handleSubmit = async (e) => {
  e.preventDefault();
  setError("");
  setLoading(true);

  try {
    if (isRegister) {
      // ====== REGISTER ======
      const { username, email, password } = form;
      if (!username || !email || !password) {
        throw new Error("Username, email, and password are required");
      }

      const res = await fetch(`${API_BASE}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Registration failed");

      // SUCCESS: Show alert, switch to login, reset form
      alert("Account created! Please log in.");
      setIsRegister(false);
      setForm({ username: "", email: "", password: "", identifier: "" });

      // CRITICAL: Stop here — do NOT proceed to login logic
      setLoading(false);
      return; // ← PREVENTS FALL-THROUGH TO LOGIN
    }

    // ====== LOGIN (only runs if not registering) ======
    const { identifier, password } = form;
    if (!identifier || !password) {
      throw new Error("Email/username and password required");
    }

    const res = await fetch(`${API_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Login failed");

    onLogin(data.token);
  } catch (err) {
    setError(err.message);
  } finally {
    setLoading(false);
  }
};

  return (
    <div className="login-container">
      <div className="login-card">
        {/* 🔹 Heading visually shown, hidden from screen readers */}
        <h2 aria-hidden="true">
          {isRegister ? "Create Account" : "Log In"}
        </h2>

        <form onSubmit={handleSubmit} className="login-form">
          {isRegister && (
            <>
              <input
                type="text"
                name="username"
                placeholder="Username"
                value={form.username}
                onChange={handleChange}
                required
                aria-label="Username"
              />
              <input
                type="email"
                name="email"
                placeholder="Email"
                value={form.email}
                onChange={handleChange}
                required
                aria-label="Email"
              />
            </>
          )}

          {!isRegister && (
            <input
              type="text"
              name="identifier"
              placeholder="Email or Username"
              value={form.identifier}
              onChange={handleChange}
              required
              aria-label="Email or Username"
            />
          )}

          <input
            type="password"
            name="password"
            placeholder="Password"
            value={form.password}
            onChange={handleChange}
            required
            aria-label="Password"
          />

          {error && <p className="error">{error}</p>}

          <button type="submit" disabled={loading} className="submit-btn">
            {loading ? "Loading…" : isRegister ? "Register" : "Log In"}
          </button>
        </form>

        <p className="toggle-text">
          {isRegister ? "Already have an account?" : "Don't have an account?"}{" "}
          <button
            type="button"
            className="toggle-link"
            onClick={() => {
              setIsRegister(!isRegister);
              setError("");
              setForm({
                username: "",
                email: "",
                password: "",
                identifier: "",
              });
            }}
          >
            {isRegister ? "Log In" : "Register"}
          </button>
        </p>
      </div>
    </div>
  );
}
