import React, { useState, useEffect, useCallback } from "react";

const ADMIN_API = "http://localhost:8001/admin";

const CATEGORIES = [
  "All",
  "Bug Report",
  "Feature Request",
  "Points Issue",
  "Account Problem",
  "Sponsor Issue",
  "General Feedback",
  "Other",
];

const STATUS_COLORS = {
  open: { bg: "#dbeafe", color: "#1e40af" },
  reviewed: { bg: "#fef3c7", color: "#92400e" },
  resolved: { bg: "#d1fae5", color: "#065f46" },
};

function StatusBadge({ status }) {
  const s = STATUS_COLORS[status] || { bg: "#f3f4f6", color: "#374151" };
  return (
    <span
      style={{
        padding: "2px 10px",
        borderRadius: 12,
        fontSize: 12,
        fontWeight: 700,
        background: s.bg,
        color: s.color,
        textTransform: "capitalize",
      }}
    >
      {status}
    </span>
  );
}

export default function AdminDashboard({ token, onLogout }) {
  const [feedback, setFeedback] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Filters
  const [filterStatus, setFilterStatus] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [page, setPage] = useState(1);
  const limit = 20;

  // Expanded row for admin note editing
  const [expanded, setExpanded] = useState(null);
  const [noteText, setNoteText] = useState("");
  const [updating, setUpdating] = useState({});

  // Sponsors state
  const [activeTab, setActiveTab] = useState("feedback");
  const [sponsors, setSponsors] = useState([]);
  const [sponsorLoading, setSponsorLoading] = useState(false);
  const [sponsorError, setSponsorError] = useState("");
  const [lockingId, setLockingId] = useState(null);
  const [flaggingId, setFlaggingId] = useState(null);
  const [sponsorWarningId, setSponsorWarningId] = useState(null);
  const [expandedSponsor, setExpandedSponsor] = useState(null);
  const [sponsorNoteText, setSponsorNoteText] = useState("");
  const [savingSponsorNote, setSavingSponsorNote] = useState({});

  // Drivers state
  const [drivers, setDrivers] = useState([]);
  const [driverLoading, setDriverLoading] = useState(false);
  const [driverError, setDriverError] = useState("");
  const [driverFlaggingId, setDriverFlaggingId] = useState(null);
  const [driverWarningId, setDriverWarningId] = useState(null);
  const [expandedDriver, setExpandedDriver] = useState(null);
  const [driverNoteText, setDriverNoteText] = useState("");
  const [savingDriverNote, setSavingDriverNote] = useState({});

  // Settings state
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [settingsToggling, setSettingsToggling] = useState(false);

  const fetchFeedback = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (filterStatus) params.set("status", filterStatus);
      if (filterCategory && filterCategory !== "All")
        params.set("category", filterCategory);

      const res = await fetch(`${ADMIN_API}/feedback?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch feedback");

      setFeedback(data.feedback || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err?.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [token, page, filterStatus, filterCategory]);

  useEffect(() => {
    fetchFeedback();
  }, [fetchFeedback]);

  const fetchSponsors = useCallback(async () => {
    setSponsorLoading(true);
    setSponsorError("");
    try {
      const res = await fetch(`${ADMIN_API}/sponsors`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch sponsors");
      setSponsors(data.sponsors || []);
    } catch (err) {
      setSponsorError(err?.message || "Unknown error");
    } finally {
      setSponsorLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (activeTab === "sponsors") fetchSponsors();
  }, [activeTab, fetchSponsors]);

  const fetchDrivers = useCallback(async () => {
    setDriverLoading(true);
    setDriverError("");
    try {
      const res = await fetch(`${ADMIN_API}/drivers`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch drivers");
      setDrivers(data.drivers || []);
    } catch (err) {
      setDriverError(err?.message || "Unknown error");
    } finally {
      setDriverLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (activeTab === "drivers") fetchDrivers();
  }, [activeTab, fetchDrivers]);

  // Fetch notification setting when settings tab opens
  const fetchSettings = useCallback(async () => {
    setSettingsLoading(true);
    setSettingsError("");
    try {
      const res = await fetch(`${ADMIN_API}/settings/notifications`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch settings");
      setNotificationsEnabled(data.notifications_enabled);
    } catch (err) {
      setSettingsError(err?.message || "Unknown error");
    } finally {
      setSettingsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (activeTab === "settings") fetchSettings();
  }, [activeTab, fetchSettings]);

  const handleNotificationsToggle = async () => {
    setSettingsToggling(true);
    setSettingsError("");
    try {
      const res = await fetch(`${ADMIN_API}/settings/notifications`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ notifications_enabled: !notificationsEnabled }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update setting");
      setNotificationsEnabled(data.notifications_enabled);
    } catch (err) {
      setSettingsError(err?.message || "Unknown error");
    } finally {
      setSettingsToggling(false);
    }
  };

  const handleLockToggle = async (sponsorId, currentValue) => {
    setLockingId(sponsorId);
    try {
      const res = await fetch(`${ADMIN_API}/sponsors/${sponsorId}/lock`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ accepting_drivers: !currentValue }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update sponsor");
      await fetchSponsors();
    } catch (err) {
      setSponsorError(err?.message || "Unknown error");
    } finally {
      setLockingId(null);
    }
  };

  const handleFlagToggle = async (sponsorId, currentValue) => {
    setFlaggingId(sponsorId);
    try {
      const res = await fetch(`${ADMIN_API}/sponsors/${sponsorId}/flag`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ flagged: !currentValue }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to flag sponsor");
      await fetchSponsors();
    } catch (err) {
      setSponsorError(err?.message || "Unknown error");
    } finally {
      setFlaggingId(null);
    }
  };

  const handleSponsorWarn = async (sponsorId, sponsorName) => {
    const rawReason = window.prompt(`Enter warning reason for sponsor "${sponsorName}":`);
    if (rawReason === null) return;

    const reason = rawReason.trim();
    if (!reason) {
      setSponsorError("Warning reason is required.");
      return;
    }

    setSponsorWarningId(sponsorId);
    setSponsorError("");
    try {
      const res = await fetch(`${ADMIN_API}/sponsors/${sponsorId}/warn`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to issue sponsor warning");
      await fetchSponsors();
      window.alert("Sponsor warning issued.");
    } catch (err) {
      setSponsorError(err?.message || "Unknown error");
    } finally {
      setSponsorWarningId(null);
    }
  };

  const handleDriverFlagToggle = async (driverId, currentValue) => {
    setDriverFlaggingId(driverId);
    try {
      const res = await fetch(`${ADMIN_API}/drivers/${driverId}/flag`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ flagged: !currentValue }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to flag driver");
      await fetchDrivers();
    } catch (err) {
      setDriverError(err?.message || "Unknown error");
    } finally {
      setDriverFlaggingId(null);
    }
  };

  const handleDriverWarn = async (driverId, driverEmail) => {
    const rawReason = window.prompt(`Enter warning reason for driver "${driverEmail}":`);
    if (rawReason === null) return;

    const reason = rawReason.trim();
    if (!reason) {
      setDriverError("Warning reason is required.");
      return;
    }

    setDriverWarningId(driverId);
    setDriverError("");
    try {
      const res = await fetch(`${ADMIN_API}/drivers/${driverId}/warn`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to issue driver warning");
      await fetchDrivers();
      window.alert("Driver warning issued.");
    } catch (err) {
      setDriverError(err?.message || "Unknown error");
    } finally {
      setDriverWarningId(null);
    }
  };

  const handleSaveSponsorNote = async (sponsorId) => {
    setSavingSponsorNote((prev) => ({ ...prev, [sponsorId]: true }));
    try {
      const res = await fetch(`${ADMIN_API}/sponsors/${sponsorId}/note`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ adminNote: sponsorNoteText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save note");
      setExpandedSponsor(null);
      await fetchSponsors();
    } catch (err) {
      setSponsorError(err?.message || "Unknown error");
    } finally {
      setSavingSponsorNote((prev) => ({ ...prev, [sponsorId]: false }));
    }
  };

  const handleSaveDriverNote = async (driverId) => {
    setSavingDriverNote((prev) => ({ ...prev, [driverId]: true }));
    try {
      const res = await fetch(`${ADMIN_API}/drivers/${driverId}/note`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ adminNote: driverNoteText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save note");
      setExpandedDriver(null);
      await fetchDrivers();
    } catch (err) {
      setDriverError(err?.message || "Unknown error");
    } finally {
      setSavingDriverNote((prev) => ({ ...prev, [driverId]: false }));
    }
  };

  const handleUpdate = async (id, updates) => {
    setUpdating((prev) => ({ ...prev, [id]: true }));
    try {
      const res = await fetch(`${ADMIN_API}/feedback/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(updates),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update");

      setExpanded(null);
      await fetchFeedback();
    } catch (err) {
      setError(err?.message || "Unknown error");
    } finally {
      setUpdating((prev) => ({ ...prev, [id]: false }));
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div style={{ maxWidth: 1000, margin: "30px auto", padding: 20 }}>
      <h1 style={{ margin: 0, marginBottom: 4 }}>Admin Dashboard</h1>

      <div style={{ display: "flex", gap: 8, marginTop: 16, marginBottom: 24 }}>
        {["feedback", "sponsors", "drivers", "settings"].map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            style={{
              padding: "8px 18px",
              borderRadius: 8,
              border: "1px solid var(--border, #d1d6db)",
              background: activeTab === tab ? "#4f46e5" : "transparent",
              color: activeTab === tab ? "#fff" : "inherit",
              fontWeight: 600,
              cursor: "pointer",
              textTransform: "capitalize",
            }}
          >
            {tab === "feedback"
              ? "Feedback"
              : tab === "sponsors"
              ? "Sponsor Management"
              : tab === "drivers"
              ? "Driver Management"
              : "Settings"}
          </button>
        ))}
      </div>

      {/* ── Feedback tab ── */}
      {activeTab === "feedback" && (
        <>
          <div
            style={{
              display: "flex",
              gap: 12,
              marginBottom: 20,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <select
              value={filterStatus}
              onChange={(e) => {
                setFilterStatus(e.target.value);
                setPage(1);
              }}
              style={selectStyle}
            >
              <option value="">All Statuses</option>
              <option value="open">Open</option>
              <option value="reviewed">Reviewed</option>
              <option value="resolved">Resolved</option>
            </select>

            <select
              value={filterCategory}
              onChange={(e) => {
                setFilterCategory(e.target.value);
                setPage(1);
              }}
              style={selectStyle}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c === "All" ? "" : c}>
                  {c}
                </option>
              ))}
            </select>

            <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--muted)" }}>
              {total} submission{total !== 1 ? "s" : ""}
            </span>
          </div>

          {error && (
            <div
              style={{
                padding: "10px 14px",
                borderRadius: 8,
                background: "#fef2f2",
                color: "#991b1b",
                marginBottom: 16,
              }}
            >
              {error}
            </div>
          )}

          {loading && <p style={{ color: "var(--muted)" }}>Loading…</p>}

          {!loading && feedback.length === 0 && (
            <p style={{ color: "var(--muted)" }}>No feedback found.</p>
          )}

          {!loading && feedback.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {feedback.map((item) => {
                const isOpen = expanded === item.id;
                return (
                  <div
                    key={item.id}
                    style={{
                      border: "1px solid var(--border, #e5e7eb)",
                      borderRadius: 12,
                      padding: 16,
                      background: "var(--card)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        gap: 12,
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            marginBottom: 4,
                            flexWrap: "wrap",
                          }}
                        >
                          <span
                            style={{
                              padding: "2px 10px",
                              borderRadius: 12,
                              fontSize: 12,
                              fontWeight: 700,
                              background: "#ede9fe",
                              color: "#5b21b6",
                            }}
                          >
                            {item.category}
                          </span>

                          <StatusBadge status={item.status} />

                          <span style={{ fontSize: 12, color: "var(--muted)" }}>
                            {item.submitter_email} · {item.submitter_role}
                          </span>

                          <span style={{ fontSize: 12, color: "var(--muted)" }}>
                            {new Date(item.created_at).toLocaleString()}
                          </span>
                        </div>

                        <p style={{ margin: 0, fontSize: 14, color: "var(--text)", lineHeight: 1.5 }}>
                          {item.message}
                        </p>

                        {item.admin_note && !isOpen && (
                          <p
                            style={{
                              margin: "8px 0 0",
                              fontSize: 13,
                              color: "#6b7280",
                              fontStyle: "italic",
                            }}
                          >
                            📝 Note: {item.admin_note}
                          </p>
                        )}
                      </div>

                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                          alignItems: "flex-end",
                        }}
                      >
                        <div style={{ display: "flex", gap: 6 }}>
                          {["open", "reviewed", "resolved"].map((s) => (
                            <button
                              key={s}
                              type="button"
                              disabled={item.status === s || updating[item.id]}
                              onClick={() => handleUpdate(item.id, { status: s })}
                              style={{
                                padding: "4px 10px",
                                borderRadius: 6,
                                fontSize: 12,
                                fontWeight: 600,
                                border:
                                  item.status === s
                                    ? "2px solid #4f46e5"
                                    : "1px solid var(--border, #d1d5db)",
                                background: item.status === s ? "#ede9fe" : "transparent",
                                color: item.status === s ? "#4f46e5" : "inherit",
                                cursor: item.status === s ? "default" : "pointer",
                                textTransform: "capitalize",
                              }}
                            >
                              {s}
                            </button>
                          ))}
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setExpanded(isOpen ? null : item.id);
                            setNoteText(item.admin_note || "");
                          }}
                          style={{
                            padding: "4px 12px",
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 600,
                            border: "1px solid var(--border, #d1d5db)",
                            background: isOpen ? "#f3f4f6" : "transparent",
                            cursor: "pointer",
                          }}
                        >
                          {isOpen ? "Cancel" : "✏️ Add Note"}
                        </button>
                      </div>
                    </div>

                    {isOpen && (
                      <div
                        style={{
                          marginTop: 12,
                          borderTop: "1px solid var(--border, #e5e7eb)",
                          paddingTop: 12,
                        }}
                      >
                        <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 6 }}>
                          Admin Note
                        </label>

                        <textarea
                          rows={3}
                          value={noteText}
                          onChange={(e) => setNoteText(e.target.value)}
                          placeholder="Add an internal note..."
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

                        <button
                          type="button"
                          disabled={updating[item.id]}
                          onClick={() => handleUpdate(item.id, { adminNote: noteText })}
                          style={{
                            marginTop: 8,
                            padding: "6px 18px",
                            borderRadius: 8,
                            border: "none",
                            background: "#4f46e5",
                            color: "#fff",
                            fontWeight: 700,
                            cursor: updating[item.id] ? "not-allowed" : "pointer",
                            opacity: updating[item.id] ? 0.6 : 1,
                          }}
                        >
                          {updating[item.id] ? "Saving…" : "Save Note"}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 24 }}>
              <button
                type="button"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
                style={{ ...pageBtn, opacity: page === 1 ? 0.4 : 1 }}
              >
                ← Prev
              </button>

              <span style={{ padding: "6px 12px", fontSize: 14, color: "var(--muted)" }}>
                Page {page} of {totalPages}
              </span>

              <button
                type="button"
                disabled={page === totalPages}
                onClick={() => setPage((p) => p + 1)}
                style={{ ...pageBtn, opacity: page === totalPages ? 0.4 : 1 }}
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Sponsors tab ── */}
      {activeTab === "sponsors" && (
        <div>
          {sponsorError && (
            <div
              style={{
                padding: "10px 14px",
                borderRadius: 8,
                background: "#fef2f2",
                color: "#991b1b",
                marginBottom: 16,
              }}
            >
              {sponsorError}
            </div>
          )}

          {sponsorLoading && <p style={{ color: "var(--muted)" }}>Loading sponsors...</p>}

          {!sponsorLoading && sponsors.length === 0 && (
            <p style={{ color: "var(--muted)" }}>No sponsors found</p>
          )}

          {!sponsorLoading &&
            sponsors.map((s) => {
              const isNoteOpen = expandedSponsor === s.id;
              return (
                <div
                  key={s.id}
                  style={{
                    border: `1px solid ${!!s.flagged ? "#fca5a5" : "var(--border, #e5e7eb)"}`,
                    borderRadius: 12,
                    padding: 16,
                    background: !!s.flagged ? "#fff7f7" : "var(--card)",
                    marginBottom: 10,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                        <span style={{ fontWeight: 700, fontSize: 15 }}>{s.name}</span>
                        {!!s.flagged && (
                          <span
                            style={{
                              padding: "2px 8px",
                              borderRadius: 10,
                              fontSize: 11,
                              fontWeight: 700,
                              background: "#fee2e2",
                              color: "#b91c1c",
                              display: "flex",
                              alignItems: "center",
                              gap: 3,
                            }}
                          >
                            🚩 Flagged
                          </span>
                        )}
                      </div>

                      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>
                        Status: {s.status} · {s.accepting_drivers ? "✅ Accepting drivers" : "🔒 Locked"}
                      </div>

                      {s.admin_note && !isNoteOpen && (
                        <p style={{ margin: "6px 0 0", fontSize: 13, color: "#6b7280", fontStyle: "italic" }}>
                          📝 Note: {s.admin_note}
                        </p>
                      )}
                    </div>

                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                     <button
                       type="button"
                        onClick={() => {
                          setExpandedSponsor(isNoteOpen ? null : s.id);
                          setSponsorNoteText(s.admin_note || "");
                       }}
                        style={{
                          padding: "4px 12px",
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 600,
                          border: "1px solid var(--border, #d1d5db)",
                          background: isNoteOpen ? "#f3f4f6" : "transparent",
                          cursor: "pointer",
                        }}
                      >
                        {isNoteOpen ? "Cancel" : "✏️ Add Note"}
                      </button>

                      <button
                        type="button"
                        disabled={sponsorWarningId === s.id}
                        onClick={() => handleSponsorWarn(s.id, s.name)}
                        style={{
                          padding: "7px 16px",
                          borderRadius: 8,
                          border: "1px solid #fbbf24",
                          background: "#fef3c7",
                          color: "#92400e",
                          fontWeight: 600,
                          fontSize: 13,
                          cursor: sponsorWarningId === s.id ? "not-allowed" : "pointer",
                          opacity: sponsorWarningId === s.id ? 0.6 : 1,
                        }}
                      >
                        {sponsorWarningId === s.id ? "Saving..." : "⚠️ Warn"}
                      </button>

                      <button
                        type="button"
                        disabled={flaggingId === s.id}
                        onClick={() => handleFlagToggle(s.id, s.flagged)}
                        style={{
                          padding: "7px 16px",
                          borderRadius: 8,
                          border: !!s.flagged ? "1px solid #fca5a5" : "1px solid var(--border, #d1d5db)",
                          background: !!s.flagged ? "#fee2e2" : "transparent",
                          color: !!s.flagged ? "#b91c1c" : "var(--text, #374151)",
                          fontWeight: 600,
                          fontSize: 13,
                          cursor: flaggingId === s.id ? "not-allowed" : "pointer",
                          opacity: flaggingId === s.id ? 0.6 : 1,
                        }}
                      >
                        {flaggingId === s.id ? "Saving..." : !!s.flagged ? "🚩 Unflag" : "🚩 Flag"}
                      </button>

                      <button
                        type="button"
                        disabled={lockingId === s.id}
                        onClick={() => handleLockToggle(s.id, s.accepting_drivers)}
                        style={{
                          padding: "7px 16px",
                          borderRadius: 8,
                          border: "none",
                          background: s.accepting_drivers ? "#ef4444" : "#10b981",
                          color: "#fff",
                          fontWeight: 600,
                          fontSize: 13,
                          cursor: lockingId === s.id ? "not-allowed" : "pointer",
                          opacity: lockingId === s.id ? 0.6 : 1,
                        }}
                      >
                        {lockingId === s.id ? "Saving..." : s.accepting_drivers ? "🔒 Lock" : "🔓 Unlock"}
                      </button>
                    </div>
                  </div>

                  {isNoteOpen && (
                    <div
                      style={{
                        marginTop: 12,
                        borderTop: "1px solid var(--border, #e5e7eb)",
                        paddingTop: 12,
                      }}
                    >
                      <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 6 }}>
                        Admin Note
                      </label>
                      <textarea
                        rows={3}
                        value={sponsorNoteText}
                        onChange={(e) => setSponsorNoteText(e.target.value)}
                        placeholder="Add an internal note..."
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
                      <button
                        type="button"
                        disabled={savingSponsorNote[s.id]}
                        onClick={() => handleSaveSponsorNote(s.id)}
                        style={{
                          marginTop: 8,
                          padding: "6px 18px",
                          borderRadius: 8,
                          border: "none",
                          background: "#4f46e5",
                          color: "#fff",
                          fontWeight: 700,
                          cursor: savingSponsorNote[s.id] ? "not-allowed" : "pointer",
                          opacity: savingSponsorNote[s.id] ? 0.6 : 1,
                        }}
                      >
                        {savingSponsorNote[s.id] ? "Saving..." : "Save Note"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      )}

      {/* ── Drivers tab ── */}
      {activeTab === "drivers" && (
        <div>
          {driverError && (
            <div
              style={{
                padding: "10px 14px",
                borderRadius: 8,
                background: "#fef2f2",
                color: "#991b1b",
                marginBottom: 16,
              }}
            >
              {driverError}
            </div>
          )}

          {driverLoading && <p style={{ color: "var(--muted)" }}>Loading drivers...</p>}

          {!driverLoading && drivers.length === 0 && (
            <p style={{ color: "var(--muted)" }}>No drivers found</p>
          )}

          {!driverLoading &&
            drivers.map((d) => {
              const isNoteOpen = d.driver_id != null && expandedDriver === d.driver_id;
              return (
                <div
                  key={d.driver_id || d.email}
                  style={{
                    border: `1px solid ${!!d.flagged ? "#fca5a5" : "var(--border, #e5e7eb)"}`,
                    borderRadius: 12,
                    padding: 16,
                    background: !!d.flagged ? "#fff7f7" : "var(--card)",
                    marginBottom: 10,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                        <span style={{ fontWeight: 700, fontSize: 15 }}>{d.email}</span>
                        {!!d.flagged && (
                          <span
                            style={{
                              padding: "2px 8px",
                              borderRadius: 10,
                              fontSize: 11,
                              fontWeight: 700,
                              background: "#fee2e2",
                              color: "#b91c1c",
                              display: "flex",
                              alignItems: "center",
                              gap: 3,
                            }}
                          >
                            🚩 Flagged
                          </span>
                        )}
                      </div>

                      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>
                        Sponsor: {d.sponsor_name || "—"} · Status: {d.driver_status}
                      </div>

                      {d.admin_note && !isNoteOpen && (
                        <p style={{ margin: "6px 0 0", fontSize: 13, color: "#6b7280", fontStyle: "italic" }}>
                          📝 Note: {d.admin_note}
                        </p>
                      )}
                    </div>

                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                     <button
                       type="button"
                        onClick={() => {
                          setExpandedDriver(isNoteOpen ? null : d.driver_id);
                          setDriverNoteText(d.admin_note || "");
                       }}
                        style={{
                          padding: "4px 12px",
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 600,
                          border: "1px solid var(--border, #d1d5db)",
                          background: isNoteOpen ? "#f3f4f6" : "transparent",
                          cursor: "pointer",
                        }}
                      >
                        {isNoteOpen ? "Cancel" : "✏️ Add Note"}
                      </button>

                      <button
                        type="button"
                        disabled={driverWarningId === d.driver_id}
                        onClick={() => handleDriverWarn(d.driver_id, d.email)}
                        style={{
                          padding: "7px 16px",
                          borderRadius: 8,
                          border: "1px solid #fbbf24",
                          background: "#fef3c7",
                          color: "#92400e",
                          fontWeight: 600,
                          fontSize: 13,
                          cursor: driverWarningId === d.driver_id ? "not-allowed" : "pointer",
                          opacity: driverWarningId === d.driver_id ? 0.6 : 1,
                        }}
                      >
                        {driverWarningId === d.driver_id ? "Saving..." : "⚠️ Warn"}
                      </button>

                      <button
                        type="button"
                        disabled={driverFlaggingId === d.driver_id}
                        onClick={() => handleDriverFlagToggle(d.driver_id, d.flagged)}
                        style={{
                          padding: "7px 16px",
                          borderRadius: 8,
                          border: !!d.flagged ? "1px solid #fca5a5" : "1px solid var(--border, #d1d5db)",
                          background: !!d.flagged ? "#fee2e2" : "transparent",
                          color: !!d.flagged ? "#b91c1c" : "var(--text, #374151)",
                          fontWeight: 600,
                          fontSize: 13,
                          cursor: driverFlaggingId === d.driver_id ? "not-allowed" : "pointer",
                          opacity: driverFlaggingId === d.driver_id ? 0.6 : 1,
                        }}
                      >
                        {driverFlaggingId === d.driver_id ? "Saving..." : !!d.flagged ? "🚩 Unflag" : "🚩 Flag"}
                      </button>
                    </div>
                  </div>

                  {isNoteOpen && (
                    <div
                      style={{
                        marginTop: 12,
                        borderTop: "1px solid var(--border, #e5e7eb)",
                        paddingTop: 12,
                      }}
                    >
                      <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 6 }}>
                        Admin Note
                      </label>
                      <textarea
                        rows={3}
                        value={driverNoteText}
                        onChange={(e) => setDriverNoteText(e.target.value)}
                        placeholder="Add an internal note..."
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
                      <button
                        type="button"
                        disabled={savingDriverNote[d.driver_id]}
                        onClick={() => handleSaveDriverNote(d.driver_id)}
                        style={{
                          marginTop: 8,
                          padding: "6px 18px",
                          borderRadius: 8,
                          border: "none",
                          background: "#4f46e5",
                          color: "#fff",
                          fontWeight: 700,
                          cursor: savingDriverNote[d.driver_id] ? "not-allowed" : "pointer",
                          opacity: savingDriverNote[d.driver_id] ? 0.6 : 1,
                        }}
                      >
                        {d.driver_id != null && savingDriverNote[d.driver_id] ? "Saving..." : "Save Note"}
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
          <h2 style={{ marginTop: 0, marginBottom: 4 }}>System Settings</h2>
          <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 0, marginBottom: 24 }}>
            Global controls that affect all accounts.
          </p>

          {settingsError && (
            <div
              style={{
                padding: "10px 14px",
                borderRadius: 8,
                background: "#fef2f2",
                color: "#991b1b",
                marginBottom: 16,
              }}
            >
              {settingsError}
            </div>
          )}

          {settingsLoading && <p style={{ color: "var(--muted)" }}>Loading settings...</p>}

          {!settingsLoading && (
            <div
              style={{
                border: `1px solid ${!notificationsEnabled ? "#fca5a5" : "var(--border, #e5e7eb)"}`,
                borderRadius: 12,
                padding: 20,
                background: !notificationsEnabled ? "#fff7f7" : "var(--card)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 16,
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>
                    🔔 Notifications
                  </span>
                  {!notificationsEnabled && (
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: 10,
                        fontSize: 11,
                        fontWeight: 700,
                        background: "#fee2e2",
                        color: "#b91c1c",
                      }}
                    >
                      ⚠️ Muted — Incident Mode
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>
                  {notificationsEnabled
                    ? "Drivers can currently see rejection and dropped status alerts on their dashboard. Sponsors can see drivers who have been flagged/warned"
                    : "All driver notification banners are suppressed. Re-enable once the incident is resolved."}
                </div>
              </div>

              <button
                type="button"
                disabled={settingsToggling}
                onClick={handleNotificationsToggle}
                style={{
                  padding: "9px 20px",
                  borderRadius: 8,
                  border: "none",
                  background: notificationsEnabled ? "#ef4444" : "#10b981",
                  color: "#fff",
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: settingsToggling ? "not-allowed" : "pointer",
                  opacity: settingsToggling ? 0.6 : 1,
                  whiteSpace: "nowrap",
                }}
              >
                {settingsToggling
                  ? "Saving..."
                  : notificationsEnabled
                  ? "Disable Notifications"
                  : "Re-enable Notifications"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const selectStyle = {
  padding: "7px 12px",
  borderRadius: 8,
  border: "1px solid var(--border, #d1d5db)",
  fontSize: 13,
  background: "var(--card)",
  color: "var(--text)",
  cursor: "pointer",
};

const pageBtn = {
  padding: "6px 16px",
  borderRadius: 8,
  border: "1px solid var(--border, #d1d5db)",
  background: "var(--card)",
  color: "var(--text)",
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
};
