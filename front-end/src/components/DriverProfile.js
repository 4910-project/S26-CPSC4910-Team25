import React, { useEffect, useState, useCallback } from "react";
import SponsorshipApply from "./SponsorshipApply";
import FeedbackForm from "./feedbackForm";
import DriverFriendsPanel from "./DriverFriendsPanel";
import SponsorFeedPanel from "./SponsorFeedPanel";
import { summarizeCartAvailability, isCartItemAvailable } from "../utils/cartAvailability";

const API_BASE = "/api";
const BACKEND_BASE = "";

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
  const [reviewForm, setReviewForm] = useState({}); // { [sponsorId]: { rating, comment } }
  const [submitting, setSubmitting] = useState({}); // { [sponsorId]: bool }
  const [expanded, setExpanded] = useState(null);   // which sponsor's review form is open
  const [applications, setApplications] = useState([null]); // applications state
  const [driverStatus, setDriverStatus] = useState(null);

  // Profile photo
  const [photoUrl, setPhotoUrl] = useState(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState("");

  // Notifications
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [dismissedIds, setDismissedIds] = useState([]);
  const [droppedDismissed, setDroppedDismissed] = useState(false);

  // In-app notifications from backend
  const [inAppNotifications, setInAppNotifications] = useState([]);

  // Sponsor switcher (RC2)
  const [mySponsors, setMySponsors] = useState([]);
  const [activeSponsorId, setActiveSponsorId] = useState(null);
  const [switchingSponsor, setSwitchingSponsor] = useState(false);

  // Wishlist tab state
  const [wishlistItems,   setWishlistItems]   = useState([]);
  const [wishlistLoading, setWishlistLoading] = useState(false);
  const [wishlistError,   setWishlistError]   = useState("");

  // Cart tab state
  const [cartItems,   setCartItems]   = useState([]);
  const [cartLoading, setCartLoading] = useState(false);
  const [cartError,   setCartError]   = useState("");
  const [cartNotifications, setCartNotifications] = useState([]);
  const [cartWarning, setCartWarning] = useState("");

  // ── Profile photo fetch ───────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/driver/photo`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (res.ok) setPhotoUrl(data.photoUrl || null);
      } catch (e) {
        // silently ignore — default avatar will show
      }
    })();
  }, [token]);

  const handlePhotoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setPhotoError("File size must be under 5MB");
      return;
    }
    setPhotoError("");
    setPhotoUploading(true);
    try {
      const formData = new FormData();
      formData.append("photo", file);
      const res = await fetch(`${API_BASE}/driver/photo`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setPhotoUrl(data.photoUrl);
    } catch (err) {
      setPhotoError(err.message);
    } finally {
      setPhotoUploading(false);
      // Reset the input so the same file can be re-selected after an error
      e.target.value = "";
    }
  };

  // ── Wishlist fetch (fires when tab becomes active) ────────────────────────
  useEffect(() => {
    if (activeTab !== "wishlist" || !token) return;
    setWishlistLoading(true);
    setWishlistError("");
    fetch(`${API_BASE}/driver/wishlist`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => {
        if (d.ok) setWishlistItems(d.wishlist || []);
        else setWishlistError(d.error || "Failed to load wishlist");
      })
      .catch(() => setWishlistError("Failed to load wishlist"))
      .finally(() => setWishlistLoading(false));
  }, [activeTab, token]);

  const handleWishlistRemove = async (itemId) => {
    try {
      await fetch(`${API_BASE}/driver/wishlist/${itemId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setWishlistItems(prev => prev.filter(w => w.id !== itemId));
    } catch {
      setWishlistError("Failed to remove item");
    }
  };

  // ── Cart fetch (fires when tab becomes active) ───────────────────────────
  useEffect(() => {
    if (activeTab !== "cart" || !token) return;
    setCartLoading(true);
    setCartError("");
    setCartWarning("");
    setCartNotifications([]);
    fetch(`${API_BASE}/driver/cart`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => {
        if (d.ok) {
          setCartItems(d.cart || []);
          setCartNotifications(d.notifications || []);
          setCartWarning(d.warning || "");
        } else {
          setCartError(d.error || "Failed to load cart");
        }
      })
      .catch(() => setCartError("Failed to load cart"))
      .finally(() => setCartLoading(false));
  }, [activeTab, token]);

  const handleCartRemove = async (itemId) => {
    try {
      await fetch(`${API_BASE}/driver/cart/${itemId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const removed = cartItems.find((item) => item.id === itemId);
      setCartItems(prev => prev.filter(c => c.id !== itemId));
      if (removed?.itunes_track_id) {
        setCartNotifications(prev =>
          prev.filter((notice) => String(notice.itemId) !== String(removed.itunes_track_id))
        );
      }
    } catch {
      setCartError("Failed to remove item");
    }
  };

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

  // -- Point history fetch (timeline + csv source) ----
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

  // -- Notifications Setting Fetch ----
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/settings/notifications`, {
          headers: {Authorization: `Bearer ${token}`},
        });
        const data = await res.json();
        if (res.ok) setNotificationsEnabled(data.notifications_enabled);
      } catch(err) {
        console.error(err);
      }
    }) ();
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
      // Seed review form with existing ratings
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
          // keep default fallback message
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
          headers: { Authorization: `Bearer ${token}`},
        });
        const data = await res.json();
        console.log("applications response:", data); // debugging purposes
        if (res.ok) setApplications(data.applications || []);
      } catch(err) {
        console.error(err);
      }
    }) ();
  }, [token]);

  // Driver status fetch
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/driver/status`, {
          headers: {Authorization: `Bearer ${token}`},
        });
        const data = await res.json();
        if (res.ok) setDriverStatus(data.driver);
        } catch(err) {
          console.error(err);
        }
      }) ();
    }, [token]);
  


  // ── In-app notifications fetch ────────────────────────────────────────────
  const fetchInAppNotifications = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/driver/notifications`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) setInAppNotifications(data.notifications || []);
    } catch (_) { /* silently ignore */ }
  }, [token]);

  useEffect(() => {
    fetchInAppNotifications();
  }, [fetchInAppNotifications]);

  const handleDismissNotification = async (notifId) => {
    try {
      await fetch(`${API_BASE}/driver/notifications/${notifId}/read`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      setInAppNotifications((prev) => prev.filter((n) => n.id !== notifId));
    } catch (_) { /* ignore */ }
  };

  // ── My sponsors fetch (RC2 sponsor switcher) ──────────────────────────────
  const fetchMySponsors = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/driver/my-sponsors`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setMySponsors(data.sponsors || []);
        setActiveSponsorId(data.activeSponsorId || null);
      }
    } catch (_) { /* ignore */ }
  }, [token]);

  useEffect(() => {
    fetchMySponsors();
  }, [fetchMySponsors]);

  const handleSwitchSponsor = async (sponsorId) => {
    setSwitchingSponsor(true);
    try {
      const res = await fetch(`${API_BASE}/driver/active-sponsor`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ sponsorId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to switch sponsor");
      setActiveSponsorId(sponsorId);
      // Refresh points to reflect new sponsor's balance
      const pRes = await fetch(`${API_BASE}/driver/points`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (pRes.ok) {
        const pData = await pRes.json();
        setPoints(typeof pData.points === "number" ? pData.points : 0);
      }
    } catch (e) {
      setSponsorError(e.message);
    } finally {
      setSwitchingSponsor(false);
    }
  };

  const timelineEvents = [...pointHistory].sort(
    (a, b) => new Date(a.occurredAt) - new Date(b.occurredAt)
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 900, margin: "30px auto", padding: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {/* Profile photo */}
          <div style={{ flexShrink: 0 }}>
            {photoUrl ? (
              <img
                src={`${BACKEND_BASE}${photoUrl}`}
                alt="Profile"
                style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover", border: "2px solid var(--border, #d1d5db)" }}
              />
            ) : (
              <div style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--border, #e5e7eb)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, userSelect: "none" }}>
                👤
              </div>
            )}
          </div>
          <div>
            <h1 style={{ margin: 0 }}>Driver Dashboard</h1>
            <label style={{ cursor: photoUploading ? "not-allowed" : "pointer", fontSize: 13, color: "#4f46e5", fontWeight: 600, display: "block", marginTop: 2 }}>
              {photoUploading ? "Uploading…" : "Change photo"}
              <input
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={handlePhotoChange}
                disabled={photoUploading}
              />
            </label>
            {photoError && <div style={{ color: "#b91c1c", fontSize: 12, marginTop: 2 }}>{photoError}</div>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button style={btnSecondary} onClick={onChangeUsername} type="button">Change Username</button>
          <button style={btnSecondary} onClick={onChangePassword} type="button">Change Password</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginTop: 24, marginBottom: 24 }}>
        {["dashboard", "sponsors", "friends", "feed", "wishlist", "cart", "feedback"].map((tab) => (
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
                : tab === "friends"
                  ? "Friends"
                  : tab === "feed"
                    ? "Sponsor Feed"
                    : tab === "wishlist"
                      ? "My Wishlist"
                      : tab === "cart"
                        ? "Cart"
                        : "Help & Feedback"}
          </button>
        ))}
      </div>

      {/* ── Dashboard tab ── */}
      {activeTab === "dashboard" && (
        <>
          {/* -- Notification Banners */}
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
                    <div style={{ fontWeight: 700, color: "#991b1b", fontSize: 14}}>
                      ❌ Application Rejected - {a.sponsorName}
                    </div>
                    {a.decisionMessage && (
                      <div style={{ color: "#b91c1c", fontSize: 13, marginTop: 4}}>
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
                    <div style={{ fontWeight: 700, color: "#991b1b", fontSize: 14}}>
                      ❌ You have been dropped from {driverStatus.sponsorName}
                    </div>
                    {driverStatus.dropped_reason && (
                      <div style={{ color: "#b91c1c", fontSize: 13, marginTop: 4}}>
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

          {/* ── In-app notifications from backend (DROPPED = non-dismissible) ── */}
          {inAppNotifications.map((n) => {
            const isNonDismissible = !n.is_dismissible;
            return (
              <div
                key={n.id}
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
                <div style={{ fontWeight: 600, color: "#991b1b", fontSize: 14 }}>
                  🔔 {n.message}
                </div>
                {!isNonDismissible && (
                  <button
                    type="button"
                    onClick={() => handleDismissNotification(n.id)}
                    style={{
                      background: "none", border: "none",
                      fontSize: 18, cursor: "pointer",
                      color: "#991b1b", lineHeight: 1, padding: "0 4px",
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}

          {/* ── Sponsor switcher (RC2 — shown when driver has multiple sponsors) ── */}
          {mySponsors.length > 1 && (
            <div style={{ background: "var(--card)", border: "1px solid var(--border, #e5e7eb)", borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Active Sponsor</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {mySponsors.map((s) => (
                  <button
                    key={s.sponsorId}
                    type="button"
                    disabled={switchingSponsor || activeSponsorId === s.sponsorId}
                    onClick={() => handleSwitchSponsor(s.sponsorId)}
                    style={{
                      padding: "8px 16px",
                      borderRadius: 8,
                      border: activeSponsorId === s.sponsorId ? "2px solid #4f46e5" : "1px solid var(--border, #d1d5db)",
                      background: activeSponsorId === s.sponsorId ? "#ede9fe" : "var(--card)",
                      color: activeSponsorId === s.sponsorId ? "#4f46e5" : "inherit",
                      fontWeight: activeSponsorId === s.sponsorId ? 700 : 400,
                      cursor: switchingSponsor || activeSponsorId === s.sponsorId ? "not-allowed" : "pointer",
                    }}
                  >
                    {s.sponsorName}
                    {activeSponsorId === s.sponsorId && " ✓"}
                    <span style={{ fontSize: 12, color: "#6b7280", display: "block" }}>
                      {s.points_balance != null ? `${Number(s.points_balance).toLocaleString()} pts` : ""}
                    </span>
                  </button>
                ))}
              </div>
              {switchingSponsor && <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 8 }}>Switching…</p>}
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
              <div style={{ color: "var(--muted)", fontSize: 12 }}>Rewards</div>
              <div style={{ marginTop: 10, fontSize: 18, fontWeight: 700 }}>Coming soon</div>
              <div style={{ marginTop: 6, color: "var(--muted)", fontSize: 13 }}>Later: catalog + redeem flow.</div>
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
                        {earned ? "+" : "-"}
                        {event.points}
                      </div>
                      <div style={{ fontSize: 13, color: "var(--text)" }}>{event.reason}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Sponsorship Apply Card*/}
          <div style={{...card, marginTop: 14 }}>
            <div style={{ color: "var(--muted)", fontSize: 12, marginBottom: 14}}> Available Sponsorships</div>
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
                {/* Sponsor info row */}
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

                {/* Review form (expandable) */}
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

      {activeTab === "friends" && (
        <DriverFriendsPanel token={token} />
      )}

      {activeTab === "feed" && (
        <SponsorFeedPanel token={token} />
      )}

      {/* ── Cart tab ── */}
      {activeTab === "cart" && (() => {
        const { unavailableItems, availableTotal } = summarizeCartAvailability(cartItems);
        const cartTotal = availableTotal;
        const canAffordAll = points !== null && points >= cartTotal;
        return (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
              <h2 style={{ margin: 0 }}>Cart</h2>
              {points !== null && (
                <span style={{ fontSize: 14, color: "var(--muted)" }}>
                  Balance: <strong style={{ color: "var(--text)" }}>{Number(points).toLocaleString()} pts</strong>
                </span>
              )}
            </div>
            <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 4, marginBottom: 20 }}>
              Items you've added from the catalogue.
            </p>

            {cartError && (
              <div style={{ padding: "10px 14px", borderRadius: 8, background: "#fef2f2", color: "#991b1b", marginBottom: 12 }}>
                {cartError}
              </div>
            )}

            {!cartError && cartNotifications.length > 0 && (
              <div style={{ padding: "10px 14px", borderRadius: 8, background: "#fff7ed", color: "#9a3412", marginBottom: 12 }}>
                {cartNotifications.map((notice) => (
                  <div key={notice.itemId} style={{ marginBottom: 4 }}>
                    {notice.productName}: {notice.message}
                  </div>
                ))}
              </div>
            )}

            {!cartError && cartWarning && (
              <div style={{ padding: "10px 14px", borderRadius: 8, background: "#eff6ff", color: "#1d4ed8", marginBottom: 12 }}>
                {cartWarning}
              </div>
            )}

            {cartLoading && <p style={{ color: "var(--muted)" }}>Loading…</p>}

            {!cartLoading && cartItems.length === 0 && !cartError && (
              <p style={{ color: "var(--muted)" }}>Your cart is empty. Browse the catalogue to add items.</p>
            )}

            {!cartLoading && cartItems.length > 0 && (
              <>
                {cartItems.map(item => (
                  <div
                    key={item.id}
                    style={{
                      ...card,
                      marginBottom: 12,
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      border: isCartItemAvailable(item) ? card.border : "1px solid #fdba74",
                      background: isCartItemAvailable(item) ? card.background : "#fff7ed",
                    }}
                  >
                    {item.product_image_url && (
                      <img
                        src={item.product_image_url}
                        alt={item.product_name}
                        style={{ width: 56, height: 56, borderRadius: 8, objectFit: "contain", background: "#f3f4f6", flexShrink: 0 }}
                      />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.product_name}
                      </div>
                      {item.artist && (
                        <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 1 }}>{item.artist}</div>
                      )}
                      <div style={{ color: "#e53935", fontWeight: 600, fontSize: 13, marginTop: 2 }}>
                        {Number(item.price_in_points).toLocaleString()} pts
                      </div>
                      {!isCartItemAvailable(item) && (
                        <div style={{ color: "#9a3412", fontSize: 12, marginTop: 4 }}>
                          {item.availability_message || "Item unavailable. It can no longer be purchased."}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCartRemove(item.id)}
                      style={{
                        background: "none",
                        border: "1px solid var(--border, #d1d5db)",
                        borderRadius: 8,
                        padding: "6px 12px",
                        cursor: "pointer",
                        color: "var(--text)",
                        fontWeight: 600,
                        fontSize: 13,
                        flexShrink: 0,
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ))}

              <div style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 13, color: "var(--muted)" }}>Total</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: "#e53935" }}>
                    {cartTotal.toLocaleString()} pts
                  </div>
                  {unavailableItems.length > 0 && (
                    <div style={{ fontSize: 12, color: "#9a3412", marginTop: 4 }}>
                      {unavailableItems.length} unavailable item(s) excluded from the purchase total.
                    </div>
                  )}
                </div>
                {points !== null && (
                  <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 13, color: "var(--muted)" }}>Your balance</div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: canAffordAll ? "#059669" : "#dc2626" }}>
                        {Number(points).toLocaleString()} pts
                      </div>
                      {!canAffordAll && (
                        <div style={{ fontSize: 12, color: "#dc2626", marginTop: 2 }}>
                          Need {(cartTotal - points).toLocaleString()} more pts
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        );
      })()}

      {/* ── Wishlist tab ── */}
      {activeTab === "wishlist" && (
        <div>
          <h2 style={{ marginBottom: 4 }}>My Wishlist</h2>
          <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 0, marginBottom: 20 }}>
            Items you've saved from the catalogue.
          </p>

          {wishlistError && (
            <div style={{ padding: "10px 14px", borderRadius: 8, background: "#fef2f2", color: "#991b1b", marginBottom: 12 }}>
              {wishlistError}
            </div>
          )}

          {wishlistLoading && <p style={{ color: "var(--muted)" }}>Loading…</p>}

          {!wishlistLoading && wishlistItems.length === 0 && !wishlistError && (
            <p style={{ color: "var(--muted)" }}>No items saved yet. Hit ♡ on any catalogue item to save it here.</p>
          )}

          {!wishlistLoading && wishlistItems.map(item => (
            <div key={item.id} style={{ ...card, marginBottom: 12, display: "flex", alignItems: "center", gap: 14 }}>
              {item.product_image_url && (
                <img
                  src={item.product_image_url}
                  alt={item.product_name}
                  style={{ width: 56, height: 56, borderRadius: 8, objectFit: "contain", background: "#f3f4f6", flexShrink: 0 }}
                />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.product_name}
                </div>
                <div style={{ color: "#e53935", fontWeight: 600, fontSize: 13, marginTop: 2 }}>
                  {Number(item.price_in_points).toLocaleString()} pts
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleWishlistRemove(item.id)}
                style={{
                  background: "none",
                  border: "1px solid var(--border, #d1d5db)",
                  borderRadius: 8,
                  padding: "6px 12px",
                  cursor: "pointer",
                  color: "var(--text)",
                  fontWeight: 600,
                  fontSize: 13,
                  flexShrink: 0,
                }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Feedback tab ── */}
      {activeTab === "feedback" && (
        <FeedbackForm token={token} apiBase={`${API_BASE}/driver`} />
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
