import React, { useState, useEffect, useCallback } from "react";
import "./SponsorProfile.css";

const API_BASE = "http://localhost:8001/api/profile";
const SPONSOR_API = "http://localhost:8001/sponsor";

export default function SponsorProfile({ token, onLogout, onChangeUsername }) {
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
  const [activeTab, setActiveTab] = useState("drivers");     // "drivers" | "applications" | "catalog"

  // ─── Catalog management state ───────────────────────────────────────────────
  const [catalogSearch, setCatalogSearch]     = useState("music");
  const [catalogResults, setCatalogResults]   = useState([]);
  const [catalogLoading, setCatalogLoading]   = useState(false);
  const [catalogError, setCatalogError]       = useState("");
  const [hiddenIds, setHiddenIds]             = useState(new Set());
  const [hiddenProducts, setHiddenProducts]   = useState({});  // { [id]: product row }
  const [catalogToggling, setCatalogToggling] = useState({});
  const [showHiddenOnly, setShowHiddenOnly]   = useState(false);
  const CATALOG_CATEGORIES = [
    { label: "Music",   media: "music",    entity: "song"      },
    { label: "Movies",  media: "movie",    entity: "movie"     },
    { label: "Apps",    media: "software", entity: "software"  },
    { label: "Books",   media: "ebook",    entity: "ebook"     },
    { label: "TV",      media: "tvShow",   entity: "tvEpisode" },
  ];
  const [catalogCategory, setCatalogCategory] = useState(CATALOG_CATEGORIES[0]);

  // ─── Existing profile fetch (unchanged) ────────────────────────────────────
  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${SPONSOR_API}/org`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok && data.sponsorId) {
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
        setIsEditing(false);
      } else if (res.status === 404) {
        setIsEditing(true);
      } else {
        throw new Error(data.error || "Failed to fetch profile");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

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
      const pointValue = parseFloat(profile.point_value);
      if (isNaN(pointValue) || pointValue < 0) throw new Error("Point value must be a valid positive number");
      const res = await fetch(`${SPONSOR_API}/org`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({
          name: profile.company_name,
          contactName: profile.contact_name,
          contactPhone: profile.phone,
          address: profile.address,
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save profile");
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

  // ─── NEW: Driver management functions ──────────────────────────────────────

  const fetchDrivers = useCallback(async () => {
    setDriverLoading(true);
    setDriverError("");
    try {
      const res = await fetch(`${SPONSOR_API}/drivers`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch drivers");
      setDrivers(data.drivers || []);
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
      const res = await fetch(`${SPONSOR_API}/driver-applications`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch applications");
      setApplications(data.applications || []);
    } catch (err) {
      setDriverError(err.message);
    } finally {
      setDriverLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (activeTab === "drivers") fetchDrivers();
    else if (activeTab === "applications") fetchApplications();
    else if (activeTab === "catalog") {
      fetchHiddenIds();
      fetchCatalog(catalogSearch, catalogCategory);
    }
  }, [activeTab, fetchDrivers, fetchApplications]);

  // ─── Catalog: fetch hidden product IDs for this sponsor ─────────────────────
  const fetchHiddenIds = useCallback(async () => {
    try {
      const res = await fetch(`${SPONSOR_API}/catalog/hidden`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.ok) {
        setHiddenIds(new Set(data.hiddenIds));
        // Build a map of id → product details for the hidden-only view
        const map = {};
        (data.hiddenProducts || []).forEach(p => { map[p.product_id] = p; });
        setHiddenProducts(map);
      }
    } catch (err) {
      console.error("Failed to load hidden products", err);
    }
  }, [token]);

  // ─── Catalog: search iTunes API ─────────────────────────────────────────────
  const fetchCatalog = useCallback(async (term, category) => {
    const cat = category || catalogCategory;
    if (!term.trim()) return;
    setCatalogLoading(true);
    setCatalogError("");
    try {
      const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=${cat.media}&entity=${cat.entity}&limit=24&country=US`;
      const res = await fetch(url);
      const data = await res.json();
      setCatalogResults(data.results || []);
    } catch (err) {
      setCatalogError("Failed to load catalog. Please try again.");
    } finally {
      setCatalogLoading(false);
    }
  }, [catalogCategory]);

  // ─── Catalog: toggle hide/unhide ────────────────────────────────────────────
  const handleToggleHide = useCallback(async (product) => {
    const id = String(product.trackId || product.collectionId);
    const isHidden = hiddenIds.has(id);
    setCatalogToggling(prev => ({ ...prev, [id]: true }));

    // Optimistic update
    setHiddenIds(prev => {
      const next = new Set(prev);
      isHidden ? next.delete(id) : next.add(id);
      return next;
    });
    if (!isHidden) {
      setHiddenProducts(prev => ({
        ...prev,
        [id]: {
          product_id:   id,
          product_name: product.trackName || product.collectionName || null,
          artist_name:  product.artistName || null,
          artwork_url:  product.artworkUrl100 || null,
          price:        product.trackPrice ?? product.collectionPrice ?? null,
        }
      }));
    } else {
      setHiddenProducts(prev => { const n = { ...prev }; delete n[id]; return n; });
    }

    try {
      const endpoint = isHidden ? "/catalog/unhide" : "/catalog/hide";
      const body = isHidden
        ? { productId: id }
        : {
            productId:   id,
            productName: product.trackName || product.collectionName || null,
            artistName:  product.artistName || null,
            artworkUrl:  product.artworkUrl100 || null,
            price:       product.trackPrice ?? product.collectionPrice ?? null,
          };
      const res = await fetch(`${SPONSOR_API}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
    } catch (err) {
      // Revert on failure
      setHiddenIds(prev => {
        const next = new Set(prev);
        isHidden ? next.add(id) : next.delete(id);
        return next;
      });
      if (!isHidden) {
        setHiddenProducts(prev => { const n = { ...prev }; delete n[id]; return n; });
      }
    } finally {
      setCatalogToggling(prev => ({ ...prev, [id]: false }));
    }
  }, [hiddenIds, token]);

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

  const handleApplicationAction = async (appId, action) => {
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
      ACTIVE:   { bg: "#d1fae5", color: "#065f46" },
      BLOCKED:  { bg: "#fee2e2", color: "#991b1b" },
      DROPPED:  { bg: "#fef3c7", color: "#92400e" },
      PENDING:  { bg: "#dbeafe", color: "#1e40af" },
      ACCEPTED: { bg: "#d1fae5", color: "#065f46" },
      REJECTED: { bg: "#fee2e2", color: "#991b1b" },
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
      {/* ── Existing header (unchanged) ── */}
      <div className="profile-header">
        <h1>Sponsor Profile</h1>
        <div className="header-actions">
          {!isEditing && (
            <button onClick={() => setIsEditing(true)} className="btn-edit">Edit Profile</button>
          )}
          {!isEditing && (
            <button onClick={onChangeUsername} className="btn-edit">Change Username</button>
          )}
          <button onClick={onLogout} className="btn-logout">Logout</button>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      {/* ── Existing profile form (100% unchanged) ── */}
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

      {/* ── NEW: Driver Management Section ── */}
      <div className="form-section" style={{ marginTop: 40 }}>
        <h2>Driver Management</h2>

        {/* Tab bar */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {["drivers", "applications", "catalog"].map((tab) => (
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
            : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
                    <th style={{ textAlign: "left", padding: "8px 12px" }}>Email</th>
                    <th style={{ textAlign: "left", padding: "8px 12px" }}>Status</th>
                    <th style={{ textAlign: "left", padding: "8px 12px" }}>Reason</th>
                    <th style={{ textAlign: "left", padding: "8px 12px" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {drivers.map((d) => (
                    <tr key={d.driver_id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "10px 12px" }}>{d.email}</td>
                      <td style={{ padding: "10px 12px" }}><StatusBadge status={d.driver_status} /></td>
                      <td style={{ padding: "10px 12px", color: "#6b7280", fontSize: 12 }}>
                        {d.dropped_reason || "—"}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        {d.driver_status !== "BLOCKED" ? (
                          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                            <input
                              type="text"
                              placeholder="Reason (required)"
                              value={blockReason[d.driver_id] || ""}
                              onChange={(e) =>
                                setBlockReason((prev) => ({ ...prev, [d.driver_id]: e.target.value }))
                              }
                              style={{
                                padding: "5px 8px", borderRadius: 6,
                                border: "1px solid #d1d5db", fontSize: 12, minWidth: 160
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => handleBlock(d.driver_id)}
                              style={{
                                padding: "5px 12px", borderRadius: 6, border: "none",
                                background: "#ef4444", color: "#fff", fontWeight: 600,
                                cursor: "pointer", fontSize: 12
                              }}
                            >
                              Block
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleUnblock(d.driver_id)}
                            style={{
                              padding: "5px 12px", borderRadius: 6, border: "none",
                              background: "#10b981", color: "#fff", fontWeight: 600,
                              cursor: "pointer", fontSize: 12
                            }}
                          >
                            Unblock
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
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
                    <tr key={a.applicationId} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "10px 12px" }}>{a.email}</td>
                      <td style={{ padding: "10px 12px" }}><StatusBadge status={a.status} /></td>
                      <td style={{ padding: "10px 12px", color: "#6b7280", fontSize: 12 }}>
                        {a.appliedAt ? new Date(a.appliedAt).toLocaleDateString() : "—"}
                      </td>
                      <td style={{ padding: "10px 12px", display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {a.status === "PENDING" && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleApplicationAction(a.applicationId, "approve")}
                              style={{ padding: "5px 12px", borderRadius: 6, border: "none", background: "#059669", color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: 12 }}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => handleApplicationAction(a.applicationId, "reject")}
                              style={{ padding: "5px 12px", borderRadius: 6, border: "none", background: "#dc2626", color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: 12 }}
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {a.status === "REJECTED" && (
                          <button
                            type="button"
                            onClick={() => handleReopen(a.applicationId)}
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

        {/* ── Catalog Management tab ── */}
        {activeTab === "catalog" && (
          <div>
            {/* Header row */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Catalog Management</h3>
                <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6b7280" }}>
                  Hide products from your drivers' catalog view. Hidden items won't appear when they browse.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowHiddenOnly(p => !p)}
                style={{
                  padding: "7px 16px", borderRadius: 8, fontWeight: 600, fontSize: 13,
                  border: "1px solid var(--border, #d1d5db)",
                  background: showHiddenOnly ? "#fef2f2" : "transparent",
                  color: showHiddenOnly ? "#991b1b" : "inherit",
                  cursor: "pointer",
                }}
              >
                {showHiddenOnly ? "👁 Showing hidden only" : "👁 Show all"}
              </button>
            </div>

            {/* Search bar */}
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input
                type="text"
                value={catalogSearch}
                onChange={e => setCatalogSearch(e.target.value)}
                onKeyDown={e => e.key === "Enter" && fetchCatalog(catalogSearch, catalogCategory)}
                placeholder="Search catalog…"
                style={{
                  flex: 1, padding: "9px 12px", borderRadius: 8, fontSize: 14,
                  border: "1px solid var(--border, #d1d5db)",
                  background: "var(--card)", color: "var(--text)",
                }}
              />
              <button
                type="button"
                onClick={() => fetchCatalog(catalogSearch, catalogCategory)}
                style={{
                  padding: "9px 20px", borderRadius: 8, border: "none",
                  background: "#4f46e5", color: "#fff", fontWeight: 700,
                  fontSize: 14, cursor: "pointer",
                }}
              >
                Search
              </button>
            </div>

            {/* Category pills — same as driver Catalogue page */}
            <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
              {CATALOG_CATEGORIES.map(c => (
                <button
                  key={c.media}
                  type="button"
                  onClick={() => {
                    setCatalogCategory(c);
                    fetchCatalog(catalogSearch || "top hits", c);
                  }}
                  style={{
                    padding: "6px 16px", borderRadius: 20, fontSize: 13, fontWeight: 600,
                    border: "1px solid var(--border, #d1d5db)", cursor: "pointer",
                    background: catalogCategory.media === c.media ? "#4f46e5" : "transparent",
                    color: catalogCategory.media === c.media ? "#fff" : "inherit",
                  }}
                >
                  {c.label}
                </button>
              ))}
            </div>

            {/* Hidden count badge */}
            {hiddenIds.size > 0 && (
              <div style={{
                marginBottom: 12, padding: "8px 12px", borderRadius: 8,
                background: "#fef2f2", color: "#991b1b",
                fontSize: 13, fontWeight: 600, display: "inline-block",
              }}>
                🚫 {hiddenIds.size} product{hiddenIds.size !== 1 ? "s" : ""} hidden from drivers
              </div>
            )}

            {catalogError && (
              <div style={{ color: "#991b1b", marginBottom: 12, fontSize: 14 }}>{catalogError}</div>
            )}
            {catalogLoading && <p style={{ color: "#6b7280" }}>Loading catalog...</p>}

            {/* Product grid */}
            {!catalogLoading && (() => {
              // When showing hidden only, use the hiddenProducts map directly
              // so items hidden in previous sessions always appear
              if (showHiddenOnly) {
                const hiddenList = Object.values(hiddenProducts);
                if (hiddenList.length === 0) {
                  return <p style={{ color: "#6b7280", fontSize: 14 }}>No hidden products yet.</p>;
                }
                return (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 14 }}>
                    {hiddenList.map(p => {
                      const id = p.product_id;
                      const isToggling = catalogToggling[id];
                      // Build a synthetic product object for handleToggleHide
                      const synthetic = { trackId: id, trackName: p.product_name, artistName: p.artist_name, artworkUrl100: p.artwork_url, trackPrice: p.price };
                      return (
                        <div key={id} style={{ border: "1px solid var(--border, #e5e7eb)", borderRadius: 12, overflow: "hidden", background: "var(--card)", opacity: 0.65, position: "relative" }}>
                          <div style={{ position: "absolute", top: 8, left: 8, zIndex: 2, background: "#dc2626", color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 10 }}>
                            HIDDEN
                          </div>
                          {p.artwork_url && <img src={p.artwork_url} alt={p.product_name} style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "cover", display: "block" }} />}
                          <div style={{ padding: "10px 10px 12px" }}>
                            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 2 }}>{p.artist_name}</div>
                            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, lineHeight: 1.3 }}>
                              {(p.product_name || "Unknown").length > 40 ? (p.product_name || "").slice(0, 40) + "…" : (p.product_name || "Unknown")}
                            </div>
                            {p.price > 0 && <div style={{ fontSize: 12, color: "#4f46e5", fontWeight: 700, marginBottom: 8 }}>${parseFloat(p.price).toFixed(2)}</div>}
                            <button
                              type="button"
                              disabled={isToggling}
                              onClick={() => handleToggleHide(synthetic)}
                              style={{ width: "100%", padding: "6px 0", borderRadius: 7, border: "none", background: "#d1fae5", color: "#065f46", fontWeight: 700, fontSize: 12, cursor: isToggling ? "not-allowed" : "pointer", opacity: isToggling ? 0.6 : 1 }}
                            >
                              {isToggling ? "…" : "✓ Unhide"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              }

              // Normal view — show search results
              const displayed = catalogResults;
              if (displayed.length === 0) {
                return <p style={{ color: "#6b7280", fontSize: 14 }}>Search for products above to manage your catalog.</p>;
              }

              return (
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                  gap: 14,
                }}>
                  {displayed.map(product => {
                    const id = String(product.trackId || product.collectionId);
                    const isHidden = hiddenIds.has(id);
                    const isToggling = catalogToggling[id];
                    const thumb = product.artworkUrl100 || product.artworkUrl60;
                    const name = product.trackName || product.collectionName || "Unknown";
                    const artist = product.artistName || "";
                    const price = product.trackPrice ?? product.collectionPrice ?? null;

                    return (
                      <div
                        key={id}
                        style={{
                          border: "1px solid var(--border, #e5e7eb)",
                          borderRadius: 12,
                          overflow: "hidden",
                          background: "var(--card)",
                          opacity: isHidden ? 0.55 : 1,
                          transition: "opacity 0.2s",
                          position: "relative",
                        }}
                      >
                        {/* Hidden overlay badge */}
                        {isHidden && (
                          <div style={{
                            position: "absolute", top: 8, left: 8, zIndex: 2,
                            background: "#dc2626", color: "#fff",
                            fontSize: 10, fontWeight: 700, padding: "2px 7px",
                            borderRadius: 10, letterSpacing: "0.05em",
                          }}>
                            HIDDEN
                          </div>
                        )}
                        {thumb && (
                          <img
                            src={thumb}
                            alt={name}
                            style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "cover", display: "block" }}
                          />
                        )}
                        <div style={{ padding: "10px 10px 12px" }}>
                          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                            {artist}
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, lineHeight: 1.3 }}>
                            {name.length > 40 ? name.slice(0, 40) + "…" : name}
                          </div>
                          {price !== null && price > 0 && (
                            <div style={{ fontSize: 12, color: "#4f46e5", fontWeight: 700, marginBottom: 8 }}>
                              ${price.toFixed(2)}
                            </div>
                          )}
                          <button
                            type="button"
                            disabled={isToggling}
                            onClick={() => handleToggleHide(product)}
                            style={{
                              width: "100%",
                              padding: "6px 0",
                              borderRadius: 7,
                              border: "none",
                              background: isHidden ? "#d1fae5" : "#fee2e2",
                              color: isHidden ? "#065f46" : "#991b1b",
                              fontWeight: 700,
                              fontSize: 12,
                              cursor: isToggling ? "not-allowed" : "pointer",
                              opacity: isToggling ? 0.6 : 1,
                            }}
                          >
                            {isToggling ? "…" : isHidden ? "✓ Unhide" : "🚫 Hide"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}