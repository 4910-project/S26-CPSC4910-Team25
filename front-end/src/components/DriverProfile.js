import React, { useEffect, useState } from "react";
import ConfirmModal from "../components/ConfirmModal";

const API_BASE = "http://localhost:8001/api";

export default function DriverProfile({ token, onLogout, onChangePassword, onChangeUsername }) {
  const [points, setPoints] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [showDropModal, setShowDropModal] = useState(false);

  useEffect(() => {
    if (!token) return;

    (async () => {
      setLoading(true);
      setErr("");

      try {
        const res = await fetch(`${API_BASE}/driver/points`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          throw new Error("Points endpoint not available yet.");
        }

        const data = await res.json();
        const p = typeof data.points === "number" ? data.points : 0;
        setPoints(p);
      } catch (e) {
        setPoints(null);
        setErr(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  async function dropSponsor() {
    try {
      const res = await fetch(`${API_BASE}/driver/drop-sponsor`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || data.message || "Failed to drop sponsor");
      }

      setShowDropModal(false);
      onLogout(); // refresh session/token after dropping sponsor
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: "30px auto", padding: 20 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "center",
        }}
      >
        <h1 style={{ margin: 0 }}>Driver Dashboard</h1>

        <div style={{ display: "flex", gap: 10 }}>
          <button style={btnSecondary} onClick={onChangeUsername} type="button">
            Change Username
          </button>
          <button style={btnSecondary} onClick={onChangePassword} type="button">
            Change Password
          </button>

          <button
            style={btnDangerOutline}
            onClick={() => setShowDropModal(true)}
            type="button"
          >
            Drop Sponsor
          </button>

          <button style={btnDanger} onClick={onLogout} type="button">
            Log out
          </button>
        </div>
      </div>

      <div
        style={{
          marginTop: 18,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 14,
        }}
      >
        {/* Current Points Card */}
        <div style={card}>
          <div style={{ color: "var(--muted)", fontSize: 12 }}>Current Points</div>

          {loading ? (
            <div style={{ marginTop: 10, color: "var(--muted)" }}>Loading…</div>
          ) : err ? (
            <div style={{ marginTop: 10, color: "#b91c1c" }}>
              {err}
              <div style={{ marginTop: 8, color: "var(--muted)", fontSize: 12 }}>
                Once backend is ready, create <code>/api/driver/points</code> to return{" "}
                <code>{`{ points: 123 }`}</code>.
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 10, fontSize: 48, fontWeight: 800, letterSpacing: -1 }}>
              {points}
            </div>
          )}

          <div style={{ marginTop: 10, color: "var(--muted)", fontSize: 13 }}>
            Points reflect your latest approved driving performance events.
          </div>
        </div>

        {/* Placeholder cards you can build next */}
        <div style={card}>
          <div style={{ color: "var(--muted)", fontSize: 12 }}>Status</div>
          <div style={{ marginTop: 10, fontSize: 18, fontWeight: 700 }}>Active</div>
          <div style={{ marginTop: 6, color: "var(--muted)", fontSize: 13 }}>
            Add driver status, sponsor, tier, etc.
          </div>
        </div>

        <div style={card}>
          <div style={{ color: "var(--muted)", fontSize: 12 }}>Rewards</div>
          <div style={{ marginTop: 10, fontSize: 18, fontWeight: 700 }}>Coming soon</div>
          <div style={{ marginTop: 6, color: "var(--muted)", fontSize: 13 }}>
            Later: catalog + redeem flow.
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      <ConfirmModal
        open={showDropModal}
        title="Drop Sponsor?"
        message="You will be removed from your sponsor’s program. This may affect your points and eligibility. Are you sure you want to continue?"
        onCancel={() => setShowDropModal(false)}
        onConfirm={dropSponsor}
      />
    </div>
  );
}

const card = {
  border: "1px solid var(--border)",
  background: "var(--card)",
  color: "var(--text)",
  borderRadius: 14,
  padding: 16,
  boxShadow: "0 10px 25px rgba(0,0,0,0.08)",
};

const btnSecondary = {
  border: "1px solid var(--border)",
  background: "var(--card)",
  color: "var(--text)",
  borderRadius: 10,
  padding: "8px 12px",
  cursor: "pointer",
};

const btnDanger = {
  border: "1px solid #ef4444",
  background: "#ef4444",
  color: "white",
  borderRadius: 10,
  padding: "8px 12px",
  cursor: "pointer",
};

const btnDangerOutline = {
  border: "1px solid #ef4444",
  background: "transparent",
  color: "#ef4444",
  borderRadius: 10,
  padding: "8px 12px",
  cursor: "pointer",
};