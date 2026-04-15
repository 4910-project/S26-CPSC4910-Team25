import React, { useEffect, useState } from "react";
import "./MFASettings.css";

const API_BASE = "/api";

const MFA_OPTIONS = [
  {
    key: "email",
    icon: "✉️",
    label: "Email",
    description: "Receive a verification code to your email address.",
  },
  {
    key: "sms",
    icon: "💬",
    label: "SMS",
    description: "Get a text message with a code sent to your phone.",
  },
  {
    key: "totp",
    icon: "🔐",
    label: "Authenticator App",
    description: "Use a time-based code from an app like Google Authenticator.",
  },
];

export default function MFASettings({ token, onBack, onLogout, onContinue }) {
  const [modes, setModes] = useState({ email: true, sms: false, totp: false });
  const [status, setStatus] = useState({ type: "", message: "" });
  const [loading, setLoading] = useState(false);

  const selectedCount = Object.values(modes).filter(Boolean).length;

  const toggleMode = (key) => {
    setModes((prev) => ({ ...prev, [key]: !prev[key] }));
    setStatus({ type: "", message: "" });
  };

  // Load saved preferences
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
            sms:   data.modes.includes("sms"),
            totp:  data.modes.includes("totp"),
          });
        }
      } catch {
        // ignore — default selection is fine
      }
    })();
  }, [token]);

  const handleSave = async () => {
    setStatus({ type: "", message: "" });

    if (selectedCount === 0) {
      setStatus({ type: "error", message: "Please select at least one MFA method." });
      return;
    }

    setLoading(true);
    try {
      const selected = Object.entries(modes)
        .filter(([, v]) => v)
        .map(([k]) => k);

      const res = await fetch(`${API_BASE}/mfa`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ modes: selected }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Couldn't save MFA preferences.");

      setStatus({ type: "success", message: "Preferences saved! Taking you to your dashboard…" });
      setTimeout(() => { if (onContinue) onContinue(); }, 900);
    } catch (e) {
      setStatus({ type: "error", message: e.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mfa-wrapper">
      <div className="mfa-card">

        {/* Header */}
        <div className="mfa-header">
          <div className="mfa-icon">🛡️</div>
          <h2 className="mfa-title">Secure Your Account</h2>
          <p className="mfa-subtitle">
            Choose how you'd like to verify your identity when logging in.
          </p>
        </div>

        {/* Step indicator */}
        <div className="mfa-steps">
          <div className="mfa-step mfa-step--done">
            <span className="mfa-step__dot">✓</span>
            <span>Log in</span>
          </div>
          <div className="mfa-step-line" />
          <div className="mfa-step mfa-step--active">
            <span className="mfa-step__dot">2</span>
            <span>Set up MFA</span>
          </div>
          <div className="mfa-step-line" />
          <div className="mfa-step">
            <span className="mfa-step__dot">3</span>
            <span>Dashboard</span>
          </div>
        </div>

        {/* Options */}
        <div className="mfa-options">
          {MFA_OPTIONS.map(({ key, icon, label, description }) => (
            <button
              key={key}
              type="button"
              className={`mfa-option ${modes[key] ? "mfa-option--selected" : ""}`}
              onClick={() => toggleMode(key)}
              aria-pressed={modes[key]}
            >
              <span className="mfa-option__icon">{icon}</span>
              <span className="mfa-option__text">
                <span className="mfa-option__label">{label}</span>
                <span className="mfa-option__desc">{description}</span>
              </span>
              <span className="mfa-option__check">
                {modes[key] ? "✓" : ""}
              </span>
            </button>
          ))}
        </div>

        {/* Status message */}
        {status.message && (
          <div className={`mfa-status mfa-status--${status.type}`}>
            {status.type === "success" ? "✓ " : "⚠ "}{status.message}
          </div>
        )}

        {/* Actions */}
        <div className="mfa-actions">
          <button
            type="button"
            className="mfa-btn mfa-btn--primary"
            onClick={handleSave}
            disabled={loading || selectedCount === 0}
          >
            {loading ? "Saving…" : "Save & Continue →"}
          </button>
        </div>

        <p className="mfa-hint">
          {selectedCount === 0
            ? "Select at least one method to continue."
            : `${selectedCount} method${selectedCount > 1 ? "s" : ""} selected.`}
        </p>

      </div>
    </div>
  );
}