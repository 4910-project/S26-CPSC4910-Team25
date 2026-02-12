import React, { useState } from "react";
import "../login.css";
import { useNavigate } from 'react-router-dom';

const API_BASE = "http://localhost:8001/auth";

export default function ForgotUsername() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMsg("");

    try {
        await fetch(`${API_BASE}/forgot-username`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
    });

    }catch {
        setError("An error occurred. Please try again");
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="login-container">
        <div className="login-card">
            <h2>Recover Username</h2>

            <form onSubmit={handleSubmit} className="login-form">
                <input
                    type="email"
                    placeholder="Enter email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    aria-label="Email"
                />

                <button type="submit" disabled={loading} className="submit-btn">
                    {loading ? "Sending" : "Send username"}
                </button>
            </form>

            <button
                type="button"
                className="toggle-link"
                onClick={() => navigate("/login")}
                style={{ marginTop: 12 }}
            >
                Back to login
            </button>
        </div>
    </div>
  );
}


  