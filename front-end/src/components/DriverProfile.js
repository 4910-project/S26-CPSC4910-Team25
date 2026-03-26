import React, { useEffect, useState, useCallback } from "react";
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

function formatEventDate(isoString) {
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return "Unknown date";
  return d.toLocaleString();
}

export default function DriverProfile({ token, onLogout, onChangePassword, onChangeUsername }) {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [points, setPoints] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [pointHistory, setPointHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [csvDownloading, setCsvDownloading] = useState(false);

  // Sponsors tab state
  const [sponsors, setSponsors] = useState([]);
  const [sponsorLoading, setSponsorLoading] = useState(false);
  const [sponsorError, setSponsorError] = useState("");
  const [sponsorSuccess, setSponsorSuccess] = useState("");
  const [reviewForm, setReviewForm] = useState({});
  const [submitting, setSubmitting] = useState({});
  const [expanded, setExpanded] = useState(null);
  const [applications, setApplications] = useState([null]);
  const [driverStatus, setDriverStatus] = useState(null);

  // Notifications / DND
  const [dndEnabled, setDndEnabled] = useState(false);
  const [dndSaving, setDndSaving] = useState(false);
  const [dismissedIds, setDismissedIds] = useState([]);
  const [droppedDismissed, setDroppedDismissed] = useState(false);

  // Cart state
  const [cartItems, setCartItems] = useState([]);
  const [cartLoading, setCartLoading] = useState(false);
  const [cartError, setCartError] = useState("");
  const [cartSuccess, setCartSuccess] = useState("");
  const [removingIds, setRemovingIds] = useState(new Set());

  // Hidden products state
  const [hiddenProducts, setHiddenProducts] = useState([]);
  const [hiddenLoading, setHiddenLoading] = useState(false);
  const [unhidingIds, setUnhidingIds] = useState(new Set());

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

  // -- Point history fetch ----
  useEffect(() => {
    if (!token) return;
    (async () => {
      setHistoryLoading(true);
      setHistoryError("");
      try {
        const res = await fetch(`${API_BASE}/driver/point-history`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load point history");
        setPointHistory(Array.isArray(data.history) ? data.history : []);
      } catch (e) {
        setPointHistory([]);
        setHistoryError(e.message || "Failed to load point history");
      } finally {
        setHistoryLoading(false);
      }
    })();
  }, [token]);

  // -- DND preference fetch ----
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/driver/preferences`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (res.ok) setDndEnabled(!!data.dnd_enabled);
      } catch (err) {
        console.error(err);
      }
    })();
  }, [token]);

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

  // ── Cart fetch ────────────────────────────────────────────────────────────
  const fetchCart = useCallback(async () => {
    if (!token) return;
    setCartLoading(true);
    setCartError("");
    try {
      const res = await fetch(`${API_BASE}/driver/cart`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch cart");
      setCartItems(data.cartItems || []);
    } catch (err) {
      setCartError(err.message);
    } finally {
      setCartLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (activeTab === "cart") fetchCart();
  }, [activeTab, fetchCart]);

  // ── Hidden products fetch (loads when settings tab opens) ─────────────────
  const fetchHiddenProducts = useCallback(async () => {
    if (!token) return;
    setHiddenLoading(true);
    try {
      const res = await fetch(`${API_BASE}/driver/my-hidden`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) setHiddenProducts(data.hiddenProducts || []);
    } catch (err) {
      console.error(err);
    } finally {
      setHiddenLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (activeTab === "settings") fetchHiddenProducts();
  }, [activeTab, fetchHiddenProducts]);

  // ── Unhide a product ──────────────────────────────────────────────────────
  const handleUnhide = async (productId) => {
    setUnhidingIds((prev) => new Set([...prev, productId]));
    try {
      const res = await fetch(`${API_BASE}/driver/my-hidden/${encodeURIComponent(productId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to unhide");
      setHiddenProducts((prev) => prev.filter((p) => p.product_id !== productId));
    } catch (err) {
      console.error(err);
    } finally {
      setUnhidingIds((prev) => {
        const next = new Set(prev);
        next.delete(productId);
        return next;
      });
    }
  };

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
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
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

  const handleDownloadPointHistoryCsv = async () => {
    if (!token) return;
    setCsvDownloading(true);
    try {
      const res = await fetch(`${API_BASE}/driver/point-history.csv`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        let message = "Failed to export CSV";
        try {
          const data = await res.json();
          message = data.error || message;
        } catch {
          // keep default
        }
        throw new Error(message);
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      const dateStamp = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `point-history-${dateStamp}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      setHistoryError(e.message || "Failed to export CSV");
    } finally {
      setCsvDownloading(false);
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

  // ── DND toggle ────────────────────────────────────────────────────────────
  const handleDndToggle = async () => {
    setDndSaving(true);
    const newVal = !dndEnabled;
    try {
      const res = await fetch(`${API_BASE}/driver/preferences/dnd`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ enabled: newVal }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update DND");
      setDndEnabled(newVal);
    } catch (err) {
      console.error(err);
    } finally {
      setDndSaving(false);
    }
  };

  // ── Remove from cart ──────────────────────────────────────────────────────
  const handleRemoveFromCart = async (productId) => {
    setRemovingIds((prev) => new Set([...prev, productId]));
    setCartError("");
    setCartSuccess("");
    try {
      const res = await fetch(`${API_BASE}/driver/cart/${encodeURIComponent(productId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to remove item");
      setCartItems((prev) => prev.filter((item) => item.product_id !== productId));
      setCartSuccess("Item removed from cart.");
      setTimeout(() => setCartSuccess(""), 3000);
    } catch (err) {
      setCartError(err.message);
    } finally {
      setRemovingIds((prev) => {
        const next = new Set(prev);
        next.delete(productId);
        return next;
      });
    }
  };

  const timelineEvents = [...pointHistory].sort(
    (a, b) => new Date(a.occurredAt) - new Date(b.occurredAt)
  );

  const cartTotal = cartItems.reduce((sum, item) => sum + (item.points_cost || 0), 0);

  // Notifications are suppressed when DND is on
  const notificationsEnabled = !dndEnabled;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 900, margin: "30px auto", padding: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <h1 style={{ margin: 0 }}>Driver Dashboard</h1>
        <div style={{ display: "flex", gap: 10 }}>
          <button style={btnSecondary} onClick={onChangeUsername} type="button">Change Username</button>
          <button style={btnSecondary} onClick={onChangePassword} type="button">Change Password</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginTop: 24, marginBottom: 24, flexWrap: "wrap" }}>
        {[
          { key: "dashboard",  label: "Dashboard" },
          { key: "cart",       label: `🛒 Cart${cartItems.length > 0 ? ` (${cartItems.length})` : ""}` },
          { key: "sponsors",   label: "Sponsor Reviews" },
          { key: "settings",   label: "⚙️ Settings" },
          { key: "feedback",   label: "Help & Feedback" },
        ].map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            style={{
              padding: "8px 18px",
              borderRadius: 8,
              border: "1px solid var(--border, #d1d5db)",
              background: activeTab === key ? "#4f46e5" : "transparent",
              color: activeTab === key ? "#fff" : "inherit",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Dashboard tab ── */}
      {activeTab === "dashboard" && (
        <>
          {/* -- Notification Banners (suppressed when DND is on) */}
          {notificationsEnabled && (
            <>
              {applications
                .filter(a => a && a.status === "REJECTED" && !dismissedIds.includes(a.applicationId))
                .map(a => (
                <div key={a.applicationId} style={{
                  background: "#fef2f2",
                  border: "1px solid #fca5a5",
                  borderRadius: 10,
                  padding: "12px 16px",
                  marginBottom: 12,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}>
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
                  <button
                    type="button"
                    onClick={() => setDismissedIds(prev => [...prev, a.applicationId])}
                    style={{
                      background: "none", border: "none",
                      fontSize: 18, cursor: "pointer",
                      color: "#991b1b", lineHeight: 1, padding: "0 4px",
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
              {!droppedDismissed && driverStatus?.status === "DROPPED" && (
                <div style={{
                  background: "#fef2f2",
                  border: "1px solid #fca5a5",
                  borderRadius: 10,
                  padding: "12px 16px",
                  marginBottom: 12,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}>
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
                  <button
                    type="button"
                    onClick={() => setDroppedDismissed(true)}
                    style={{
                      background: "none", border: "none",
                      fontSize: 18, cursor: "pointer",
                      color: "#991b1b", lineHeight: 1, padding: "0 4px",
                    }}
                  >
                    ×
                  </button>
                </div>
              )}
            </>
          )}

          {/* DND banner when active */}
          {dndEnabled && (
            <div style={{
              background: "#f0f9ff",
              border: "1px solid #7dd3fc",
              borderRadius: 10,
              padding: "10px 16px",
              marginBottom: 12,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}>
              <span style={{ fontSize: 13, color: "#0369a1", fontWeight: 600 }}>
                🔕 Do Not Disturb is ON — notifications are silenced
              </span>
              <button
                type="button"
                onClick={handleDndToggle}
                style={{
                  background: "none", border: "1px solid #7dd3fc",
                  borderRadius: 6, padding: "3px 10px",
                  fontSize: 12, cursor: "pointer", color: "#0369a1",
                }}
              >
                Turn Off
              </button>
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
                <div style={{ marginTop: 10, fontSize: 48, fontWeight: 800, letterSpacing: -1 }}>{points}</div>
              )}
              <div style={{ marginTop: 10, color: "var(--muted)", fontSize: 13 }}>
                Points reflect your latest approved driving performance events.
              </div>
              <button
                type="button"
                onClick={handleDownloadPointHistoryCsv}
                disabled={csvDownloading}
                style={{
                  marginTop: 12,
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid var(--border, #d1d5db)",
                  background: "var(--card)",
                  color: "var(--text)",
                  fontWeight: 600,
                  cursor: csvDownloading ? "not-allowed" : "pointer",
                  opacity: csvDownloading ? 0.7 : 1,
                }}
              >
                {csvDownloading ? "Preparing CSV..." : "Download Point History CSV"}
              </button>
            </div>

            <div style={card}>
              <div style={{ color: "var(--muted)", fontSize: 12 }}>Status</div>
              <div style={{ marginTop: 10, fontSize: 18, fontWeight: 700 }}>Active</div>
              <div style={{ marginTop: 6, color: "var(--muted)", fontSize: 13 }}>Add driver status, sponsor, tier, etc.</div>
            </div>

            <div style={card}>
              <div style={{ color: "var(--muted)", fontSize: 12 }}>Cart</div>
              <div style={{ marginTop: 10, fontSize: 28, fontWeight: 800 }}>{cartItems.length}</div>
              <div style={{ marginTop: 4, color: "var(--muted)", fontSize: 13 }}>
                {cartItems.length === 0
                  ? "Your cart is empty"
                  : `${cartTotal.toLocaleString()} pts total`}
              </div>
              <button
                type="button"
                onClick={() => setActiveTab("cart")}
                style={{
                  marginTop: 12,
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "none",
                  background: "#4f46e5",
                  color: "#fff",
                  fontWeight: 600,
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                View Cart
              </button>
            </div>
          </div>

          <div style={{ ...card, marginTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ color: "var(--muted)", fontSize: 12 }}>
                Point Activity Timeline
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                {timelineEvents.length} event{timelineEvents.length === 1 ? "" : "s"}
              </div>
            </div>

            {historyLoading ? (
              <div style={{ color: "var(--muted)", fontSize: 13 }}>Loading point history…</div>
            ) : historyError ? (
              <div style={{ color: "#b91c1c", fontSize: 13 }}>{historyError}</div>
            ) : timelineEvents.length === 0 ? (
              <div style={{ color: "var(--muted)", fontSize: 13 }}>
                No point activity available yet.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {timelineEvents.map((event) => {
                  const earned = event.direction === "EARNED";
                  return (
                    <div
                      key={event.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "170px 90px 1fr",
                        gap: 10,
                        alignItems: "center",
                        padding: "10px 12px",
                        border: "1px solid var(--border, #e5e7eb)",
                        borderRadius: 10,
                        background: earned ? "#ecfdf5" : "#fef2f2",
                      }}
                    >
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>
                        {formatEventDate(event.occurredAt)}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: earned ? "#166534" : "#991b1b" }}>
                        {earned ? "+" : "-"}{event.points}
                      </div>
                      <div style={{ fontSize: 13, color: "var(--text)" }}>{event.reason}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Sponsorship Apply Card */}
          <div style={{ ...card, marginTop: 14 }}>
            <div style={{ color: "var(--muted)", fontSize: 12, marginBottom: 14 }}>Available Sponsorships</div>
            <SponsorshipApply token={token} />
          </div>
        </>
      )}

      {/* ── Cart tab ── */}
      {activeTab === "cart" && (
        <div>
          <h2 style={{ marginBottom: 4 }}>My Cart</h2>
          <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 0, marginBottom: 20 }}>
            Items you've saved. Head to the catalogue to redeem them with your points.
          </p>

          {cartError && (
            <div style={{ padding: "10px 14px", borderRadius: 8, background: "#fef2f2", color: "#991b1b", marginBottom: 12 }}>
              {cartError}
            </div>
          )}
          {cartSuccess && (
            <div style={{ padding: "10px 14px", borderRadius: 8, background: "#ecfdf5", color: "#065f46", marginBottom: 12 }}>
              ✓ {cartSuccess}
            </div>
          )}

          {cartLoading && <p style={{ color: "var(--muted)" }}>Loading cart…</p>}

          {!cartLoading && cartItems.length === 0 && (
            <div style={{ ...card, textAlign: "center", padding: 40 }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🛒</div>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Your cart is empty</div>
              <div style={{ color: "var(--muted)", fontSize: 14 }}>
                Browse the catalogue and add items you're interested in.
              </div>
            </div>
          )}

          {!cartLoading && cartItems.length > 0 && (
            <>
              {/* Cart summary bar */}
              <div style={{
                ...card,
                marginBottom: 16,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "#f5f3ff",
                border: "1px solid #c4b5fd",
              }}>
                <div>
                  <span style={{ fontWeight: 700, color: "#4f46e5" }}>
                    {cartItems.length} item{cartItems.length !== 1 ? "s" : ""}
                  </span>
                  <span style={{ color: "var(--muted)", fontSize: 14, marginLeft: 8 }}>in your cart</span>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 13, color: "var(--muted)" }}>Total cost</div>
                  <div style={{ fontWeight: 800, fontSize: 20, color: "#4f46e5" }}>
                    {cartTotal.toLocaleString()} pts
                  </div>
                </div>
              </div>

              {/* Cart items */}
              <div style={{ display: "grid", gap: 12 }}>
                {cartItems.map((item) => {
                  const isRemoving = removingIds.has(item.product_id);
                  return (
                    <div key={item.product_id} style={{
                      ...card,
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      opacity: isRemoving ? 0.5 : 1,
                      transition: "opacity 0.2s",
                    }}>
                      {item.artwork_url ? (
                        <img
                          src={item.artwork_url}
                          alt={item.product_name}
                          style={{ width: 60, height: 60, borderRadius: 8, objectFit: "cover", flexShrink: 0 }}
                        />
                      ) : (
                        <div style={{
                          width: 60, height: 60, borderRadius: 8,
                          background: "var(--border)", flexShrink: 0,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 24,
                        }}>
                          🎵
                        </div>
                      )}

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {item.product_name || "Unknown"}
                        </div>
                        <div style={{ color: "var(--muted)", fontSize: 13 }}>{item.artist_name}</div>
                        {item.media_type && (
                          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2, textTransform: "capitalize" }}>
                            {item.media_type}
                          </div>
                        )}
                      </div>

                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontWeight: 800, color: "#4f46e5", fontSize: 16 }}>
                          {(item.points_cost || 0).toLocaleString()} pts
                        </div>
                        <button
                          type="button"
                          disabled={isRemoving}
                          onClick={() => handleRemoveFromCart(item.product_id)}
                          style={{
                            marginTop: 6,
                            padding: "5px 12px",
                            borderRadius: 6,
                            border: "1px solid #fca5a5",
                            background: "#fef2f2",
                            color: "#991b1b",
                            fontWeight: 600,
                            fontSize: 12,
                            cursor: isRemoving ? "not-allowed" : "pointer",
                          }}
                        >
                          {isRemoving ? "Removing…" : "Remove"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Sponsors tab ── */}
      {activeTab === "sponsors" && (
        <div>
          <h2 style={{ marginBottom: 4 }}>Sponsor Reviews</h2>
          <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 0, marginBottom: 20 }}>
            Rate and review your sponsors. Only you can see your own reviews.
          </p>

          {sponsorError && (
            <div style={{ padding: "10px 14px", borderRadius: 8, background: "#fef2f2", color: "#991b1b", marginBottom: 12 }}>
              {sponsorError}
            </div>
          )}
          {sponsorSuccess && (
            <div style={{ padding: "10px 14px", borderRadius: 8, background: "#ecfdf5", color: "#065f46", marginBottom: 12 }}>
              ✓ {sponsorSuccess}
            </div>
          )}

          {sponsorLoading && <p style={{ color: "var(--muted)" }}>Loading sponsors…</p>}

          {!sponsorLoading && sponsors.length === 0 && (
            <p style={{ color: "var(--muted)" }}>No active sponsors found.</p>
          )}

          {!sponsorLoading && sponsors.map((s) => {
            const form = reviewForm[s.sponsorId] || { rating: 0, comment: "" };
            const isOpen = expanded === s.sponsorId;
            const hasReview = !!s.myRating;

            return (
              <div key={s.sponsorId} style={{ ...card, marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{s.sponsorName}</div>
                    {s.address && <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 2 }}>📍 {s.address}</div>}
                    {s.contactName && <div style={{ color: "var(--muted)", fontSize: 13 }}>👤 {s.contactName}</div>}
                    {s.contactEmail && <div style={{ color: "var(--muted)", fontSize: 13 }}>✉️ {s.contactEmail}</div>}
                    {s.contactPhone && <div style={{ color: "var(--muted)", fontSize: 13 }}>📞 {s.contactPhone}</div>}
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
                      <label style={{ fontWeight: 600, fontSize: 14, display: "block", marginBottom: 6 }}>
                        Your Rating *
                      </label>
                      <StarRating
                        value={form.rating}
                        onChange={(val) =>
                          setReviewForm((prev) => ({ ...prev, [s.sponsorId]: { ...form, rating: val } }))
                        }
                      />
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ fontWeight: 600, fontSize: 14, display: "block", marginBottom: 6 }}>
                        Comments (optional)
                      </label>
                      <textarea
                        rows={3}
                        placeholder="Share your experience with this sponsor..."
                        value={form.comment}
                        onChange={(e) =>
                          setReviewForm((prev) => ({ ...prev, [s.sponsorId]: { ...form, comment: e.target.value } }))
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

      {/* ── Settings tab ── */}
      {activeTab === "settings" && (
        <div>
          <h2 style={{ marginBottom: 4 }}>Settings</h2>
          <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 0, marginBottom: 20 }}>
            Manage your preferences and notification settings.
          </p>

          {/* DND Card */}
          <div style={{ ...card, marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>
                  🔕 Do Not Disturb
                </div>
                <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>
                  When enabled, system notifications (rejected applications, dropped status) will be silenced on your dashboard.
                </div>
              </div>

              {/* Toggle switch */}
              <button
                type="button"
                disabled={dndSaving}
                onClick={handleDndToggle}
                style={{
                  flexShrink: 0,
                  marginLeft: 20,
                  width: 52,
                  height: 28,
                  borderRadius: 14,
                  border: "none",
                  background: dndEnabled ? "#4f46e5" : "#d1d5db",
                  cursor: dndSaving ? "not-allowed" : "pointer",
                  position: "relative",
                  transition: "background 0.2s",
                  opacity: dndSaving ? 0.6 : 1,
                }}
                aria-label={dndEnabled ? "Disable Do Not Disturb" : "Enable Do Not Disturb"}
              >
                <span style={{
                  position: "absolute",
                  top: 3,
                  left: dndEnabled ? 27 : 3,
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  background: "#fff",
                  transition: "left 0.2s",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
                }} />
              </button>
            </div>

            <div style={{
              marginTop: 14,
              padding: "10px 14px",
              borderRadius: 8,
              background: dndEnabled ? "#ede9fe" : "#f0fdf4",
              border: `1px solid ${dndEnabled ? "#c4b5fd" : "#bbf7d0"}`,
              fontSize: 13,
              color: dndEnabled ? "#5b21b6" : "#166534",
              fontWeight: 600,
            }}>
              {dndEnabled
                ? "🔕 Do Not Disturb is ON — notifications are silenced"
                : "🔔 Notifications are ON — you will see system alerts"}
            </div>
          </div>

          {/* Hidden Products Card */}
          <div style={{ ...card }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>
              🚫 Hidden Catalogue Products
            </div>
            <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 16 }}>
              Products you've personally hidden from your catalogue view. Click Unhide to bring them back.
            </div>

            {hiddenLoading && (
              <div style={{ color: "var(--muted)", fontSize: 13 }}>Loading…</div>
            )}

            {!hiddenLoading && hiddenProducts.length === 0 && (
              <div style={{
                padding: "20px",
                borderRadius: 10,
                background: "var(--bg, #f9fafb)",
                border: "1px dashed var(--border, #d1d5db)",
                textAlign: "center",
                color: "var(--muted)",
                fontSize: 13,
              }}>
                You haven't hidden any products yet.
              </div>
            )}

            {!hiddenLoading && hiddenProducts.length > 0 && (
              <div style={{ display: "grid", gap: 10 }}>
                {hiddenProducts.map((p) => {
                  const isUnhiding = unhidingIds.has(p.product_id);
                  return (
                    <div key={p.product_id} style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid var(--border, #e5e7eb)",
                      background: "var(--bg, #f9fafb)",
                      opacity: isUnhiding ? 0.5 : 1,
                      transition: "opacity 0.2s",
                    }}>
                      {p.artwork_url ? (
                        <img
                          src={p.artwork_url}
                          alt={p.product_name}
                          style={{ width: 48, height: 48, borderRadius: 6, objectFit: "cover", flexShrink: 0 }}
                        />
                      ) : (
                        <div style={{
                          width: 48, height: 48, borderRadius: 6,
                          background: "var(--border)", flexShrink: 0,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 20,
                        }}>🎵</div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {p.product_name || "Unknown"}
                        </div>
                        <div style={{ color: "var(--muted)", fontSize: 12 }}>{p.artist_name}</div>
                      </div>
                      <button
                        type="button"
                        disabled={isUnhiding}
                        onClick={() => handleUnhide(p.product_id)}
                        style={{
                          flexShrink: 0,
                          padding: "5px 14px",
                          borderRadius: 6,
                          border: "1px solid #bbf7d0",
                          background: "#f0fdf4",
                          color: "#166534",
                          fontWeight: 600,
                          fontSize: 12,
                          cursor: isUnhiding ? "not-allowed" : "pointer",
                        }}
                      >
                        {isUnhiding ? "Unhiding…" : "Unhide"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Feedback tab ── */}
      {activeTab === "feedback" && (
        <FeedbackForm token={token} />
      )}
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