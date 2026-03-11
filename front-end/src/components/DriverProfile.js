import React, { useEffect, useState, useCallback } from "react";
import ConfirmModal from "../components/ConfirmModal";
import SponsorshipApply from "./SponsorshipApply";
import FeedbackForm from "./feedbackForm";

const API_BASE = "http://localhost:8001/api";

// ── Star rating component ─────────────────────────────────────────────────
function StarRating({ value, onChange, readOnly = false }) {
  const [hovered, setHovered] = useState(0);

  return (
    <div style={{ display: "flex", gap: 4 }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => !readOnly && onChange(star)}
          onMouseEnter={() => !readOnly && setHovered(star)}
          onMouseLeave={() => !readOnly && setHovered(0)}
          style={{
            background: "none",
            border: "none",
            cursor: readOnly ? "default" : "pointer",
            fontSize: 22,
            padding: 0,
            color: star <= (hovered || value) ? "#f59e0b" : "#d1d5db",
            transition: "color 0.1s",
          }}
        >
          ★
        </button>
      ))}
    </div>
  );
}

export default function DriverProfile({ token, onLogout, onChangePassword, onChangeUsername }) {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [points, setPoints] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [showDropModal, setShowDropModal] = useState(false);

  // Notification settings state
  const [notifyPointsAdded, setNotifyPointsAdded] = useState(true);
  const [notifyPointsRemoved, setNotifyPointsRemoved] = useState(true);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifSaving, setNotifSaving] = useState(false);
  const [notifMessage, setNotifMessage] = useState("");

  const [pointsExpireDays, setPointsExpireDays] = useState(null);
  const [expirationLoading, setExpirationLoading] = useState(false);

  // Sponsors tab state
  const [sponsors, setSponsors] = useState([]);
  const [sponsorLoading, setSponsorLoading] = useState(false);
  const [sponsorError, setSponsorError] = useState("");
  const [sponsorSuccess, setSponsorSuccess] = useState("");
  const [reviewForm, setReviewForm] = useState({});
  const [submitting, setSubmitting] = useState({});
  const [expanded, setExpanded] = useState(null);
  const [applications, setApplications] = useState([]);
  const [driverStatus, setDriverStatus] = useState(null);

  // ── Points fetch ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;

    (async () => {
      setLoading(true);
      setErr("");

      try {
        const res = await fetch(`${API_BASE}/driver/points`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) throw new Error("Points endpoint not available yet.");

        const data = await res.json();
        setPoints(typeof data.points === "number" ? data.points : 0);
      } catch (e) {
        setPoints(null);
        setErr(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  // ── Notification settings fetch ──────────────────────────────────────────
  useEffect(() => {
    if (!token) return;

    (async () => {
      setNotifLoading(true);
      try {
        const res = await fetch(`${API_BASE}/driver/notification-settings`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const data = await res.json();

        if (res.ok) {
          setNotifyPointsAdded(!!data.notify_points_added);
          setNotifyPointsRemoved(!!data.notify_points_removed);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setNotifLoading(false);
      }
    })();
  }, [token]);

  async function saveNotificationPreferences(updatedAdded, updatedRemoved) {
    setNotifSaving(true);
    setNotifMessage("");

    try {
      const res = await fetch(`${API_BASE}/driver/notification-settings`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          notify_points_added: updatedAdded,
          notify_points_removed: updatedRemoved,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to update notification setting");
      }

      setNotifyPointsAdded(updatedAdded);
      setNotifyPointsRemoved(updatedRemoved);
      setNotifMessage("Notification preferences updated.");
    } catch (err) {
      console.error(err);
      setNotifMessage(err.message);
    } finally {
      setNotifSaving(false);
    }
  }

  // ── Drop sponsor ──────────────────────────────────────────────────────────
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
      onLogout();
    } catch (err) {
      alert(err.message);
    }
  }

  // ── Sponsors fetch ────────────────────────────────────────────────────────
  const fetchSponsors = useCallback(async () => {
    setSponsorLoading(true);
    setSponsorError("");

    try {
      const res = await fetch(`${API_BASE}/driver/sponsors`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch sponsors");

      const list = data.sponsors || [];
      setSponsors(list);

      const seed = {};
      list.forEach((s) => {
        seed[s.sponsorId] = {
          rating: s.myRating || 0,
          comment: s.myComment || "",
        };
      });
      setReviewForm(seed);
    } catch (err) {
      setSponsorError(err.message);
    } finally {
      setSponsorLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (activeTab === "sponsors") fetchSponsors();
  }, [activeTab, fetchSponsors]);

  const handleReviewSubmit = async (sponsorId) => {
    const form = reviewForm[sponsorId] || {};
    if (!form.rating) {
      setSponsorError("Please select a star rating before submitting.");
      return;
    }

    setSponsorError("");
    setSponsorSuccess("");
    setSubmitting((prev) => ({ ...prev, [sponsorId]: true }));

    try {
      const res = await fetch(`${API_BASE}/driver/sponsors/${sponsorId}/review`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ rating: form.rating, comment: form.comment }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save review");

      setSponsorSuccess("Review saved!");
      setExpanded(null);
      fetchSponsors();
    } catch (err) {
      setSponsorError(err.message);
    } finally {
      setSubmitting((prev) => ({ ...prev, [sponsorId]: false }));
    }
  };

  // Applications fetch
  useEffect(() => {
    if (!token) return;

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/driver/applications`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (res.ok) setApplications(data.applications || []);
      } catch (err) {
        console.error(err);
      }
    })();
  }, [token]);

  // Driver status fetch
  useEffect(() => {
    if (!token) return;

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/driver/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (res.ok) setDriverStatus(data.driver);
      } catch (err) {
        console.error(err);
      }
    })();
  }, [token]);


  useEffect(() => {
  if (!token) return;

  (async () => {
    setExpirationLoading(true);
    try {
      const res = await fetch(`${API_BASE}/driver/points-expiration-policy`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();

      if (res.ok) {
        setPointsExpireDays(data.points_expire_days);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setExpirationLoading(false);
    }
  })();
}, [token]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 900, margin: "30px auto", padding: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
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

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginTop: 24, marginBottom: 24 }}>
        {["dashboard", "sponsors", "feedback"].map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            style={{
              padding: "8px 18px",
              borderRadius: 8,
              border: "1px solid var(--border, #d1d5db)",
              background: activeTab === tab ? "#4f46e5" : "transparent",
              color: activeTab === tab ? "#fff" : "inherit",
              fontWeight: 600,
              cursor: "pointer",
              textTransform: "capitalize",
            }}
          >
            {tab === "dashboard"
              ? "Dashboard"
              : tab === "sponsors"
              ? "Sponsor Reviews"
              : "Help & Feedback"}
          </button>
        ))}
      </div>

      {/* ── Dashboard tab ── */}
      {activeTab === "dashboard" && (
        <>
          {applications.filter((a) => a && a.status === "REJECTED").map((a) => (
            <div
              key={a.applicationId}
              style={{
                background: "#fef2f2",
                border: "1px solid #fca5a5",
                borderRadius: 10,
                padding: "12px 16px",
                marginBottom: 12,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ fontWeight: 700, color: "#991b1b", fontSize: 14 }}>
                  ❌ Application Rejected - {a.sponsorName}
                </div>
                {a.decisionMessage && (
                  <div style={{ color: "#b91c1c", fontSize: 13, marginTop: 4 }}>
                    Reason: {a.decisionMessage}
                  </div>
                )}
              </div>
            </div>
          ))}

          {driverStatus?.status === "DROPPED" && (
            <div
              style={{
                background: "#fef2f2",
                border: "1px solid #fca5a5",
                borderRadius: 10,
                padding: "12px 16px",
                marginBottom: 12,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ fontWeight: 700, color: "#991b1b", fontSize: 14 }}>
                  ❌ You have been dropped from {driverStatus.sponsorName}
                </div>
                {driverStatus.dropped_reason && (
                  <div style={{ color: "#b91c1c", fontSize: 13, marginTop: 4 }}>
                    Reason: {driverStatus.dropped_reason}
                  </div>
                )}
              </div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
            <div style={card}>
              <div style={{ color: "var(--muted)", fontSize: 12 }}>Current Points</div>
              {loading ? (
                <div style={{ marginTop: 10, color: "var(--muted)" }}>Loading…</div>
              ) : err ? (
                <div style={{ marginTop: 10, color: "#b91c1c" }}>{err}</div>
              ) : (
                <div style={{ marginTop: 10, fontSize: 48, fontWeight: 800, letterSpacing: -1 }}>
                  {points}
                </div>
              )}
              <div style={{ marginTop: 10, color: "var(--muted)", fontSize: 13 }}>
                Points reflect your latest approved driving performance events.
              </div>
            </div>

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

            <div style={card}>
              <div style={{ color: "var(--muted)", fontSize: 12 }}>
                Notifications
              </div>

              {notifLoading ? (
                <div style={{ marginTop: 10, color: "var(--muted)" }}>Loading…</div>
              ) : (
                <>
                  <div style={{ marginTop: 10, fontSize: 18, fontWeight: 700 }}>
                    Points Notifications
                  </div>

                  <div style={{ marginTop: 6, color: "var(--muted)", fontSize: 13 }}>
                    Choose when you want to be notified about point changes.
                  </div>

                  <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <input
                        type="checkbox"
                        checked={notifyPointsAdded}
                        onChange={(e) =>
                          saveNotificationPreferences(e.target.checked, notifyPointsRemoved)
                        }
                        disabled={notifSaving}
                      />
                      Notify me when points are added
                    </label>

                    <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <input
                        type="checkbox"
                        checked={notifyPointsRemoved}
                        onChange={(e) =>
                          saveNotificationPreferences(notifyPointsAdded, e.target.checked)
                        }
                        disabled={notifSaving}
                      />
                      Notify me when points are removed
                    </label>
                  </div>

                  {notifMessage && (
                    <div style={{ marginTop: 10, fontSize: 12, color: "var(--muted)" }}>
                      {notifMessage}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          <div style={{ ...card, marginTop: 14 }}>
            <div style={{ color: "var(--muted)", fontSize: 12, marginBottom: 14 }}>
              Available Sponsorships
            </div>
            <SponsorshipApply token={token} />
          </div>
        </>
      )}

      {/* ── Sponsors tab ── */}
      {activeTab === "sponsors" && (
        <div>
          <h2 style={{ marginBottom: 4 }}>Sponsor Reviews</h2>
          <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 0, marginBottom: 20 }}>
            Rate and review your sponsors. Only you can see your own reviews.
          </p>

          {sponsorError && (
            <div
              style={{
                padding: "10px 14px",
                borderRadius: 8,
                background: "#fef2f2",
                color: "#991b1b",
                marginBottom: 12
              }}
            >
              {sponsorError}
            </div>
          )}

          {sponsorSuccess && (
            <div
              style={{
                padding: "10px 14px",
                borderRadius: 8,
                background: "#ecfdf5",
                color: "#065f46",
                marginBottom: 12
              }}
            >
              ✓ {sponsorSuccess}
            </div>
          )}

          {sponsorLoading && <p style={{ color: "var(--muted)" }}>Loading sponsors…</p>}

          {!sponsorLoading && sponsors.length === 0 && (
            <p style={{ color: "var(--muted)" }}>No active sponsors found.</p>
          )}

          {!sponsorLoading &&
            sponsors.map((s) => {
              const form = reviewForm[s.sponsorId] || { rating: 0, comment: "" };
              const isOpen = expanded === s.sponsorId;
              const hasReview = !!s.myRating;

              return (
                <div key={s.sponsorId} style={{ ...card, marginBottom: 14 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: 12
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 16 }}>{s.sponsorName}</div>
                      {s.address && (
                        <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 2 }}>
                          📍 {s.address}
                        </div>
                      )}
                      {s.contactName && (
                        <div style={{ color: "var(--muted)", fontSize: 13 }}>
                          👤 {s.contactName}
                        </div>
                      )}
                      {s.contactEmail && (
                        <div style={{ color: "var(--muted)", fontSize: 13 }}>
                          ✉️ {s.contactEmail}
                        </div>
                      )}
                      {s.contactPhone && (
                        <div style={{ color: "var(--muted)", fontSize: 13 }}>
                          📞 {s.contactPhone}
                        </div>
                      )}
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                      {hasReview && !isOpen && (
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                          <StarRating value={s.myRating} readOnly />
                          <span style={{ fontSize: 11, color: "var(--muted)" }}>Your rating</span>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setExpanded(isOpen ? null : s.sponsorId);
                          setSponsorError("");
                          setSponsorSuccess("");
                        }}
                        style={{
                          padding: "6px 14px",
                          borderRadius: 8,
                          border: "1px solid var(--border, #d1d5db)",
                          background: isOpen ? "#f3f4f6" : "#4f46e5",
                          color: isOpen ? "inherit" : "#fff",
                          fontWeight: 600,
                          fontSize: 13,
                          cursor: "pointer",
                        }}
                      >
                        {isOpen ? "Cancel" : hasReview ? "Edit Review" : "Write Review"}
                      </button>
                    </div>
                  </div>

                  {isOpen && (
                    <div style={{ marginTop: 16, borderTop: "1px solid var(--border, #e5e7eb)", paddingTop: 16 }}>
                      <div style={{ marginBottom: 10 }}>
                        <label
                          style={{
                            fontWeight: 600,
                            fontSize: 14,
                            display: "block",
                            marginBottom: 6
                          }}
                        >
                          Your Rating *
                        </label>
                        <StarRating
                          value={form.rating}
                          onChange={(val) =>
                            setReviewForm((prev) => ({
                              ...prev,
                              [s.sponsorId]: { ...form, rating: val }
                            }))
                          }
                        />
                      </div>

                      <div style={{ marginBottom: 12 }}>
                        <label
                          style={{
                            fontWeight: 600,
                            fontSize: 14,
                            display: "block",
                            marginBottom: 6
                          }}
                        >
                          Comments (optional)
                        </label>
                        <textarea
                          rows={3}
                          placeholder="Share your experience with this sponsor..."
                          value={form.comment}
                          onChange={(e) =>
                            setReviewForm((prev) => ({
                              ...prev,
                              [s.sponsorId]: { ...form, comment: e.target.value }
                            }))
                          }
                          style={{
                            width: "100%",
                            padding: "8px 10px",
                            borderRadius: 8,
                            border: "1px solid var(--border, #d1d5db)",
                            fontSize: 14,
                            resize: "vertical",
                            background: "var(--card)",
                            color: "var(--text)",
                            boxSizing: "border-box",
                          }}
                        />
                      </div>

                      <button
                        type="button"
                        disabled={submitting[s.sponsorId]}
                        onClick={() => handleReviewSubmit(s.sponsorId)}
                        style={{
                          padding: "8px 20px",
                          borderRadius: 8,
                          border: "none",
                          background: "#4f46e5",
                          color: "#fff",
                          fontWeight: 700,
                          cursor: submitting[s.sponsorId] ? "not-allowed" : "pointer",
                          opacity: submitting[s.sponsorId] ? 0.6 : 1,
                        }}
                      >
                        {submitting[s.sponsorId] ? "Saving…" : "Submit Review"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      )}

      <div style={card}>
  <div style={{ color: "var(--muted)", fontSize: 12 }}>
    Points Expiration
  </div>

  {expirationLoading ? (
    <div style={{ marginTop: 10, color: "var(--muted)" }}>Loading…</div>
  ) : pointsExpireDays === null ? (
    <>
      <div style={{ marginTop: 10, fontSize: 18, fontWeight: 700 }}>
        Points do not expire
      </div>
      <div style={{ marginTop: 6, color: "var(--muted)", fontSize: 13 }}>
        Your sponsor currently does not set an expiration period for points.
      </div>
    </>
  ) : (
    <>
      <div style={{ marginTop: 10, fontSize: 18, fontWeight: 700 }}>
        {pointsExpireDays} day expiration
      </div>
      <div style={{ marginTop: 6, color: "var(--muted)", fontSize: 13 }}>
        Points expire {pointsExpireDays} days after they are awarded.
      </div>
    </>
  )}
</div>

      {/* ── Feedback tab ── */}
      {activeTab === "feedback" && <FeedbackForm token={token} />}

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