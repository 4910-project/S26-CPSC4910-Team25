import React, { useState } from "react";

//const API_BASE = "/api";

const CATEGORIES = [
  "Bug Report",
  "Feature Request",
  "Points Issue",
  "Account Problem",
  "Sponsor Issue",
  "General Feedback",
  "Other",
];

export default function FeedbackForm({ token, apiBase }) {
  const [category, setCategory] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState({ type: "", text: "" });
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus({ type: "", text: "" });

    if (!category) {
      setStatus({ type: "error", text: "Please select a category." });
      return;
    }
    if (message.trim().length < 10) {
      setStatus({ type: "error", text: "Message must be at least 10 characters." });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/feedback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ category, message: message.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit feedback");

      setSubmitted(true);
      setCategory("");
      setMessage("");
      setStatus({ type: "success", text: data.message });
    } catch (err) {
      setStatus({ type: "error", text: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 580 }}>
      <h2 style={{ marginBottom: 4 }}>Help & Feedback</h2>
      <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 0, marginBottom: 24 }}>
        Have a question, found a bug, or want to suggest an improvement? Let us know below.
      </p>

      {status.text && (
        <div style={{
          padding: "10px 14px",
          borderRadius: 8,
          marginBottom: 16,
          background: status.type === "success" ? "#ecfdf5" : "#fef2f2",
          color: status.type === "success" ? "#065f46" : "#991b1b",
          fontWeight: 500,
        }}>
          {status.type === "success" ? "✓ " : "⚠ "}{status.text}
        </div>
      )}

      {submitted && status.type === "success" ? (
        <div style={{
          border: "1px solid var(--border)",
          borderRadius: 14,
          padding: 32,
          textAlign: "center",
          background: "var(--card)",
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🎉</div>
          <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Thanks for your feedback!</div>
          <div style={{ color: "var(--muted)", fontSize: 14, marginBottom: 20 }}>
            Our team will review your submission shortly.
          </div>
          <button
            type="button"
            onClick={() => { setSubmitted(false); setStatus({ type: "", text: "" }); }}
            style={{
              padding: "8px 20px", borderRadius: 8, border: "none",
              background: "#4f46e5", color: "#fff", fontWeight: 700, cursor: "pointer",
            }}
          >
            Submit Another
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          {/* Category */}
          <div style={{ marginBottom: 18 }}>
            <label style={{ display: "block", fontWeight: 600, fontSize: 14, marginBottom: 6 }}>
              Category *
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              required
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid var(--border, #d1d5db)",
                fontSize: 14,
                background: "var(--card)",
                color: "var(--text)",
                cursor: "pointer",
              }}
            >
              <option value="">— Select a category —</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Message */}
          <div style={{ marginBottom: 18 }}>
            <label style={{ display: "block", fontWeight: 600, fontSize: 14, marginBottom: 6 }}>
              Message *
            </label>
            <textarea
              rows={6}
              placeholder="Describe your issue or suggestion in detail..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid var(--border, #d1d5db)",
                fontSize: 14,
                resize: "vertical",
                background: "var(--card)",
                color: "var(--text)",
                boxSizing: "border-box",
              }}
            />
            <div style={{ textAlign: "right", fontSize: 12, color: message.length > 1800 ? "#dc2626" : "var(--muted)", marginTop: 4 }}>
              {message.length} / 2000
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: "10px 28px",
              borderRadius: 8,
              border: "none",
              background: "#4f46e5",
              color: "#fff",
              fontWeight: 700,
              fontSize: 15,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? "Submitting…" : "Submit Feedback"}
          </button>
        </form>
      )}
    </div>
  );
}