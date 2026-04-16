import React, { useState, useEffect, useCallback } from "react";

const ADMIN_API = "/admin";

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

export default function AdminDashboard({ token, onLogout, onAssumeUser }) {
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

  // Bulk Upload State
  const [bulkUploadResult, setBulkUploadResult] = useState(null);
  const [bulkUploading, setBulkUploading] = useState(false);

  // Assume Identity state
  const [assumingId, setAssumingId] = useState(null);

  // ── Reports state ────────────────────────────────────────────────────────────
  const [reportSection, setReportSection] = useState("sales-by-sponsor");
  // shared filter fields
  const [rptSponsorId,  setRptSponsorId]  = useState("");
  const [rptDriverId,   setRptDriverId]   = useState("");
  const [rptStartDate,  setRptStartDate]  = useState("");
  const [rptEndDate,    setRptEndDate]    = useState("");
  const [rptView,       setRptView]       = useState("summary");
  const [rptCategory,   setRptCategory]   = useState("ALL");
  // data + status
  const [rptData,       setRptData]       = useState(null);
  const [rptLoading,    setRptLoading]    = useState(false);
  const [rptError,      setRptError]      = useState("");
  const [rptDownloading, setRptDownloading] = useState(false);
  // sponsor + driver lists for dropdowns
  const [rptSponsors,   setRptSponsors]   = useState([]);
  const [rptDrivers,    setRptDrivers]    = useState([]);

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

  const handleAdminBulkUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setBulkUploading(true);
    setBulkUploadResult(null);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${ADMIN_API}/bulk-upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Bulk upload failed");
      setBulkUploadResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBulkUploading(false);
      e.target.value = "";
    }
  };
  

  const handleAssumeIdentity = async (userId, displayName) => {
    if (!window.confirm(`Assume the identity of "${displayName}"? You will be redirected to their dashboard.`)) return;
    setAssumingId(userId);
    try {
      const res = await fetch(`${ADMIN_API}/assume-user/${userId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to assume identity");
      // Switch session to the assumed user — handleLogin in App.js sets token + role
      if (onAssumeUser) onAssumeUser(data.token, data.user?.role);
    } catch (err) {
      setSponsorError(err.message);
      setDriverError(err.message);
    } finally {
      setAssumingId(null);
    }
  };

  // ── Reports: load sponsor + driver lists when tab opens ─────────────────────
  useEffect(() => {
    if (activeTab !== "reports") return;
    // load sponsor list for filter dropdown
    fetch(`${ADMIN_API}/sponsors`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setRptSponsors(d.sponsors || []))
      .catch(() => {});
    // load driver list for filter dropdown
    fetch(`${ADMIN_API}/drivers`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setRptDrivers(d.drivers || []))
      .catch(() => {});
  }, [activeTab, token]);

  // Reset data when section or key filters change
  useEffect(() => {
    setRptData(null);
    setRptError("");
  }, [reportSection, rptSponsorId, rptDriverId, rptStartDate, rptEndDate, rptView, rptCategory]);

  const buildRptParams = () => {
    const p = new URLSearchParams();
    if (rptSponsorId) p.set("sponsorId", rptSponsorId);
    if (rptDriverId)  p.set("driverId",  rptDriverId);
    if (rptStartDate) p.set("startDate", rptStartDate);
    if (rptEndDate)   p.set("endDate",   rptEndDate);
    if (rptView)      p.set("view",      rptView);
    if (rptCategory && rptCategory !== "ALL") p.set("category", rptCategory);
    return p;
  };

  const handleRunReport = async () => {
    setRptLoading(true);
    setRptError("");
    setRptData(null);
    try {
      const params = buildRptParams();
      const res = await fetch(`${ADMIN_API}/reports/${reportSection}?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load report");
      setRptData(data);
    } catch (err) {
      setRptError(err.message);
    } finally {
      setRptLoading(false);
    }
  };

  const handleDownloadCsv = async () => {
    setRptDownloading(true);
    try {
      const params = buildRptParams();
      params.set("format", "csv");
      const res = await fetch(`${ADMIN_API}/reports/${reportSection}?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to download CSV");
      const blob = await res.blob();
      const url  = window.URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `${reportSection}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setRptError(err.message);
    } finally {
      setRptDownloading(false);
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div style={{ maxWidth: 1100, margin: "30px auto", padding: 20 }}>
      <h1 style={{ margin: 0, marginBottom: 4 }}>Admin Dashboard</h1>

      <div style={{ display: "flex", gap: 8, marginTop: 16, marginBottom: 24, flexWrap: "wrap" }}>
        {["feedback", "sponsors", "drivers", "bulk upload", "reports", "settings"].map((tab) => (
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
              : tab === "bulk upload"
              ? "Bulk Upload"
              : tab === "reports"
              ? "📊 Reports"
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

                      <button
                        type="button"
                        disabled={assumingId === s.user_id}
                        onClick={() => handleAssumeIdentity(s.user_id, s.name)}
                        style={{
                          padding: "7px 16px",
                          borderRadius: 8,
                          border: "1px solid #a78bfa",
                          background: "#ede9fe",
                          color: "#5b21b6",
                          fontWeight: 600,
                          fontSize: 13,
                          cursor: assumingId === s.user_id ? "not-allowed" : "pointer",
                          opacity: assumingId === s.user_id ? 0.6 : 1,
                        }}
                      >
                        {assumingId === s.user_id ? "Switching..." : "👤 Assume"}
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

                      <button
                        type="button"
                        disabled={assumingId === d.user_id}
                        onClick={() => handleAssumeIdentity(d.user_id, d.email)}
                        style={{
                          padding: "7px 16px",
                          borderRadius: 8,
                          border: "1px solid #a78bfa",
                          background: "#ede9fe",
                          color: "#5b21b6",
                          fontWeight: 600,
                          fontSize: 13,
                          cursor: assumingId === d.user_id ? "not-allowed" : "pointer",
                          opacity: assumingId === d.user_id ? 0.6 : 1,
                        }}
                      >
                        {assumingId === d.user_id ? "Switching..." : "👤 Assume"}
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
  
      {/* -- Bulk Upload Tab -- */}
      {activeTab === "bulk upload" && (
        <div style={{ maxWidth: 640 }}>
          <h2 style={{ marginTop: 0, marginBottom: 4}}>Bulk Upload</h2>
            <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 0, marginBottom: 16 }}>
              Upload a pipe-delimited (<code>|</code>) text file to bulk create organizations, drivers, or sponsor users.
              One record per line.
            </p>

            <div style={{
              background: "var(--card)", border: "1px solid var(--border, #e5e7eb)",
              borderRadius: 10, padding: 14, marginBottom: 16, fontSize: 13, lineHeight: 1.7,
            }}>
              <strong>File format</strong> (one record per line):<br />
              <code style={{ display: "block", marginTop: 6 }}>O|Organization Name</code>
              <code style={{ display: "block" }}>D|orgName|firstName|lastName|email|points (optional)|reason (required if points given)</code>
              <code style={{ display: "block" }}>S|orgName|firstName|lastName|email</code>
              <ul style={{ margin: "8px 0 0 16px", padding: 0, color: "var(--muted)", fontSize: 12 }}>
                <li><strong>O</strong> — create a new sponsor organization</li>
                <li><strong>D</strong> — create or update a driver (auto-accepted); org must exist or appear earlier in file</li>
                <li><strong>S</strong> — create a sponsor user (no points allowed); org must exist or appear earlier in file</li>
                <li>If driver already exists, their points are updated</li>
              </ul>
            </div>

            <label style={{
              display: "inline-block", padding: "9px 20px", borderRadius: 8,
              background: bulkUploading ? "#a5b4fc" : "#4f46e5", color: "#fff",
              fontWeight: 700, fontSize: 14,
              cursor: bulkUploading ? "not-allowed" : "pointer",
            }}>
              {bulkUploading ? "Uploading..." : "Choose File & Upload"}
              <input
                type="file"
                accept=".txt,.csv,.tsv"
                style={{ display: "none" }}
                onChange={handleAdminBulkUpload}
                disabled={bulkUploading}
              />
            </label>

            {bulkUploadResult && (
              <div style={{ marginTop: 20 }}>
                <div style={{
                  padding: "10px 14px", borderRadius: 8,
                  background: "#d1fae5", color: "#065f46",
                  marginBottom: 12, fontWeight: 600
                }}>
                  ✅ {bulkUploadResult.processed} row{bulkUploadResult.processed !== 1 ? "s" : ""} processed successfully
                </div>

                {/* Successful rows */}
                {bulkUploadResult.results && bulkUploadResult.results.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <p style={{ fontWeight: 700, color: "#065f46", marginBottom: 8 }}>Processed rows:</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {bulkUploadResult.results.map((r, i) => (
                        <div key={i} style={{
                          padding: "6px 12px", borderRadius: 8,
                          background: "#ecfdf5", color: "#065f46",
                          border: "1px solid #6ee7b7", fontSize: 13,
                          display: "flex", justifyContent: "space-between", alignItems: "center",
                        }}>
                          <span>
                            <strong>Line {r.line}:</strong> [{r.type}]{" "}
                            {r.type === "O" ? r.orgName : r.email}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {bulkUploadResult.errors.length > 0 && (
                  <div>
                    <p style={{ fontWeight: 700, color: "#991b1b", marginBottom: 8 }}>
                      ⚠ {bulkUploadResult.errors.length} issue{bulkUploadResult.errors.length !== 1 ? "s" : ""} found:
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {bulkUploadResult.errors.map((e, i) => (
                        <div key={i} style={{
                          padding: "8px 12px", borderRadius: 8,
                          background: "#fef2f2", color: "#991b1b",
                          border: "1px solid #fca5a5", fontSize: 13
                        }}>
                          <strong>Line {e.line}:</strong> {e.error}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      {/* ── Reports tab ── */}
      {activeTab === "reports" && (() => {
        const AUDIT_CATS = ["ALL","LOGIN_SUCCESS","LOGIN_FAIL","PASSWORD_CHANGE","POINTS_AWARDED","POINTS_REVERSED","DRIVER_APP_ACCEPTED","DRIVER_APP_REJECTED","ADMIN_ASSUME_IDENTITY","SPONSOR_ASSUME_DRIVER","BULK_UPLOAD_ROW","SPONSOR_LOCK_TOGGLE","POINT_VALUE_CHANGED"];
        const thStyle = { padding: "10px 12px", textAlign: "left", fontWeight: 700, fontSize: 13, borderBottom: "2px solid #e5e7eb", background: "#f9fafb", whiteSpace: "nowrap" };
        const tdStyle = { padding: "8px 12px", fontSize: 13, borderBottom: "1px solid #f3f4f6", verticalAlign: "top" };
        const tdAlt   = { ...tdStyle, background: "#f9fafb" };

        const filterCard = (
          <div style={{ background: "var(--card,#fff)", border: "1px solid var(--border,#e5e7eb)", borderRadius: 12, padding: 18, marginBottom: 20 }}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
              {/* Sponsor filter — all sections */}
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--muted,#6b7280)", marginBottom: 4 }}>Sponsor</label>
                <select value={rptSponsorId} onChange={(e) => { setRptSponsorId(e.target.value); setRptDriverId(""); }} style={selectStyle}>
                  <option value="">All Sponsors</option>
                  {rptSponsors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              {/* Driver filter — sales-by-driver only */}
              {reportSection === "sales-by-driver" && (
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--muted,#6b7280)", marginBottom: 4 }}>Driver</label>
                  <select value={rptDriverId} onChange={(e) => setRptDriverId(e.target.value)} style={selectStyle}>
                    <option value="">All Drivers</option>
                    {rptDrivers
                      .filter((d) => !rptSponsorId || String(d.sponsor_id) === String(rptSponsorId))
                      .map((d) => <option key={d.user_id} value={d.user_id}>{d.email}</option>)}
                  </select>
                </div>
              )}

              {/* Date range */}
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--muted,#6b7280)", marginBottom: 4 }}>Start Date</label>
                <input type="date" value={rptStartDate} onChange={(e) => setRptStartDate(e.target.value)} style={{ ...selectStyle, padding: "6px 10px" }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--muted,#6b7280)", marginBottom: 4 }}>End Date</label>
                <input type="date" value={rptEndDate} onChange={(e) => setRptEndDate(e.target.value)} style={{ ...selectStyle, padding: "6px 10px" }} />
              </div>

              {/* View toggle — sales sections */}
              {(reportSection === "sales-by-sponsor" || reportSection === "sales-by-driver") && (
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--muted,#6b7280)", marginBottom: 4 }}>View</label>
                  <select value={rptView} onChange={(e) => setRptView(e.target.value)} style={selectStyle}>
                    <option value="summary">Summary</option>
                    <option value="detail">Detail</option>
                  </select>
                </div>
              )}

              {/* Category filter — audit section */}
              {reportSection === "audit" && (
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--muted,#6b7280)", marginBottom: 4 }}>Category</label>
                  <select value={rptCategory} onChange={(e) => setRptCategory(e.target.value)} style={selectStyle}>
                    {AUDIT_CATS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              )}

              <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
                <button type="button" onClick={handleRunReport} disabled={rptLoading}
                  style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "#4f46e5", color: "#fff", fontWeight: 700, fontSize: 13, cursor: rptLoading ? "not-allowed" : "pointer", opacity: rptLoading ? 0.6 : 1 }}>
                  {rptLoading ? "Loading…" : "Run Report"}
                </button>
                <button type="button" onClick={handleDownloadCsv} disabled={rptDownloading}
                  style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid var(--border,#d1d5db)", background: "var(--card,#fff)", color: "var(--text,#111)", fontWeight: 600, fontSize: 13, cursor: rptDownloading ? "not-allowed" : "pointer", opacity: rptDownloading ? 0.6 : 1 }}>
                  {rptDownloading ? "Exporting…" : "⬇ CSV"}
                </button>
              </div>
            </div>
          </div>
        );

        return (
          <div>
            <h2 style={{ marginTop: 0, marginBottom: 4 }}>Reports</h2>
            <p style={{ color: "var(--muted,#6b7280)", fontSize: 14, marginTop: 0, marginBottom: 20 }}>
              Generate and export system-wide reports. All reports can be downloaded as CSV.
            </p>

            {/* Sub-section nav */}
            <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
              {[
                { key: "sales-by-sponsor", label: "Sales by Sponsor" },
                { key: "sales-by-driver",  label: "Sales by Driver" },
                { key: "invoice",          label: "Invoice" },
                { key: "audit",            label: "Audit Log" },
              ].map(({ key, label }) => (
                <button key={key} type="button"
                  onClick={() => { setReportSection(key); setRptData(null); setRptError(""); }}
                  style={{ padding: "6px 16px", borderRadius: 20, border: `1px solid ${reportSection === key ? "#4f46e5" : "var(--border,#d1d5db)"}`, background: reportSection === key ? "#ede9fe" : "var(--card,#fff)", color: reportSection === key ? "#4f46e5" : "var(--text,#111)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                  {label}
                </button>
              ))}
            </div>

            {filterCard}

            {rptError && (
              <div style={{ padding: "10px 14px", borderRadius: 8, background: "#fef2f2", color: "#991b1b", marginBottom: 16 }}>
                {rptError}
              </div>
            )}

            {/* ── Sales by Sponsor ── */}
            {reportSection === "sales-by-sponsor" && rptData && (() => {
              if (rptData.view === "summary") {
                const rows = rptData.rows || [];
                const totPurchases = rows.reduce((s, r) => s + Number(r.totalPurchases), 0);
                const totDollars   = rows.reduce((s, r) => s + Number(r.totalDollars), 0).toFixed(2);
                const totFee       = rows.reduce((s, r) => s + Number(r.companyFee), 0).toFixed(2);
                return (
                  <div>
                    <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
                      {[["Total Sponsors", rows.length], ["Total Purchases", totPurchases], ["Total Sales", `$${totDollars}`], ["Company Fee (1%)", `$${totFee}`]].map(([label, val]) => (
                        <div key={label} style={{ flex: 1, minWidth: 120, background: "var(--card,#fff)", border: "1px solid var(--border,#e5e7eb)", borderRadius: 10, padding: "12px 16px" }}>
                          <div style={{ fontSize: 11, color: "var(--muted,#6b7280)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
                          <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text,#111)", marginTop: 4 }}>{val}</div>
                        </div>
                      ))}
                    </div>
                    {rows.length === 0 ? <p style={{ color: "var(--muted,#6b7280)" }}>No purchases found for the selected filters.</p> : (
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                          <thead>
                            <tr>
                              {["Sponsor", "Purchases", "Points Redeemed", "Total Sales", "Company Fee (1%)"].map((h) => <th key={h} style={thStyle}>{h}</th>)}
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((r, i) => (
                              <tr key={r.sponsorId}>
                                <td style={i % 2 ? tdAlt : tdStyle}><strong>{r.sponsorName}</strong></td>
                                <td style={i % 2 ? tdAlt : tdStyle}>{r.totalPurchases}</td>
                                <td style={i % 2 ? tdAlt : tdStyle}>{r.totalPoints?.toLocaleString()} pts</td>
                                <td style={i % 2 ? tdAlt : tdStyle}>${Number(r.totalDollars).toFixed(2)}</td>
                                <td style={{ ...(i % 2 ? tdAlt : tdStyle), color: "#16a34a", fontWeight: 700 }}>${Number(r.companyFee).toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              }
              // detail
              const rows = rptData.rows || [];
              return rows.length === 0 ? <p style={{ color: "var(--muted,#6b7280)" }}>No purchases found.</p> : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr>{["Sponsor", "Driver", "Item", "Artist", "Kind", "Points", "Value", "Date"].map((h) => <th key={h} style={thStyle}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={i}>
                          <td style={i % 2 ? tdAlt : tdStyle}>{r.sponsorName}</td>
                          <td style={i % 2 ? tdAlt : tdStyle}>{r.driverEmail}</td>
                          <td style={i % 2 ? tdAlt : tdStyle}>{r.itemName}</td>
                          <td style={i % 2 ? tdAlt : tdStyle}>{r.artist ?? "—"}</td>
                          <td style={i % 2 ? tdAlt : tdStyle}>{r.kind ?? "—"}</td>
                          <td style={i % 2 ? tdAlt : tdStyle}>{r.pointsCost} pts</td>
                          <td style={i % 2 ? tdAlt : tdStyle}>${Number(r.dollarValue).toFixed(2)}</td>
                          <td style={i % 2 ? tdAlt : tdStyle}>{new Date(r.purchasedAt).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}

            {/* ── Sales by Driver ── */}
            {reportSection === "sales-by-driver" && rptData && (() => {
              if (rptData.view === "summary") {
                const rows = rptData.rows || [];
                return rows.length === 0 ? <p style={{ color: "var(--muted,#6b7280)" }}>No purchases found.</p> : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr>{["Driver", "Sponsor", "Purchases", "Points Redeemed", "Total Sales"].map((h) => <th key={h} style={thStyle}>{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {rows.map((r, i) => (
                          <tr key={`${r.driverUserId}-${i}`}>
                            <td style={i % 2 ? tdAlt : tdStyle}><strong>{r.driverEmail}</strong></td>
                            <td style={i % 2 ? tdAlt : tdStyle}>{r.sponsorName}</td>
                            <td style={i % 2 ? tdAlt : tdStyle}>{r.totalPurchases}</td>
                            <td style={i % 2 ? tdAlt : tdStyle}>{r.totalPoints?.toLocaleString()} pts</td>
                            <td style={i % 2 ? tdAlt : tdStyle}>${Number(r.totalDollars).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              }
              const rows = rptData.rows || [];
              return rows.length === 0 ? <p style={{ color: "var(--muted,#6b7280)" }}>No purchases found.</p> : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr>{["Driver", "Sponsor", "Item", "Artist", "Kind", "Points", "Value", "Date"].map((h) => <th key={h} style={thStyle}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={i}>
                          <td style={i % 2 ? tdAlt : tdStyle}>{r.driverEmail}</td>
                          <td style={i % 2 ? tdAlt : tdStyle}>{r.sponsorName}</td>
                          <td style={i % 2 ? tdAlt : tdStyle}>{r.itemName}</td>
                          <td style={i % 2 ? tdAlt : tdStyle}>{r.artist ?? "—"}</td>
                          <td style={i % 2 ? tdAlt : tdStyle}>{r.kind ?? "—"}</td>
                          <td style={i % 2 ? tdAlt : tdStyle}>{r.pointsCost} pts</td>
                          <td style={i % 2 ? tdAlt : tdStyle}>${Number(r.dollarValue).toFixed(2)}</td>
                          <td style={i % 2 ? tdAlt : tdStyle}>{new Date(r.purchasedAt).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}

            {/* ── Invoice ── */}
            {reportSection === "invoice" && rptData && (() => {
              const invoices = rptData.invoices || [];
              if (invoices.length === 0) return <p style={{ color: "var(--muted,#6b7280)" }}>No purchases found for the selected filters.</p>;
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                  {invoices.map((inv) => (
                    <div key={inv.sponsorId} style={{ border: "1px solid var(--border,#e5e7eb)", borderRadius: 12, overflow: "hidden" }}>
                      <div style={{ background: "#4f46e5", color: "#fff", padding: "12px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: 16 }}>{inv.sponsorName}</div>
                          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>Invoice — Generated {new Date().toLocaleDateString()}</div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 11, opacity: 0.8 }}>Total Fee Due</div>
                          <div style={{ fontWeight: 800, fontSize: 22 }}>${Number(inv.totalFee).toFixed(2)}</div>
                        </div>
                      </div>
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                          <thead>
                            <tr>{["Driver", "Purchases", "Points Redeemed", "Driver Sales", "Fee (1%)"].map((h) => <th key={h} style={thStyle}>{h}</th>)}</tr>
                          </thead>
                          <tbody>
                            {inv.drivers.map((d, i) => (
                              <tr key={d.driverUserId}>
                                <td style={i % 2 ? tdAlt : tdStyle}>{d.driverEmail}</td>
                                <td style={i % 2 ? tdAlt : tdStyle}>{d.purchaseCount}</td>
                                <td style={i % 2 ? tdAlt : tdStyle}>{d.totalPoints?.toLocaleString()} pts</td>
                                <td style={i % 2 ? tdAlt : tdStyle}>${Number(d.driverSales).toFixed(2)}</td>
                                <td style={{ ...(i % 2 ? tdAlt : tdStyle), color: "#16a34a", fontWeight: 700 }}>${Number(d.driverFee).toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr style={{ background: "#f0fdf4" }}>
                              <td colSpan={3} style={{ padding: "10px 12px", fontWeight: 700, fontSize: 13 }}>TOTAL</td>
                              <td style={{ padding: "10px 12px", fontWeight: 700, fontSize: 13 }}>${Number(inv.totalSales).toFixed(2)}</td>
                              <td style={{ padding: "10px 12px", fontWeight: 800, fontSize: 14, color: "#15803d" }}>${Number(inv.totalFee).toFixed(2)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* ── Audit Log ── */}
            {reportSection === "audit" && rptData && (() => {
              const rows = rptData.rows || [];
              const BADGE = {
                LOGIN_SUCCESS:        { bg: "#d1fae5", color: "#065f46" },
                LOGIN_FAIL:           { bg: "#fee2e2", color: "#991b1b" },
                PASSWORD_CHANGE:      { bg: "#dbeafe", color: "#1e40af" },
                POINTS_AWARDED:       { bg: "#ede9fe", color: "#4c1d95" },
                POINTS_REVERSED:      { bg: "#fef3c7", color: "#92400e" },
                DRIVER_APP_ACCEPTED:  { bg: "#d1fae5", color: "#065f46" },
                DRIVER_APP_REJECTED:  { bg: "#fee2e2", color: "#991b1b" },
                ADMIN_ASSUME_IDENTITY:{ bg: "#f3e8ff", color: "#6b21a8" },
                SPONSOR_ASSUME_DRIVER:{ bg: "#f3e8ff", color: "#6b21a8" },
              };
              const badge = (cat) => {
                const s = BADGE[cat] || { bg: "#f3f4f6", color: "#374151" };
                return <span style={{ padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 700, background: s.bg, color: s.color, whiteSpace: "nowrap" }}>{cat}</span>;
              };
              return rows.length === 0 ? <p style={{ color: "var(--muted,#6b7280)" }}>No audit entries found.</p> : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr>{["Date", "Category", "Actor", "Target", "Sponsor", "✓", "Details"].map((h) => <th key={h} style={thStyle}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={r.id}>
                          <td style={i % 2 ? tdAlt : tdStyle}>{new Date(r.occurredAt).toLocaleString()}</td>
                          <td style={i % 2 ? tdAlt : tdStyle}>{badge(r.category)}</td>
                          <td style={i % 2 ? tdAlt : tdStyle}>{r.actorEmail ?? <span style={{ color: "#9ca3af" }}>system</span>}</td>
                          <td style={i % 2 ? tdAlt : tdStyle}>{r.targetEmail ?? "—"}</td>
                          <td style={i % 2 ? tdAlt : tdStyle}>{r.sponsorName ?? "—"}</td>
                          <td style={i % 2 ? tdAlt : tdStyle}>{r.success ? "✅" : "❌"}</td>
                          <td style={{ ...(i % 2 ? tdAlt : tdStyle), maxWidth: 300, wordBreak: "break-word" }}>{r.details ?? ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}

            {!rptLoading && !rptData && !rptError && (
              <p style={{ color: "var(--muted,#6b7280)", fontSize: 14 }}>
                Select filters above and click <strong>Run Report</strong> to view results.
              </p>
            )}
          </div>
        );
      })()}

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
                    : "All driver and sponsor notification banners are suppressed. Re-enable once the incident is resolved."}
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
