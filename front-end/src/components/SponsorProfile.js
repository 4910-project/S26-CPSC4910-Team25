import React, { useState, useEffect, useCallback } from "react";
import "./SponsorProfile.css";

const SPONSOR_API = "http://localhost:8001/sponsor";
const ITUNES_API = "https://itunes.apple.com/search";
const CAT_CATEGORIES = [
  { label: "Music", media: "music", entity: "song" },
  { label: "Movies", media: "movie", entity: "movie" },
  { label: "Apps", media: "software", entity: "software" },
  { label: "Books", media: "ebook", entity: "ebook" },
  { label: "TV", media: "tvShow", entity: "tvEpisode" },
];

export default function SponsorProfile({
  token,
  onLogout,
  onChangeUsername,
  onManageRules,
  onRiskDashboard
}) {
  const [profile, setProfile] = useState({
    company_name: "",
    contact_name: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    zip_code: "",
    point_value: "0.01",
    points_expire_days: ""
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  const [drivers, setDrivers] = useState([]);
  const [applications, setApplications] = useState([]);
  const [driverLoading, setDriverLoading] = useState(false);
  const [driverError, setDriverError] = useState("");
  const [driverSuccess, setDriverSuccess] = useState("");
  const [blockReason, setBlockReason] = useState({});
  const [activeTab, setActiveTab] = useState("drivers");
  const [ratings, setRatings] = useState({});
  const [sortByRating, setSortByRating] = useState(false);

  // Catalog hide/unhide state
  const [hiddenIds, setHiddenIds] = useState(new Set());
  const [hiddenProducts, setHiddenProducts] = useState({});
  const [showHiddenOnly, setShowHiddenOnly] = useState(false);
  const [catalogResults, setCatalogResults] = useState([]);
  const [catalogInput, setCatalogInput] = useState("");
  const [catalogCat, setCatalogCat] = useState(CAT_CATEGORIES[0]);
  const [catalogLoading, setCatalogLoading] = useState(false);

  const fetchProfile = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${SPONSOR_API}/org`, {
        headers: { Authorization: `Bearer ${token}` }
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
          point_value: data.pointValue ?? "0.01",
          points_expire_days: data.pointsExpireDays ?? ""
        });
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
      if (isNaN(pointValue) || pointValue < 0) {
        throw new Error("Point value must be a valid non-negative number");
      }

      const pointsExpireDays =
        profile.points_expire_days === ""
          ? null
          : Number(profile.points_expire_days);

      if (
        pointsExpireDays !== null &&
        (!Number.isInteger(pointsExpireDays) || pointsExpireDays <= 0)
      ) {
        throw new Error("Points expiration must be a positive integer or blank");
      }

      const res = await fetch(`${SPONSOR_API}/org`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: profile.company_name,
          contactName: profile.contact_name,
          contactPhone: profile.phone,
          contactEmail: null,
          address: [profile.address, profile.city, profile.state, profile.zip_code]
            .filter(Boolean)
            .join(", "),
          pointValue,
          pointsExpireDays
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || "Failed to save profile");

      setSuccess(data.message || "Profile updated successfully");
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

  const fetchDrivers = useCallback(async () => {
    setDriverLoading(true);
    setDriverError("");
    try {
      const res = await fetch(`${SPONSOR_API}/drivers`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch drivers");

      const driverList = data.drivers || [];
      setDrivers(driverList);

      const ratingEntries = await Promise.all(
        driverList
          .filter((d) => d.driverId)
          .map(async (d) => {
            try {
              const r = await fetch(`${SPONSOR_API}/drivers/${d.driverId}/rate`, {
                headers: { Authorization: `Bearer ${token}` }
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
      const res = await fetch(`${SPONSOR_API}/driver-applications`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch applications");

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

  useEffect(() => {
    if (activeTab === "drivers") fetchDrivers();
    else if (activeTab === "applications") fetchApplications();
    else if (activeTab === "catalog") fetchHiddenIds();
  }, [activeTab, fetchDrivers, fetchApplications]);

  const fetchHiddenIds = async () => {
    try {
      const res = await fetch(`${SPONSOR_API}/catalog/hidden`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.ok) {
        setHiddenIds(new Set(data.hiddenIds || []));
        const map = {};
        (data.hiddenProducts || []).forEach((p) => {
          map[p.product_id] = p;
        });
        setHiddenProducts(map);
      }
    } catch (err) {
      setDriverError(err.message);
    }
  };

  const fetchCatalog = async (term, category) => {
    setCatalogLoading(true);
    setCatalogResults([]);
    try {
      const url = `${ITUNES_API}?term=${encodeURIComponent(
        term || "top hits"
      )}&media=${category.media}&entity=${category.entity}&limit=24&country=US`;
      const res = await fetch(url);
      const data = await res.json();
      setCatalogResults(data.results || []);
    } catch {
      setDriverError("Catalog search failed.");
    }
    setCatalogLoading(false);
  };

  const handleToggleHide = async (item) => {
    const productId = String(item.trackId || item.collectionId);
    const isHidden = hiddenIds.has(productId);
    try {
      if (isHidden) {
        await fetch(`${SPONSOR_API}/catalog/unhide`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ productId }),
        });
        setHiddenIds((prev) => {
          const s = new Set(prev);
          s.delete(productId);
          return s;
        });
        setHiddenProducts((prev) => {
          const m = { ...prev };
          delete m[productId];
          return m;
        });
      } else {
        await fetch(`${SPONSOR_API}/catalog/hide`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            productId,
            productName: item.trackName || item.collectionName || "",
            artistName: item.artistName || "",
            artworkUrl: item.artworkUrl100 || "",
            price: item.trackPrice ?? item.price ?? 0,
          }),
        });
        setHiddenIds((prev) => new Set([...prev, productId]));
        setHiddenProducts((prev) => ({
          ...prev,
          [productId]: {
            product_id: productId,
            product_name: item.trackName || item.collectionName || "",
            artist_name: item.artistName || "",
            artwork_url: item.artworkUrl100 || "",
          },
        }));
      }
    } catch (err) {
      setDriverError(err.message);
    }
  };

  const handleRate = async (driverId, rating) => {
    const newRating = ratings[driverId] === rating ? null : rating;
    setRatings((prev) => ({ ...prev, [driverId]: newRating }));

    try {
      if (newRating) {
        const res = await fetch(`${SPONSOR_API}/drivers/${driverId}/rate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ rating: newRating }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to save rating");
      }
    } catch (err) {
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
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
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
        headers: { Authorization: `Bearer ${token}` }
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
    setDriverError("");
    setDriverSuccess("");

    try {
      const res = await fetch(`${SPONSOR_API}/driver-applications/${appId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
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
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reopen application");

      setDriverSuccess(data.message);
      fetchApplications();
    } catch (err) {
      setDriverError(err.message);
    }
  };

  const StatusBadge = ({ status }) => {
    const colors = {
      ACTIVE: { bg: "#d1fae5", color: "#065f46" },
      BLOCKED: { bg: "#fee2e2", color: "#991b1b" },
      DROPPED: { bg: "#fef3c7", color: "#92400e" },
      PENDING: { bg: "#dbeafe", color: "#1e40af" },
      ACCEPTED: { bg: "#d1fae5", color: "#065f46" },
      REJECTED: { bg: "#fee2e2", color: "#991b1b" },
    };

    const style =
      colors[status?.toUpperCase()] || { bg: "#f3f4f6", color: "#374151" };

    return (
      <span
        style={{
          padding: "2px 10px",
          borderRadius: 12,
          fontSize: 12,
          fontWeight: 600,
          background: style.bg,
          color: style.color
        }}
      >
        {status}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="sponsor-profile-container">
        <div className="loading">Loading profile...</div>
      </div>
    );
  }

  return (
    <div className="sponsor-profile-container">
      <div className="profile-header">
        <h1>Sponsor Profile</h1>

        <div className="header-actions">
          {!isEditing && (
            <button onClick={() => setIsEditing(true)} className="btn-edit">
              Edit Profile
            </button>
          )}

          {!isEditing && (
            <button onClick={onChangeUsername} className="btn-edit">
              Change Username
            </button>
          )}

          {!isEditing && (
            <button onClick={onManageRules} className="btn-edit">
              Manage Behavior Rules
            </button>
          )}

          {!isEditing && (
            <button onClick={onRiskDashboard} className="btn-edit">
              Risk Dashboard
            </button>
          )}

          <button onClick={onLogout} className="btn-logout">
            Logout
          </button>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      <form onSubmit={handleSubmit} className="profile-form">
        <div className="form-section">
          <h2>Company Information</h2>

          <div className="form-group">
            <label htmlFor="company_name">Company Name *</label>
            <input
              type="text"
              id="company_name"
              name="company_name"
              value={profile.company_name}
              onChange={handleChange}
              disabled={!isEditing}
              required
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="contact_name">Contact Name</label>
              <input
                type="text"
                id="contact_name"
                name="contact_name"
                value={profile.contact_name}
                onChange={handleChange}
                disabled={!isEditing}
              />
            </div>

            <div className="form-group">
              <label htmlFor="phone">Phone Number</label>
              <input
                type="tel"
                id="phone"
                name="phone"
                value={profile.phone}
                onChange={handleChange}
                disabled={!isEditing}
                placeholder="(555) 123-4567"
              />
            </div>
          </div>
        </div>

        <div className="form-section">
          <h2>Address</h2>

          <div className="form-group">
            <label htmlFor="address">Street Address</label>
            <input
              type="text"
              id="address"
              name="address"
              value={profile.address}
              onChange={handleChange}
              disabled={!isEditing}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="city">City</label>
              <input
                type="text"
                id="city"
                name="city"
                value={profile.city}
                onChange={handleChange}
                disabled={!isEditing}
              />
            </div>

            <div className="form-group">
              <label htmlFor="state">State</label>
              <input
                type="text"
                id="state"
                name="state"
                value={profile.state}
                onChange={handleChange}
                disabled={!isEditing}
                maxLength="2"
                placeholder="SC"
              />
            </div>

            <div className="form-group">
              <label htmlFor="zip_code">ZIP Code</label>
              <input
                type="text"
                id="zip_code"
                name="zip_code"
                value={profile.zip_code}
                onChange={handleChange}
                disabled={!isEditing}
                maxLength="10"
              />
            </div>
          </div>
        </div>

        <div className="form-section">
          <h2>Point Settings</h2>

          <div className="form-group">
            <label htmlFor="point_value">Point Value (Dollar per Point)</label>
            <input
              type="number"
              id="point_value"
              name="point_value"
              value={profile.point_value}
              onChange={handleChange}
              disabled={!isEditing}
              step="0.01"
              min="0"
            />
            <small className="form-hint">
              Default: $0.01 per point. This determines the dollar value of driver points.
            </small>
          </div>

          <div className="form-group">
            <label htmlFor="points_expire_days">Points Expire After (Days)</label>
            <input
              type="number"
              id="points_expire_days"
              name="points_expire_days"
              value={profile.points_expire_days}
              onChange={handleChange}
              disabled={!isEditing}
              min="1"
              placeholder="Leave blank for no expiration"
            />
            <small className="form-hint">
              Leave blank if points should never expire.
            </small>
          </div>
        </div>

        {isEditing && (
          <div className="form-actions">
            <button type="submit" disabled={saving} className="btn-save">
              {saving ? "Saving..." : "Save Profile"}
            </button>
            <button type="button" onClick={handleCancel} className="btn-cancel">
              Cancel
            </button>
          </div>
        )}
      </form>

      <div className="form-section" style={{ marginTop: 40 }}>
        <h2>Driver Management</h2>

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

        {!driverLoading && activeTab === "drivers" && (
          drivers.length === 0 ? (
            <p style={{ color: "#6b7280" }}>No drivers found under your sponsor.</p>
          ) : (() => {
            const ratingScore = (d) =>
              ratings[d.driverId] === "thumbs_up"
                ? 1
                : ratings[d.driverId] === "thumbs_down"
                ? -1
                : 0;

            const sortedDrivers = sortByRating
              ? [...drivers].sort((a, b) => ratingScore(b) - ratingScore(a))
              : drivers;

            return (
              <div>
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
                      border: sortByRating
                        ? "2px solid #16a34a"
                        : "1px solid var(--border, #d1d5db)",
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

                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
                      <th style={{ textAlign: "left", padding: "8px 12px" }}>Email</th>
                      <th style={{ textAlign: "left", padding: "8px 12px" }}>Status</th>
                      <th style={{ textAlign: "left", padding: "8px 12px" }}>Reason</th>
                      <th style={{ textAlign: "left", padding: "8px 12px" }}>Reliability</th>
                      <th style={{ textAlign: "left", padding: "8px 12px" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedDrivers.map((d) => (
                      <tr key={d.driverId} style={{ borderBottom: "1px solid #f3f4f6" }}>
                        <td style={{ padding: "10px 12px" }}>{d.email}</td>
                        <td style={{ padding: "10px 12px" }}>
                          <StatusBadge status={d.status} />
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
                                background:
                                  ratings[d.driverId] === "thumbs_up"
                                    ? "#dcfce7"
                                    : "var(--card)",
                                border:
                                  ratings[d.driverId] === "thumbs_up"
                                    ? "2px solid #16a34a"
                                    : "1px solid var(--border)",
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
                                background:
                                  ratings[d.driverId] === "thumbs_down"
                                    ? "#fee2e2"
                                    : "var(--card)",
                                border:
                                  ratings[d.driverId] === "thumbs_down"
                                    ? "2px solid #dc2626"
                                    : "1px solid var(--border)",
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
                          {d.status?.toLowerCase() !== "blocked" ? (
                            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                              <input
                                type="text"
                                placeholder="Reason (required)"
                                value={blockReason[d.driverId] || ""}
                                onChange={(e) =>
                                  setBlockReason((prev) => ({
                                    ...prev,
                                    [d.driverId]: e.target.value
                                  }))
                                }
                                style={{
                                  padding: "5px 8px",
                                  borderRadius: 6,
                                  border: "1px solid #d1d5db",
                                  fontSize: 12,
                                  minWidth: 160
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => handleBlock(d.driverId)}
                                style={{
                                  padding: "5px 12px",
                                  borderRadius: 6,
                                  border: "none",
                                  background: "#ef4444",
                                  color: "#fff",
                                  fontWeight: 600,
                                  cursor: "pointer",
                                  fontSize: 12
                                }}
                              >
                                Block
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleUnblock(d.driverId)}
                              style={{
                                padding: "5px 12px",
                                borderRadius: 6,
                                border: "none",
                                background: "#10b981",
                                color: "#fff",
                                fontWeight: 600,
                                cursor: "pointer",
                                fontSize: 12
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
              </div>
            );
          })()
        )}

        {!driverLoading && activeTab === "applications" && (
          applications.length === 0 ? (
            <p style={{ color: "#6b7280" }}>No applications found.</p>
          ) : (
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
                    <td style={{ padding: "10px 12px" }}>
                      <StatusBadge status={a.status} />
                    </td>
                    <td style={{ padding: "10px 12px", color: "#6b7280", fontSize: 12 }}>
                      {new Date(a.applied_at).toLocaleDateString()}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      {a.status === "PENDING" && (
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            type="button"
                            onClick={() => handleApplicationAction(a.id, "approve")}
                            style={{
                              padding: "5px 12px",
                              borderRadius: 6,
                              border: "none",
                              background: "#059669",
                              color: "#fff",
                              fontWeight: 600,
                              cursor: "pointer",
                              fontSize: 12
                            }}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => handleApplicationAction(a.id, "reject")}
                            style={{
                              padding: "5px 12px",
                              borderRadius: 6,
                              border: "none",
                              background: "#dc2626",
                              color: "#fff",
                              fontWeight: 600,
                              cursor: "pointer",
                              fontSize: 12
                            }}
                          >
                            Reject
                          </button>
                        </div>
                      )}
                      {a.status === "REJECTED" && (
                        <button
                          type="button"
                          onClick={() => handleReopen(a.id)}
                          style={{
                            padding: "5px 12px",
                            borderRadius: 6,
                            border: "none",
                            background: "#4f46e5",
                            color: "#fff",
                            fontWeight: 600,
                            cursor: "pointer",
                            fontSize: 12
                          }}
                        >
                          Reopen
                        </button>
                      )}
                      {a.status === "APPROVED" && (
                        <span style={{ color: "#9ca3af", fontSize: 12 }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}

        {!driverLoading && activeTab === "catalog" && (
          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
              <input
                type="text"
                placeholder="Search catalog…"
                value={catalogInput}
                onChange={(e) => setCatalogInput(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" &&
                  fetchCatalog(catalogInput.trim() || "top hits", catalogCat)
                }
                style={{
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: "1px solid #d1d5db",
                  fontSize: 13,
                  minWidth: 200
                }}
              />
              <button
                type="button"
                onClick={() => fetchCatalog(catalogInput.trim() || "top hits", catalogCat)}
                style={{
                  padding: "6px 14px",
                  borderRadius: 6,
                  border: "none",
                  background: "#4f46e5",
                  color: "#fff",
                  fontWeight: 600,
                  cursor: "pointer",
                  fontSize: 13
                }}
              >
                Search
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowHiddenOnly((v) => !v);
                  if (!showHiddenOnly) fetchHiddenIds();
                }}
                style={{
                  padding: "6px 14px",
                  borderRadius: 6,
                  border: showHiddenOnly ? "2px solid #dc2626" : "1px solid #d1d5db",
                  background: showHiddenOnly ? "#fee2e2" : "transparent",
                  color: showHiddenOnly ? "#991b1b" : "inherit",
                  fontWeight: 600,
                  cursor: "pointer",
                  fontSize: 13
                }}
              >
                {showHiddenOnly ? "Showing hidden only" : "Show hidden only"}
              </button>
            </div>

            {!showHiddenOnly && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
                {CAT_CATEGORIES.map((c) => (
                  <button
                    key={c.media}
                    type="button"
                    onClick={() => {
                      setCatalogCat(c);
                      fetchCatalog(catalogInput.trim() || "top hits", c);
                    }}
                    style={{
                      padding: "5px 14px",
                      borderRadius: 20,
                      border: "none",
                      fontWeight: 600,
                      fontSize: 12,
                      cursor: "pointer",
                      background: catalogCat.media === c.media ? "#4f46e5" : "#e5e7eb",
                      color: catalogCat.media === c.media ? "#fff" : "#374151"
                    }}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            )}

            {catalogLoading && <p style={{ color: "#6b7280" }}>Loading…</p>}

            {!catalogLoading && showHiddenOnly && (
              Object.values(hiddenProducts).length === 0 ? (
                <p style={{ color: "#6b7280" }}>No hidden products yet.</p>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 14 }}>
                  {Object.values(hiddenProducts).map((p) => (
                    <div
                      key={p.product_id}
                      style={{
                        border: "1px solid #e5e7eb",
                        borderRadius: 10,
                        overflow: "hidden",
                        background: "var(--card, #fff)",
                        opacity: 0.75
                      }}
                    >
                      {p.artwork_url && (
                        <img
                          src={p.artwork_url}
                          alt={p.product_name}
                          style={{ width: "100%", display: "block" }}
                        />
                      )}
                      <div style={{ padding: "8px 10px" }}>
                        <p style={{ fontSize: 11, color: "#6b7280", margin: "0 0 2px" }}>
                          {p.artist_name}
                        </p>
                        <p style={{ fontSize: 12, fontWeight: 600, margin: "0 0 8px", lineHeight: 1.3 }}>
                          {p.product_name}
                        </p>
                        <button
                          type="button"
                          onClick={() =>
                            handleToggleHide({
                              trackId: p.product_id,
                              trackName: p.product_name,
                              artistName: p.artist_name,
                              artworkUrl100: p.artwork_url
                            })
                          }
                          style={{
                            width: "100%",
                            padding: "5px 0",
                            borderRadius: 6,
                            border: "none",
                            background: "#10b981",
                            color: "#fff",
                            fontWeight: 600,
                            cursor: "pointer",
                            fontSize: 11
                          }}
                        >
                          Unhide
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}

            {!catalogLoading && !showHiddenOnly && catalogResults.length === 0 && (
              <p style={{ color: "#6b7280" }}>
                Search for items to hide or unhide them from your drivers.
              </p>
            )}

            {!catalogLoading && !showHiddenOnly && catalogResults.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 14 }}>
                {catalogResults.map((item) => {
                  const productId = String(item.trackId || item.collectionId);
                  const isHidden = hiddenIds.has(productId);
                  const name = item.trackName || item.collectionName || "Unknown";
                  const img = item.artworkUrl100?.replace("100x100bb", "160x160bb");

                  return (
                    <div
                      key={productId}
                      style={{
                        border: `1px solid ${isHidden ? "#fca5a5" : "#e5e7eb"}`,
                        borderRadius: 10,
                        overflow: "hidden",
                        background: isHidden ? "#fff5f5" : "var(--card, #fff)",
                        opacity: isHidden ? 0.7 : 1,
                        transition: "all 0.15s"
                      }}
                    >
                      {img && (
                        <img
                          src={img}
                          alt={name}
                          style={{ width: "100%", display: "block" }}
                        />
                      )}
                      <div style={{ padding: "8px 10px" }}>
                        <p style={{ fontSize: 11, color: "#6b7280", margin: "0 0 2px" }}>
                          {item.artistName}
                        </p>
                        <p style={{ fontSize: 12, fontWeight: 600, margin: "0 0 8px", lineHeight: 1.3 }}>
                          {name}
                        </p>
                        <button
                          type="button"
                          onClick={() => handleToggleHide(item)}
                          style={{
                            width: "100%",
                            padding: "5px 0",
                            borderRadius: 6,
                            border: "none",
                            background: isHidden ? "#10b981" : "#ef4444",
                            color: "#fff",
                            fontWeight: 600,
                            cursor: "pointer",
                            fontSize: 11
                          }}
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
      </div>
    </div>
  );
}