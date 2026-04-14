import React, { useState, useEffect, useCallback } from "react";
import "./SponsorProfile.css";
import FeedbackForm from "./feedbackForm";
import SponsorPostsManager from "./SponsorPostsManager";

const SPONSOR_API   = "http://localhost:8001/sponsor";
const BACKEND_BASE  = "http://localhost:8001";
const ITUNES_API   = "https://itunes.apple.com/search";
const CAT_CATEGORIES = [
  { label: "Music",  media: "music",    entity: "song"      },
  { label: "Movies", media: "movie",    entity: "movie"     },
  { label: "Apps",   media: "software", entity: "software"  },
  { label: "Books",  media: "ebook",    entity: "ebook"     },
  { label: "TV",     media: "tvShow",   entity: "tvEpisode" },
];

export default function SponsorProfile({ token, onLogout, onChangeUsername }) {
  // ─── Org photo state ────────────────────────────────────────────────────────
  const [orgPhotoUrl,       setOrgPhotoUrl]       = useState(null);
  const [orgPhotoUploading, setOrgPhotoUploading] = useState(false);
  const [orgPhotoError,     setOrgPhotoError]     = useState("");

  // ─── Existing profile state (unchanged) ────────────────────────────────────
  const [profile, setProfile] = useState({
    company_name: "",
    contact_name: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    zip_code: "",
    point_value: "0.01"
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  // ─── NEW: Driver management state ──────────────────────────────────────────
  const [drivers, setDrivers] = useState([]);
  const [applications, setApplications] = useState([]);
  const [driverLoading, setDriverLoading] = useState(false);
  const [driverError, setDriverError] = useState("");
  const [driverSuccess, setDriverSuccess] = useState("");
  const [blockReason, setBlockReason] = useState({});       // { [driverId]: "reason text" }
  const [activeTab, setActiveTab] = useState("drivers");     // "drivers" | "applications" | "catalog" | "reports"
  const [ratings, setRatings] = useState({});               // { [driverId]: "thumbs_up" | "thumbs_down" | null }
  const [sortByRating, setSortByRating] = useState(false);  // when true, sort thumbs_up to top
  const [sortByPoints, setSortByPoints] = useState(null); // null, desc, asc, null
  const [reversePointsInput, setReversePointsInput] = useState({}); // { [driverId]: "25" }
  const [reverseReasonInput, setReverseReasonInput] = useState({}); // { [driverId]: "reason" }
  const [reversingDriverId, setReversingDriverId] = useState(null);
  const [exportingReport, setExportingReport] = useState(false);
  const [probationReasonInput, setProbationReasonInput] = useState({});
  const [dropReasonInput, setDropReasonInput] = useState({});
  const [probatingDriverId, setProbatingDriverId] = useState(null);
  const [droppingDriverId, setDroppingDriverId] = useState(null);
  const [exportingReportCsv, setExportingReportCsv] = useState(false);

  // ─── Catalog hide/unhide state ──────────────────────────────────────────────
  const [hiddenIds,      setHiddenIds]      = useState(new Set());
  const [hiddenProducts, setHiddenProducts] = useState({});   // { productId: fullDetails }
  const [showHiddenOnly, setShowHiddenOnly] = useState(false);
  const [catalogResults, setCatalogResults] = useState([]);
  const [catalogInput,   setCatalogInput]   = useState("");
  const [catalogCat,     setCatalogCat]     = useState(CAT_CATEGORIES[0]);
  const [catalogLoading, setCatalogLoading] = useState(false);

  // Notifications --------------------------
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [dismissedIds, setDismissedIds] = useState([]);
  const [droppedDismissed, setDroppedDismissed] = useState(false);
  const [flagDismissedIds, setFlagDismissedIds] = useState([]);

  // Bulk Upload -----------------------------
  const [bulkUploadResult, setBulkUploadResult] = useState(null);
  const [bulkUploading, setBulkUploading] = useState(false);
  

  // ─── Existing profile fetch ────────────────────────────────────
  const fetchProfile = useCallback(async () => {
    try {
      setLoading(true);
      // GET /sponsor/org returns: { sponsorId, sponsorName, sponsorStatus, address, contactName, contactEmail, contactPhone }
      const res = await fetch(`${SPONSOR_API}/org`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setProfile({
          company_name: data.sponsorName || "",
          contact_name: data.contactName || "",
          phone: data.contactPhone || "",
          address: data.address || "",
          city: "",
          state: "",
          zip_code: "",
          point_value: "0.01"
        });
        setOrgPhotoUrl(data.orgPhotoUrl || null);
        setIsEditing(false);
      } else if (res.status === 404) {
        setIsEditing(true);
      } else {
        throw new Error(data.error || data.message || "Failed to fetch profile");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // Notifications Fetch
  useEffect(() => {
      if (!token) return;
      (async () => {
        try {
          const res = await fetch(`${SPONSOR_API}/settings/notifications`, {
            headers: {Authorization: `Bearer ${token}`},
          });
          const data = await res.json();
          if (res.ok) setNotificationsEnabled(data.notifications_enabled);
        } catch(err) {
          console.error(err);
        }
      }) ();
    }, [token]);

  const handleChange = (e) => {
    setProfile({ ...profile, [e.target.name]: e.target.value });
    setError("");
    setSuccess("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSaving(true);
    try {
      if (!profile.company_name) throw new Error("Company name is required");

      const res = await fetch(`${SPONSOR_API}/org`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({
          name:         profile.company_name,
          contactName:  profile.contact_name,
          contactPhone: profile.phone,
          address:      [profile.address, profile.city, profile.state, profile.zip_code]
                          .filter(Boolean).join(", "),
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || "Failed to save profile");
      setSuccess(data.message);
      setIsEditing(false);
      await fetchProfile();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    fetchProfile();
    setIsEditing(false);
    setError("");
    setSuccess("");
  };

  const handleOrgPhotoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setOrgPhotoError("File size must be under 5MB");
      return;
    }
    setOrgPhotoError("");
    setOrgPhotoUploading(true);
    try {
      const formData = new FormData();
      formData.append("photo", file);
      const res = await fetch(`${SPONSOR_API}/org/photo`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setOrgPhotoUrl(data.orgPhotoUrl);
    } catch (err) {
      setOrgPhotoError(err.message);
    } finally {
      setOrgPhotoUploading(false);
      e.target.value = "";
    }
  };

  const handleBulkUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBulkUploading(true);
    setBulkUploadResult(null);
    setDriverError("");
    setDriverSuccess("");

    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${SPONSOR_API}/bulk-upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new error(data.error || "Bulk upload failed");
      setBulkUploadResult(data);
      if (data.processed > 0) fetchDrivers();
    } catch (err) {
      setDriverError(err.message);
    } finally {
      setBulkUploading(false);
      e.target.value = "";
    }
  };

  // ─── Driver management functions ──────────────────────────────────────

  const fetchDrivers = useCallback(async () => {
    setDriverLoading(true);
    setDriverError("");
    try {
      const res = await fetch(`${SPONSOR_API}/drivers`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch drivers");
      const driverList = data.drivers || [];
      setDrivers(driverList);
      

      // Fetch existing ratings for all drivers in parallel
      const ratingEntries = await Promise.all(
        driverList
          .filter((d) => d.driverId)
          .map(async (d) => {
            try {
              const r = await fetch(`${SPONSOR_API}/drivers/${d.driverId}/rate`, {
                headers: { "Authorization": `Bearer ${token}` }
              });
              const rd = await r.json();
              return [d.driverId, rd.rating || null];
            } catch {
              return [d.driverId, null];
            }
          })
      );
      setRatings(Object.fromEntries(ratingEntries));
    } catch (err) {
      setDriverError(err.message);
    } finally {
      setDriverLoading(false);
    }
  }, [token]);

  const fetchApplications = useCallback(async () => {
    setDriverLoading(true);
    setDriverError("");
    try {
      // Correct route: /sponsor/driver-applications
      const res = await fetch(`${SPONSOR_API}/driver-applications`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch applications");
      // Backend returns: { applications: [{ applicationId, email, status, appliedAt, ... }] }
      // Normalize to consistent shape used in JSX below
      const normalized = (data.applications || []).map((a) => ({
        id: a.applicationId,
        driver_email: a.email,
        status: a.status,
        applied_at: a.appliedAt,
      }));
      setApplications(normalized);
    } catch (err) {
      setDriverError(err.message);
    } finally {
      setDriverLoading(false);
    }
  }, [token]);


  // ─── Catalog functions ─────────────────────────────────────────────────────

  const fetchHiddenIds = useCallback(async () => {
    try {
      const res = await fetch(`${SPONSOR_API}/catalog/hidden`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.ok) {
        setHiddenIds(new Set(data.hiddenIds));
        const map = {};
        (data.hiddenProducts || []).forEach((p) => { map[p.product_id] = p; });
        setHiddenProducts(map);
      }
    } catch (err) {
      setDriverError(err.message);
    }
  }, [token]);

  useEffect(() => {
    fetchDrivers();
  }, [fetchDrivers]);

  useEffect(() => {
    if (activeTab === "drivers") fetchDrivers();
    else if (activeTab === "applications") fetchApplications();
    else if (activeTab === "catalog") fetchHiddenIds();
  }, [activeTab, fetchDrivers, fetchApplications, fetchHiddenIds]);

  const fetchCatalog = async (term, category) => {
    setCatalogLoading(true);
    setCatalogResults([]);
    try {
      const url = `${ITUNES_API}?term=${encodeURIComponent(term || "top hits")}&media=${category.media}&entity=${category.entity}&limit=24&country=US`;
      const res  = await fetch(url);
      const data = await res.json();
      setCatalogResults(data.results || []);
    } catch {
      setDriverError("Catalog search failed.");
    }
    setCatalogLoading(false);
  };

  const handleToggleHide = async (item) => {
    const productId = String(item.trackId || item.collectionId);
    const isHidden  = hiddenIds.has(productId);
    try {
      if (isHidden) {
        await fetch(`${SPONSOR_API}/catalog/unhide`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ productId }),
        });
        setHiddenIds((prev) => { const s = new Set(prev); s.delete(productId); return s; });
        setHiddenProducts((prev) => { const m = { ...prev }; delete m[productId]; return m; });
      } else {
        await fetch(`${SPONSOR_API}/catalog/hide`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            productId,
            productName: item.trackName || item.collectionName || "",
            artistName:  item.artistName || "",
            artworkUrl:  item.artworkUrl100 || "",
            price:       item.trackPrice ?? item.price ?? 0,
          }),
        });
        setHiddenIds((prev) => new Set([...prev, productId]));
        setHiddenProducts((prev) => ({
          ...prev,
          [productId]: {
            product_id:   productId,
            product_name: item.trackName || item.collectionName || "",
            artist_name:  item.artistName || "",
            artwork_url:  item.artworkUrl100 || "",
          },
        }));
      }
    } catch (err) {
      setDriverError(err.message);
    }
  };

  const handleRate = async (driverId, rating) => {
    // Toggle off if clicking the same rating again
    const newRating = ratings[driverId] === rating ? null : rating;

    // Optimistic update
    setRatings((prev) => ({ ...prev, [driverId]: newRating }));

    try {
      if (newRating) {
        const res = await fetch(`${SPONSOR_API}/drivers/${driverId}/rate`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
          body: JSON.stringify({ rating: newRating }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to save rating");
      }
    } catch (err) {
      // Revert on failure
      setRatings((prev) => ({ ...prev, [driverId]: ratings[driverId] }));
      setDriverError(err.message);
    }
  };

  const handleBlock = async (driverId) => {
    const reason = blockReason[driverId] || "";
    if (!reason.trim()) {
      setDriverError("Please enter a reason before blocking a driver.");
      return;
    }
    setDriverError("");
    setDriverSuccess("");
    try {
      const res = await fetch(`${SPONSOR_API}/drivers/${driverId}/block`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ reason })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to block driver");
      setDriverSuccess(data.message);
      setBlockReason((prev) => ({ ...prev, [driverId]: "" }));
      fetchDrivers();
    } catch (err) {
      setDriverError(err.message);
    }
  };

  const handleUnblock = async (driverId) => {
    setDriverError("");
    setDriverSuccess("");
    try {
      const res = await fetch(`${SPONSOR_API}/drivers/${driverId}/unblock`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to unblock driver");
      setDriverSuccess(data.message);
      fetchDrivers();
    } catch (err) {
      setDriverError(err.message);
    }
  };

  const handleProbation = async(driverId) => {
    const reason = String(probationReasonInput[driverId] || "").trim();
    setProbatingDriverId(driverId);
    setDriverError("");
    setDriverSuccess("");
    try {
      const res = await fetch(`${SPONSOR_API}/drivers/${driverId}/probation`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason: reason || "No reason provided" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to place driver on probation");
      setDriverSuccess(data.message);
      setProbationReasonInput((prev) => ({ ...prev, [driverId]: "" }));
      fetchDrivers();
    } catch (err) {
      setDriverError(err.message);
    } finally {
      setProbatingDriverId(null);
    }
  };

  const handleLiftProbation = async (driverId) => {
    setDriverError("");
    setDriverSuccess("");
    try {
      const res = await fetch(`${SPONSOR_API}/drivers/${driverId}/lift-probation`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to lift probation");
      setDriverSuccess(data.message);
      fetchDrivers();
    } catch (err) {
      setDriverError(err.message);
    } 
  };

  const handleDrop = async (driverId) => {
    const reason = String(dropReasonInput[driverId] || "").trim();
    setDroppingDriverId(driverId);
    setDriverError("");
    setDriverSuccess("");
    try {
      const res = await fetch(`${SPONSOR_API}/drivers/${driverId}/drop`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason: reason || "No reason provided" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to drop driver");
      setDriverSuccess(data.message);
      setDropReasonInput((prev) => ({ ...prev, [driverId]: "" }));
      fetchDrivers();
    } catch (err) {
      setDriverError(err.message);
    } finally {
      setDroppingDriverId(null);
    }
  };

  const handleReversePoints = async (driverId) => {
    const rawPoints = reversePointsInput[driverId];
    const points = Number.parseInt(String(rawPoints || "").trim(), 10);
    if (!Number.isInteger(points) || points <= 0) {
      setDriverError("Enter a positive whole number of points to reverse.");
      return;
    }

    const reason = String(reverseReasonInput[driverId] || "").trim();

    setReversingDriverId(driverId);
    setDriverError("");
    setDriverSuccess("");
    try {
      const res = await fetch(`${SPONSOR_API}/drivers/${driverId}/reverse-points`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          points,
          reason: reason || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reverse points");

      setDriverSuccess(`Reversed ${data.reversedPoints} points. New balance: ${data.newBalance} points.`);
      setReversePointsInput((prev) => ({ ...prev, [driverId]: "" }));
      setReverseReasonInput((prev) => ({ ...prev, [driverId]: "" }));
      fetchDrivers();
    } catch (err) {
      setDriverError(err.message);
    } finally {
      setReversingDriverId(null);
    }
  };

  const handleExportReportPdf = async () => {
    setDriverError("");
    setDriverSuccess("");
    setExportingReport(true);
    try {
      const res = await fetch(`${SPONSOR_API}/reports/points.pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        let message = "Failed to export report";
        try {
          const data = await res.json();
          message = data.error || message;
        } catch {
          // Ignore non-JSON responses.
        }
        throw new Error(message);
      }

      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `sponsor-points-report-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
      setDriverSuccess("Report exported as PDF.");
    } catch (err) {
      setDriverError(err.message);
    } finally {
      setExportingReport(false);
    }
  };

  const handleExportReportCsv = async () => {
    setDriverError("");
    setDriverSuccess("");
    setExportingReportCsv(true);
    try {
      const res = await fetch(`${SPONSOR_API}/reports/points.csv`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        let message = "Failed to export report";
        try {
          const data = await res.json();
          message = data.error || message;
        } catch {
          // Ignore non-JSON responses.
        }
        throw new Error(message);
      }

      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `sponsor-points-report-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
      setDriverSuccess("Report exported as CSV.");
    } catch (err) {
      setDriverError(err.message);
    } finally {
      setExportingReportCsv(false);
    }
  };

  const handleApplicationAction = async (appId, action) => {
    setDriverError("");
    setDriverSuccess("");
    try {
      const res = await fetch(`${SPONSOR_API}/driver-applications/${appId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed to ${action} application`);
      setDriverSuccess(`Application ${action}d successfully`);
      fetchApplications();
    } catch (err) {
      setDriverError(err.message);
    }
  };

    const handleReopen = async (appId) => {
    setDriverError("");
    setDriverSuccess("");
    try {
      const res = await fetch(`${SPONSOR_API}/driver-applications/${appId}/reopen`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reopen application");
      setDriverSuccess(data.message);
      fetchApplications();
    } catch (err) {
      setDriverError(err.message);
    }
  };


  // ─── Status badge helper ────────────────────────────────────────────────────
  const StatusBadge = ({ status }) => {
    const colors = {
      ACTIVE:    { bg: "#d1fae5", color: "#065f46" },
      BLOCKED:   { bg: "#fee2e2", color: "#991b1b" },
      DROPPED:   { bg: "#fef3c7", color: "#92400e" },
      PROBATION: { bg: "#fef3c7", color: "#b45309" },
      PENDING:   { bg: "#dbeafe", color: "#1e40af" },
      ACCEPTED:  { bg: "#d1fae5", color: "#065f46" },
      REJECTED:  { bg: "#fee2e2", color: "#991b1b" },
    };
    const style = colors[status?.toUpperCase()] || { bg: "#f3f4f6", color: "#374151" };
    return (
      <span style={{
        padding: "2px 10px", borderRadius: 12, fontSize: 12, fontWeight: 600,
        background: style.bg, color: style.color
      }}>
        {status}
      </span>
    );
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="sponsor-profile-container"><div className="loading">Loading profile...</div></div>;
  }                
                
  return (
    <div className="sponsor-profile-container">
      {/* -- Notification Banners */}
      {notificationsEnabled && drivers
        .filter(d => d.flagged === 1 && !flagDismissedIds.includes(d.driverId))
        .map(d => (
          <div key={d.driverId} style={{
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
                🚩 Driver Flagged - {d.email}
              </div>  
              {d.adminNote && (
                <div style={{ color: "#b91c1c", fontSize: 13, marginTop: 4}}>
                  Note: {d.adminNote}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setFlagDismissedIds(prev => [...prev, d.driverId])}
              style={{
                background: "none", border: "none",
                fontSize: 18, cursor: "pointer",
                color: "#991b1b", lineHeight: 1, padding: "0 4px",
              }}
            >
              ×
            </button>
          </div>
        ))
      }
      {/* ── Page header ── */}
      <div className="profile-header">
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {/* Org logo */}
          <div style={{ flexShrink: 0 }}>
            {orgPhotoUrl ? (
              <img
                src={`${BACKEND_BASE}${orgPhotoUrl}`}
                alt="Org logo"
                style={{ width: 64, height: 64, borderRadius: 10, objectFit: "cover", border: "2px solid #e0e0e0" }}
              />
            ) : (
              <div style={{ width: 64, height: 64, borderRadius: 10, background: "#e5e7eb", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, userSelect: "none" }}>
                🏢
              </div>
            )}
          </div>
          <div>
            <h1 style={{ margin: 0 }}>Sponsor Profile</h1>
            <label style={{ cursor: orgPhotoUploading ? "not-allowed" : "pointer", fontSize: 13, color: "#4f46e5", fontWeight: 600, display: "block", marginTop: 2 }}>
              {orgPhotoUploading ? "Uploading…" : "Change logo"}
              <input
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={handleOrgPhotoChange}
                disabled={orgPhotoUploading}
              />
            </label>
            {orgPhotoError && <div style={{ color: "#b91c1c", fontSize: 12, marginTop: 2 }}>{orgPhotoError}</div>}
          </div>
        </div>
        <div className="header-actions">
          {!isEditing && (
            <button onClick={() => setIsEditing(true)} className="btn-edit">Edit Profile</button>
          )}
          {!isEditing && (
            <button onClick={onChangeUsername} className="btn-edit">Change Username</button>
          )}
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      {/* ── Existing profile form ── */}
      <form onSubmit={handleSubmit} className="profile-form">
        <div className="form-section">
          <h2>Company Information</h2>
          <div className="form-group">
            <label htmlFor="company_name">Company Name *</label>
            <input type="text" id="company_name" name="company_name" value={profile.company_name}
              onChange={handleChange} disabled={!isEditing} required />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="contact_name">Contact Name</label>
              <input type="text" id="contact_name" name="contact_name" value={profile.contact_name}
                onChange={handleChange} disabled={!isEditing} />
            </div>
            <div className="form-group">
              <label htmlFor="phone">Phone Number</label>
              <input type="tel" id="phone" name="phone" value={profile.phone}
                onChange={handleChange} disabled={!isEditing} placeholder="(555) 123-4567" />
            </div>
          </div>
        </div>

        <div className="form-section">
          <h2>Address</h2>
          <div className="form-group">
            <label htmlFor="address">Street Address</label>
            <input type="text" id="address" name="address" value={profile.address}
              onChange={handleChange} disabled={!isEditing} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="city">City</label>
              <input type="text" id="city" name="city" value={profile.city}
                onChange={handleChange} disabled={!isEditing} />
            </div>
            <div className="form-group">
              <label htmlFor="state">State</label>
              <input type="text" id="state" name="state" value={profile.state}
                onChange={handleChange} disabled={!isEditing} maxLength="2" placeholder="SC" />
            </div>
            <div className="form-group">
              <label htmlFor="zip_code">ZIP Code</label>
              <input type="text" id="zip_code" name="zip_code" value={profile.zip_code}
                onChange={handleChange} disabled={!isEditing} maxLength="10" />
            </div>
          </div>
        </div>

        <div className="form-section">
          <h2>Point Settings</h2>
          <div className="form-group">
            <label htmlFor="point_value">Point Value (Dollar per Point)</label>
            <input type="number" id="point_value" name="point_value" value={profile.point_value}
              onChange={handleChange} disabled={!isEditing} step="0.01" min="0" />
            <small className="form-hint">
              Default: $0.01 per point. This determines the dollar value of driver points.
            </small>
          </div>
        </div>

        {isEditing && (
          <div className="form-actions">
            <button type="submit" disabled={saving} className="btn-save">
              {saving ? "Saving..." : "Save Profile"}
            </button>
            <button type="button" onClick={handleCancel} className="btn-cancel">Cancel</button>
          </div>
        )}
      </form>

      {/* ── Driver Management Section ── */}
      <div className="form-section" style={{ marginTop: 40 }}>
        <h2>Driver Management</h2>

        {/* Tab bar */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {["drivers", "applications", "catalog", "posts", "reports", "bulk upload", "help & feedback"].map((tab) => (
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
                textTransform: "capitalize"
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {driverError && <div className="error-message">{driverError}</div>}
        {driverSuccess && <div className="success-message">{driverSuccess}</div>}

        {driverLoading && <p style={{ color: "#6b7280" }}>Loading...</p>}

        {/* Drivers tab */}
        {!driverLoading && activeTab === "drivers" && (
          drivers.length === 0
            ? <p style={{ color: "#6b7280" }}>No drivers found under your sponsor.</p>
            : (() => {
              const ratingScore = (d) =>
                ratings[d.driverId] === "thumbs_up" ? 1 :
                ratings[d.driverId] === "thumbs_down" ? -1 : 0;

                const sortedDrivers = (() => {
                  let list = [...drivers];
                  if (sortByRating) {
                    list.sort((a,b) => ratingScore(b) - ratingScore(a));
                  }
                  if (sortByPoints === "Descending") {
                    list.sort((a, b) => Number(b.currentPoints || 0) - Number(a.currentPoints || 0));
                  } else if (sortByPoints === "Ascending") {
                    list.sort((a, b) => Number(a.currentPoints || 0) - Number(b.currentPoints || 0));
                  }
                  return list;
                }) ();
  

              return (
              <div>
                {/* Sort control */}
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
                  <button
                    type="button"
                    onClick={() => setSortByRating((s) => !s)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "6px 14px",
                      borderRadius: 8,
                      border: sortByRating ? "2px solid #16a34a" : "1px solid var(--border, #d1d5db)",
                      background: sortByRating ? "#dcfce7" : "var(--card, #fff)",
                      color: sortByRating ? "#15803d" : "inherit",
                      fontWeight: 600,
                      fontSize: 13,
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    👍 {sortByRating ? "Sorted by reliability" : "Sort by reliability"}
                  </button>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
                  <button
                    type="button"
                    onClick={() => setSortByPoints(s => s === null ? "Descending" : s === "Descending" ? "Ascending" : null)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "6px 14px",
                      borderRadius: 8,
                      border: sortByPoints ? "2px solid #16a34a" : "1px solid var(--border, #d1d5db)",
                      background: sortByPoints ? "#dcfce7" : "var(--card, #fff)",
                      color: sortByPoints ? "#15803d" : "inherit",
                      fontWeight: 600,
                      fontSize: 13,
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    {sortByPoints === "Descending" ? "Points: High to Low"
                      : sortByPoints === "Ascending" ? "Points: Low to High"
                      : "Sort by Points"}
                  </button>
                </div>

                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
                      <th style={{ textAlign: "left", padding: "8px 12px" }}>Email</th>
                      <th style={{ textAlign: "left", padding: "8px 12px" }}>Status</th>
                      <th style={{ textAlign: "left", padding: "8px 12px" }}>Points</th>
                      <th style={{ textAlign: "left", padding: "8px 12px" }}>Reason</th>
                      <th style={{ textAlign: "left", padding: "8px 12px" }}>Reliability</th>
                      <th style={{ textAlign: "left", padding: "8px 12px" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedDrivers.map((d) => (
                    <tr key={d.driverId} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "10px 12px" }}>{d.flagged ? "🚩" : ""}  {d.email}</td>
                      <td style={{ padding: "10px 12px" }}><StatusBadge status={d.status} /></td>
                      <td style={{ padding: "10px 12px", fontWeight: 600 }}>
                        {d.currentPoints != null ? `${Number(d.currentPoints).toLocaleString()} pts` : "—"}
                      </td>
                      <td style={{ padding: "10px 12px", color: "#6b7280", fontSize: 12 }}>
                        {d.blockReason || "—"}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <button
                            type="button"
                            title="Reliable"
                            onClick={() => handleRate(d.driverId, "thumbs_up")}
                            style={{
                              background: ratings[d.driverId] === "thumbs_up" ? "#dcfce7" : "var(--card)",
                              border: ratings[d.driverId] === "thumbs_up" ? "2px solid #16a34a" : "1px solid var(--border)",
                              borderRadius: 8,
                              padding: "4px 10px",
                              cursor: "pointer",
                              fontSize: 16,
                              transition: "all 0.15s",
                            }}
                          >
                            👍
                          </button>
                          <button
                            type="button"
                            title="Unreliable"
                            onClick={() => handleRate(d.driverId, "thumbs_down")}
                            style={{
                              background: ratings[d.driverId] === "thumbs_down" ? "#fee2e2" : "var(--card)",
                              border: ratings[d.driverId] === "thumbs_down" ? "2px solid #dc2626" : "1px solid var(--border)",
                              borderRadius: 8,
                              padding: "4px 10px",
                              cursor: "pointer",
                              fontSize: 16,
                              transition: "all 0.15s",
                            }}
                          >
                            👎
                          </button>
                        </div>
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        {!d.driverId ? (
                          <span style={{ color: "#9ca3af", fontSize: 12 }}>Pending application</span>
                        ) : d.status?.toLowerCase() === "dropped" ? (
                          <span style={{ color: "#9ca3af", fontSize: 12 }}></span>
                        ) : d.status?.toLowerCase() === "probation" ? (
                          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                            <button
                              type="button"
                              onClick={() => handleLiftProbation(d.driverId)}
                              style={{
                                padding: "5px 12px", borderRadius: 6, border: "none",
                                background: "#10b981", color: "#fff", fontWeight: 600,
                                cursor: "pointer", fontSize: 12
                              }}
                            >
                              Lift Probation
                            </button>
                            <input
                              type="text"
                              placeholder="Drop reason (optional)"
                              value={dropReasonInput[d.driverId] || ""}
                              onChange={(e) =>
                                setDropReasonInput((prev) => ({ ...prev, [d.driverId]: e.target.value}))
                              }
                              style={{
                                padding: "5px 8px", borderRadius: 6,
                                border: "1px solid #d1d5db", fontSize: 12, minWidth: 160
                              }}
                            />
                            <button
                              type="button"
                              disabled={droppingDriverId === d.driverId}
                              onClick={() => handleDrop(d.driverId)}
                              style={{
                                padding: "5px 12px", borderRadius: 6, border: "none",
                                background: "#ef4444", color: "#fff", fontWeight: 600,
                                cursor: droppingDriverId === d.driverId ? "not-allowed" : "pointer",
                                fontSize: 12,
                                opacity: droppingDriverId === d.driverId ? 0.7 : 1,
                              }}
                            >
                              {droppingDriverId === d.driverId ? "Dropping..." : "Drop"}
                            </button>
                            <input
                              type="number"
                              min="1"
                              placeholder="Reverse pts"
                              value={reversePointsInput[d.driverId] || ""}
                              onChange={(e) => 
                                setReversePointsInput((prev) => ({ ...prev, [d.driverId]: e.target.value }))
                              }
                              style={{
                                padding: "5px 8px", borderRadius: 6,
                                border: "1px solid #d1d5db", fontSize: 12, width: 110
                              }}
                            />
                            <input
                              type="text"
                              placeholder="Reason (optional)"
                              value={reverseReasonInput[d.driverId] || ""}
                              onChange={(e) =>
                                setReverseReasonInput((prev) => ({ ...prev, [d.driverId]: e.target.value }))
                              }
                              style={{
                                padding: "5px 8px", borderRadius: 6,
                                border: "1px solid #d1d5db", fontSize: 12, minWidth: 150
                              }}
                            />
                            <button
                              type="button"
                              disabled={reversingDriverId === d.driverId}
                              onClick={() => handleReversePoints(d.driverId)}
                              style={{
                                padding: "5px 12px", borderRadius: 6, border: "none",
                                background: "#7c3aed", color: "#fff", fontWeight: 600,
                                cursor: reversingDriverId === d.driverId ? "not-allowed" : "pointer",
                                fontSize: 12,
                                opacity: reversingDriverId === d.driverId ? 0.7 : 1,
                              }}
                            >
                              {reversingDriverId === d.driverId ? "Reversing..." : "Reverse Points"}
                            </button>
                            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                            <input
                              type="text"
                              placeholder="Reason (required)"
                              value={blockReason[d.driverId] || ""}
                              onChange={(e) =>
                                setBlockReason((prev) => ({ ...prev, [d.driverId]: e.target.value }))
                              }
                              style={{
                                padding: "5px 8px", borderRadius: 6,
                                border: "1px solid #d1d5db", fontSize: 12, minWidth: 160
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => handleBlock(d.driverId)}
                              style={{
                                padding: "5px 12px", borderRadius: 6, border: "none",
                                background: "#ef4444", color: "#fff", fontWeight: 600,
                                cursor: "pointer", fontSize: 12
                              }}
                            >
                              Block
                            </button>
                          </div>

                          </div>
                        ) : d.status?.toLowerCase() === "blocked" ? (
                          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                            <button
                              type="button"
                              onClick={() => handleUnblock(d.driverId)}
                              style={{
                                padding: "5px 12px", borderRadius: 6, border: "none",
                                background: "#10b981", color: "#fff", fontWeight: 600,
                                cursor: "pointer", fontSize: 12
                              }}
                            >
                              Unblock
                            </button>
                            <input
                              type="number"
                              min="1"
                              placeholder="Reverse pts"
                              value={reversePointsInput[d.driverId] || ""}
                              onChange={(e) =>
                                setReversePointsInput((prev) => ({ ...prev, [d.driverId]: e.target.value }))
                              }
                              style={{
                                padding: "5px 8px", borderRadius: 6,
                                border: "1px solid #d1d5db", fontSize: 12, width: 110
                              }}
                            />
                            <button
                              type="button"
                              disabled={reversingDriverId === d.driverId}
                              onClick={() => handleReversePoints(d.driverId)}
                              style={{
                                padding: "5px 12px",
                                borderRadius: 6,
                                border: "none",
                                background: "#7c3aed",
                                color: "#fff",
                                fontWeight: 600,
                                cursor: reversingDriverId === d.driverId ? "not-allowed" : "pointer",
                                fontSize: 12,
                                opacity: reversingDriverId === d.driverId ? 0.7 : 1,
                              }}
                            >
                              {reversingDriverId === d.driverId ? "Reversing..." : "Reverse Points"}
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                            <input
                              type="text"
                              placeholder="Probation reason (optional)"
                              value={probationReasonInput[d.driverId] || ""}
                              onChange={(e) =>
                                setProbationReasonInput((prev) => ({ ...prev, [d.driverId]: e.target.value }))
                              }
                              style={{
                                padding: "5px 8px", borderRadius: 6,
                                border: "1px solid #d1d5db", fontSize: 12, minWidth: 160
                              }}
                            />
                            <button
                              type="button"
                              disabled={probatingDriverId === d.driverId}
                              onClick={() => handleProbation(d.driverId)}
                              style={{
                                padding: "5px 12px", borderRadius: 6, border: "none",
                                background: "#f59e0b", color: "#fff", fontWeight: 600,
                                cursor: probatingDriverId === d.driverId ? "not-allowed" : "pointer",
                                fontSize: 12,
                                opacity: probatingDriverId === d.driverId ? 0.7 : 1,
                              }}
                            >
                              {probatingDriverId === d.driverId ? "Placing..." : "Probation"}
                            </button>
                            <input
                              type="text"
                              placeholder="Drop reason (optional)"
                              value={dropReasonInput[d.driverId] || ""}
                              onChange={(e) => 
                                setDropReasonInput((prev) => ({ ...prev, [d.driverId]: e.target.value }))
                              }
                              style={{
                                padding: "5px 8px", borderRadius: 6,
                                border: "1px solid #d1d5db", fontSize: 12, minWidth: 160
                              }}
                            />
                            <button
                              type="button"
                              disabled={droppingDriverId === d.driverId}
                              onClick={() => handleDrop(d.driverId)}
                              style={{
                                padding: "5px 12px", borderRadius: 6, border: "none",
                                background: "#ef4444", color: "#fff", fontWeight: 600,
                                cursor: droppingDriverId === d.driverId ? "not-allowed" : "pointer",
                                fontSize: 12,
                                opacity: droppingDriverId === d.driverId ? 0.7 : 1,
                              }}
                            >
                              {droppingDriverId === d.driverId ? "Dropping..." : "Drop"}
                            </button>
                            <input
                              type="number"
                              min="1"
                              placeholder="Reverse pts"
                              value={reversePointsInput[d.driverId] || ""}
                              onChange={(e) => 
                                setReversePointsInput((prev) => ({ ...prev, [d.driverId]: e.target.value }))
                              }
                              style={{
                                padding: "5px 8px", borderRadius: 6,
                                border: "1px solid #d1d5db", fontSize: 12, width: 110
                              }}
                            />
                            <input
                              type="text"
                              placeholder="Reason (optional)"
                              value={reverseReasonInput[d.driverId] || ""}
                              onChange={(e) =>
                                setReverseReasonInput((prev) => ({ ...prev, [d.driverId]: e.target.value }))
                              }
                              style={{
                                padding: "5px 8px", borderRadius: 6,
                                border: "1px solid #d1d5db", fontSize: 12, minWidth: 150
                              }}
                            />
                            <button
                              type="button"
                              disabled={reversingDriverId === d.driverId}
                              onClick={() => handleReversePoints(d.driverId)}
                              style={{
                                padding: "5px 12px", borderRadius: 6, border: "none",
                                background: "#7c3aed", color: "#fff", fontWeight: 600,
                                cursor: reversingDriverId === d.driverId ? "not-allowed" : "pointer",
                                fontSize: 12,
                                opacity: reversingDriverId === d.driverId ? 0.7 : 1,
                              }}
                            >
                              {reversingDriverId === d.driverId ? "Reversing..." : "Reverse Points"}
                            </button>
                            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                            <input
                              type="text"
                              placeholder="Reason (required)"
                              value={blockReason[d.driverId] || ""}
                              onChange={(e) =>
                                setBlockReason((prev) => ({ ...prev, [d.driverId]: e.target.value }))
                              }
                              style={{
                                padding: "5px 8px", borderRadius: 6,
                                border: "1px solid #d1d5db", fontSize: 12, minWidth: 160
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => handleBlock(d.driverId)}
                              style={{
                                padding: "5px 12px", borderRadius: 6, border: "none",
                                background: "#ef4444", color: "#fff", fontWeight: 600,
                                cursor: "pointer", fontSize: 12
                              }}
                            >
                              Block
                            </button>
                          </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            );
          })()
        )}

        {/* Applications tab */}
        {!driverLoading && activeTab === "applications" && (
          applications.length === 0
            ? <p style={{ color: "#6b7280" }}>No applications found.</p>
            : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
                    <th style={{ textAlign: "left", padding: "8px 12px" }}>Driver Email</th>
                    <th style={{ textAlign: "left", padding: "8px 12px" }}>Status</th>
                    <th style={{ textAlign: "left", padding: "8px 12px" }}>Submitted</th>
                    <th style={{ textAlign: "left", padding: "8px 12px" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {applications.map((a) => (
                    <tr key={a.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "10px 12px" }}>{a.driver_email}</td>
                      <td style={{ padding: "10px 12px" }}><StatusBadge status={a.status} /></td>
                      <td style={{ padding: "10px 12px", color: "#6b7280", fontSize: 12 }}>
                        {new Date(a.applied_at).toLocaleDateString()}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        {a.status === "PENDING" && (
                          <div style={{ display: "flex", gap: 6 }}>
                            <button
                              type="button"
                              onClick={() => handleApplicationAction(a.id, "approve")}
                              style={{ padding: "5px 12px", borderRadius: 6, border: "none", background: "#059669", color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: 12 }}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => handleApplicationAction(a.id, "reject")}
                              style={{ padding: "5px 12px", borderRadius: 6, border: "none", background: "#dc2626", color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: 12 }}
                            >
                              Reject
                            </button>
                          </div>
                        )}
                        {a.status === "REJECTED" && (
                          <button
                            type="button"
                            onClick={() => handleReopen(a.id)}
                            style={{ padding: "5px 12px", borderRadius: 6, border: "none", background: "#4f46e5", color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: 12 }}
                          >
                            Reopen
                          </button>
                        )}
                        {a.status === "APPROVED" && <span style={{ color: "#9ca3af", fontSize: 12 }}>—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
        )}

        {/* Catalog tab */}
        {!driverLoading && activeTab === "catalog" && (
          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
              <input
                type="text"
                placeholder="Search catalog…"
                value={catalogInput}
                onChange={(e) => setCatalogInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && fetchCatalog(catalogInput.trim() || "top hits", catalogCat)}
                style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13, minWidth: 200 }}
              />
              <button
                type="button"
                onClick={() => fetchCatalog(catalogInput.trim() || "top hits", catalogCat)}
                style={{ padding: "6px 14px", borderRadius: 6, border: "none", background: "#4f46e5", color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: 13 }}
              >
                Search
              </button>
              <button
                type="button"
                onClick={() => { setShowHiddenOnly((v) => !v); if (!showHiddenOnly) fetchHiddenIds(); }}
                style={{ padding: "6px 14px", borderRadius: 6, border: showHiddenOnly ? "2px solid #dc2626" : "1px solid #d1d5db", background: showHiddenOnly ? "#fee2e2" : "transparent", color: showHiddenOnly ? "#991b1b" : "inherit", fontWeight: 600, cursor: "pointer", fontSize: 13 }}
              >
                {showHiddenOnly ? "Showing hidden only" : "Show hidden only"}
              </button>
            </div>

            {/* Category pills */}
            {!showHiddenOnly && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
                {CAT_CATEGORIES.map((c) => (
                  <button
                    key={c.media}
                    type="button"
                    onClick={() => { setCatalogCat(c); fetchCatalog(catalogInput.trim() || "top hits", c); }}
                    style={{ padding: "5px 14px", borderRadius: 20, border: "none", fontWeight: 600, fontSize: 12, cursor: "pointer", background: catalogCat.media === c.media ? "#4f46e5" : "#e5e7eb", color: catalogCat.media === c.media ? "#fff" : "#374151" }}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            )}

            {catalogLoading && <p style={{ color: "#6b7280" }}>Loading…</p>}

            {/* Hidden-only view */}
            {!catalogLoading && showHiddenOnly && (
              Object.values(hiddenProducts).length === 0
                ? <p style={{ color: "#6b7280" }}>No hidden products yet.</p>
                : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 14 }}>
                    {Object.values(hiddenProducts).map((p) => (
                      <div key={p.product_id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden", background: "var(--card, #fff)", opacity: 0.75 }}>
                        {p.artwork_url && <img src={p.artwork_url} alt={p.product_name} style={{ width: "100%", display: "block" }} />}
                        <div style={{ padding: "8px 10px" }}>
                          <p style={{ fontSize: 11, color: "#6b7280", margin: "0 0 2px" }}>{p.artist_name}</p>
                          <p style={{ fontSize: 12, fontWeight: 600, margin: "0 0 8px", lineHeight: 1.3 }}>{p.product_name}</p>
                          <button
                            type="button"
                            onClick={() => handleToggleHide({ trackId: p.product_id, trackName: p.product_name, artistName: p.artist_name, artworkUrl100: p.artwork_url })}
                            style={{ width: "100%", padding: "5px 0", borderRadius: 6, border: "none", background: "#10b981", color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: 11 }}
                          >
                            Unhide
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )
            )}

            {/* Search results view */}
            {!catalogLoading && !showHiddenOnly && catalogResults.length === 0 && (
              <p style={{ color: "#6b7280" }}>Search for items to hide or unhide them from your drivers.</p>
            )}
            {!catalogLoading && !showHiddenOnly && catalogResults.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 14 }}>
                {catalogResults.map((item) => {
                  const productId = String(item.trackId || item.collectionId);
                  const isHidden  = hiddenIds.has(productId);
                  const name      = item.trackName || item.collectionName || "Unknown";
                  const img       = item.artworkUrl100?.replace("100x100bb", "160x160bb");
                  return (
                    <div key={productId} style={{ border: `1px solid ${isHidden ? "#fca5a5" : "#e5e7eb"}`, borderRadius: 10, overflow: "hidden", background: isHidden ? "#fff5f5" : "var(--card, #fff)", opacity: isHidden ? 0.7 : 1, transition: "all 0.15s" }}>
                      {img && <img src={img} alt={name} style={{ width: "100%", display: "block" }} />}
                      <div style={{ padding: "8px 10px" }}>
                        <p style={{ fontSize: 11, color: "#6b7280", margin: "0 0 2px" }}>{item.artistName}</p>
                        <p style={{ fontSize: 12, fontWeight: 600, margin: "0 0 8px", lineHeight: 1.3 }}>{name}</p>
                        <button
                          type="button"
                          onClick={() => handleToggleHide(item)}
                          style={{ width: "100%", padding: "5px 0", borderRadius: 6, border: "none", background: isHidden ? "#10b981" : "#ef4444", color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: 11 }}
                        >
                          {isHidden ? "Unhide" : "Hide"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {!driverLoading && activeTab === "posts" && (
          <SponsorPostsManager token={token} />
        )}

        {/* Reports tab */}
        {!driverLoading && activeTab === "reports" && (
          <div
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              padding: 18,
              background: "var(--card, #fff)",
              maxWidth: 700,
            }}
          >
            <h3 style={{ margin: "0 0 6px", fontSize: 18 }}>Sponsor Reports</h3>
            <p style={{ margin: "0 0 16px", color: "#6b7280", fontSize: 14 }}>
              Export your sponsor driver points summary and recent point activity as either a CSV or PDF file.
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                disabled={exportingReportCsv}
                onClick={handleExportReportCsv}
                style={{
                  padding: "10px 16px",
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  background: "var(--card, #fff)",
                  color: "var(--text, #111827)",
                  fontWeight: 700,
                  cursor: exportingReportCsv ? "not-allowed" : "pointer",
                  opacity: exportingReportCsv ? 0.7 : 1,
                }}
              >
                {exportingReportCsv ? "Preparing CSV..." : "Export Report as CSV"}
              </button>
              <button
                type="button"
                disabled={exportingReport}
                onClick={handleExportReportPdf}
                style={{
                  padding: "10px 16px",
                  borderRadius: 8,
                  border: "none",
                  background: "#111827",
                  color: "#fff",
                  fontWeight: 700,
                  cursor: exportingReport ? "not-allowed" : "pointer",
                  opacity: exportingReport ? 0.7 : 1,
                }}
              >
                {exportingReport ? "Preparing PDF..." : "Export Report as PDF"}
              </button>
            </div>
          </div>
        )}

        {/* -- Bulk Upload Tab -- */}
        {activeTab === "bulk upload" && (
          <div style={{ maxWidth: 600 }}>
            <h3 style={{ margin: "0 0 6px", fontSize: 18 }}>Bulk Upload</h3>
            <p style={{ margin: "0 0 16px", color: "#6b7280", fontSize: 14 }}>
              Upload a pipe-delimited text file to bulk create drivers or sponsors
              Use <strong>D</strong> for drivers and <strong>S</strong> for sponsors
            </p>
            <div style={{
              background: "#f8fafc", border: "1px solid #e5e7eb",
              borderRadius: 10, padding: 14, marginBottom: 16, fontSize: 13, color: "#374151"
            }}>
              <strong>File format:</strong><br />
              <code>D||firstName|lastName|email|points (optional)|reason (optional)</code><br />
              <code>S||firstName|lastName|email</code><br />
              <span style={{ color: "6b7280", marginTop: 6, display: "block" }}>
                Leave organization name blank
              </span>
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
                accept=".txt,.csv"
                style={{ display: "none" }}
                onChange={handleBulkUpload}
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
                  {bulkUploadResult.processed} row{bulkUploadResult.processed !== 1 ? "s" : ""} processed successfully
                </div>

                {bulkUploadResult.errors.length > 0 && (
                  <div>
                    <p style={{ fontWeight: 700, color: "#991b1b", marginBottom: 8 }}>
                      {bulkUploadResult.errors.length} issue{bulkUploadResult.errors.length !== 1 ? "s" : ""} found:
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

        {/* ── Feedback tab ── */}
        {activeTab === "help & feedback" && (
          <FeedbackForm token={token} apiBase={SPONSOR_API} />
        )}

      </div>
    </div>
  );
}
