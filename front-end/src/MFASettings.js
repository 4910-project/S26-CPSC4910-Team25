import React, { useEffect, useState } from "react";

const API_BASE = "http://localhost:8001/api"; // same base as login.js

export default function MFASettings({ token, onBack, onLogout }) {
  const [modes, setModes] = useState({
    email: true,
    sms: false,
    totp: false, // optional: authenticator app
  });

  const [status, setStatus] = useState({ type: "", message: "" });
  const [loading, setLoading] = useState(false);

  const selectedCount = Object.values(modes).filter(Boolean).length;

  const toggleMode = (key) => {
    setModes((prev) => ({ ...prev, [key]: !prev[key] }));
    setStatus({ type: "", message: "" });
  };

  // Load saved preferences (works once backend exists; fails quietly for now)
  useEffect(() => {
    if (!token) return;

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/mfa`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;

        const data = await res.json();
        if (Array.isArray(data?.modes)) {
          setModes({
            email: data.modes.includes("email"),
            sms: data.modes.includes("sms"),
            totp: data.modes.includes("totp"),
          });
        }
      } catch {
        // ignore until backend is ready
      }
    })();
  }, [token]);

  const handleSave = async () => {
    setStatus({ type: "", message: "" });

    if (selectedCount === 0) {
      setStatus({ type: "error", message: "Select at least one MFA method." });
      return;
    }

    setLoading(true);
    try {
      const selected = Object.entries(modes)
        .filter(([_, v]) => v)
        .map(([k]) => k);

      const res = await fetch(`${API_BASE}/mfa`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ modes: selected }),
      });

      if (!res.ok) {
        throw new Error("Couldn’t save yet (backend not connected).");
      }

      setStatus({ type: "success", message: "MFA preferences saved." });
    } catch (e) {
      setStatus({ type: "error", message: e.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 420, margin: "40px auto", padding: 20 }}>
      <h2 style={{ marginBottom: 8 }}>MFA Settings</h2>
      <p style={{ marginTop: 0, color: "#6b7280" }}>
        Choose how you want to receive verification codes.
      </p>

      <div style={{ display: "grid", gap: 10, marginTop: 18 }}>
        <label style={rowStyle}>
          <input
            type="checkbox"
            checked={modes.email}
            onChange={() => toggleMode("email")}
          />
          <span>
            <b>Email</b>
            <div style={subStyle}>Send codes to your email.</div>
          </span>
        </label>

        <label style={rowStyle}>
          <input
            type="checkbox"
            checked={modes.sms}
            onChange={() => toggleMode("sms")}
          />
          <span>
            <b>SMS</b>
            <div style={subStyle}>Text message codes to your phone.</div>
          </span>
        </label>

        <label style={rowStyle}>
          <input
            type="checkbox"
            checked={modes.totp}
            onChange={() => toggleMode("totp")}
          />
          <span>
            <b>Authenticator app</b>
            <div style={subStyle}>Use a code from an authenticator app.</div>
          </span>
        </label>
      </div>

      {status.message && (
        <div
          style={{
            marginTop: 14,
            padding: 10,
            borderRadius: 8,
            background: status.type === "success" ? "#ecfdf5" : "#fef2f2",
            color: status.type === "success" ? "#065f46" : "#991b1b",
          }}
        >
          {status.message}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
        <button onClick={onBack} type="button" style={btnSecondary}>
          Back
        </button>

        <button onClick={onLogout} type="button" style={btnSecondary}>
          Log out
        </button>

        <button
          onClick={handleSave}
          type="button"
          disabled={loading}
          style={btnPrimary}
        >
          {loading ? "Saving…" : "Save"}
        </button>
      </div>

      <div style={{ marginTop: 10, color: "#6b7280", fontSize: 12 }}>
        Selected: {selectedCount}
      </div>
    </div>
  );
}

const rowStyle = {
  display: "flex",
  gap: 10,
  alignItems: "flex-start",
  padding: 12,
  border: "1px solid #e5e7eb",
  borderRadius: 10,
};

const subStyle = { color: "#6b7280", fontSize: 12, marginTop: 2 };

const btnPrimary = {
  flex: 1,
  padding: "10px 12px",
  borderRadius: 10,
  border: "none",
  cursor: "pointer",
};

const btnSecondary = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #e5e7eb",
  background: "white",
  cursor: "pointer",
};

