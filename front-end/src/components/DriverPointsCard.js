import React, { useEffect, useState } from "react";
import "./DriverPointsCard.css";

// ✅ Change this if your API base differs
const API_BASE = "http://localhost:8001";

export default function DriverPointsCard({ token }) {
  const [points, setPoints] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!token) return;

    const controller = new AbortController();

    async function loadPoints() {
      setLoading(true);
      setErr("");

      try {
        // ✅ Pick ONE endpoint and make backend match it.
        // Recommended: GET /api/driver/points
        const res = await fetch(`${API_BASE}/api/driver/points`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          signal: controller.signal,
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || data.message || "Failed to load points");

        // expected shape: { points: 1234 }
        setPoints(typeof data.points === "number" ? data.points : 0);
      } catch (e) {
        if (e.name !== "AbortError") setErr(e.message || "Failed to load points");
      } finally {
        setLoading(false);
      }
    }

    loadPoints();
    return () => controller.abort();
  }, [token]);

  return (
    <div className="points-card" role="region" aria-label="Current points">
      <div className="points-card__header">
        <h2 className="points-card__title">Current Points</h2>
        <span className="points-card__pill">Driver</span>
      </div>

      {loading ? (
        <p className="points-card__sub">Loading…</p>
      ) : err ? (
        <div className="points-card__error">
          <p>⚠ {err}</p>
          <p className="points-card__sub">Make sure the backend endpoint is running.</p>
        </div>
      ) : (
        <>
          <div className="points-card__value" aria-live="polite">
            {points.toLocaleString()}
          </div>
          <p className="points-card__sub">Available to redeem</p>
        </>
      )}
    </div>
  );
}