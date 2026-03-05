import React, { useEffect, useMemo, useState } from "react";

const API_BASE = "http://localhost:8001";

export default function SponsorRiskDashboard({ token, onBack }) {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [query, setQuery] = useState("");

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch(`${API_BASE}/sponsor/risk-dashboard`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || data.message || "Failed to load risk dashboard");

      setDrivers(Array.isArray(data.drivers) ? data.drivers : []);
    } catch (e) {
      console.error(e);
      setErr(e.message);
      setDrivers([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (token) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return drivers;
    return drivers.filter((d) => {
      const name = String(d.name || "").toLowerCase();
      const email = String(d.email || "").toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [drivers, query]);

  function badgeStyle(label) {
    if (label === "High") return { ...badge, background: "#fee2e2", borderColor: "#fecaca", color: "#991b1b" };
    if (label === "Medium") return { ...badge, background: "#fef3c7", borderColor: "#fde68a", color: "#92400e" };
    return { ...badge, background: "#dcfce7", borderColor: "#86efac", color: "#166534" };
  }

  return (
    <div style={{ maxWidth: 1000, margin: "40px auto", padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>Risk Dashboard</h2>
          <div style={{ marginTop: 6, color: "#6b7280" }}>
            Drivers and pending applicants sorted by risk score (highest first).
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={load} style={btnSecondary} type="button">
            Refresh
          </button>
          <button onClick={onBack} style={btnSecondary} type="button">
            Back
          </button>
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or email…"
          style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
        />
      </div>

      <div style={{ marginTop: 16 }}>
        {loading ? (
          <div style={{ color: "#6b7280" }}>Loading…</div>
        ) : err ? (
          <div style={{ color: "#b91c1c" }}>{err}</div>
        ) : filtered.length === 0 ? (
          <div style={{ color: "#6b7280" }}>No drivers found.</div>
        ) : (
          <table width="100%" cellPadding="10" style={{ borderCollapse: "collapse", marginTop: 10 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>
                <th>Driver</th>
                <th>Email</th>
                <th>Status</th>
                <th>Risk</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d, idx) => (
                <tr key={`${d.driverUserId || "pending"}-${idx}`} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td>{d.name}</td>
                  <td>{d.email}</td>
                  <td style={{ textTransform: "capitalize" }}>{d.status}</td>
                  <td>
                    <span style={badgeStyle(d.riskLabel)}>{d.riskLabel}</span>
                  </td>
                  <td style={{ fontWeight: 700 }}>{d.riskScore}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const btnSecondary = {
  border: "1px solid #e5e7eb",
  background: "white",
  borderRadius: 10,
  padding: "8px 12px",
  cursor: "pointer",
};

const badge = {
  display: "inline-block",
  padding: "4px 10px",
  borderRadius: 999,
  border: "1px solid",
  fontSize: 12,
  fontWeight: 700,
};