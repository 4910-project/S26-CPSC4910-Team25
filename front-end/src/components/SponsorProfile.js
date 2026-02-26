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
  const [activeTab, setActiveTab] = useState("drivers");     // "drivers" | "applications"

  // ─── Existing profile fetch (unchanged) ────────────────────────────────────
  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/sponsor`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok && data.profile) {
        setProfile({
          company_name: data.profile.company_name || "",
          contact_name: data.profile.contact_name || "",
          phone: data.profile.phone || "",
          address: data.profile.address || "",
          city: data.profile.city || "",
          state: data.profile.state || "",
          zip_code: data.profile.zip_code || "",
          point_value: data.profile.point_value || "0.01"
        });
        setIsEditing(false);
      } else if (res.status === 404) {
        setIsEditing(true);
      } else {
        throw new Error(data.message || "Failed to fetch profile");
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
      const res = await fetch(`${API_BASE}/sponsor`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ ...profile, point_value: pointValue })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to save profile");
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
      const res = await fetch(`${SPONSOR_API}/applications`, {
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
    else fetchApplications();
  }, [activeTab, fetchDrivers, fetchApplications]);

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

  const handleReopen = async (appId) => {
    setDriverError("");
    setDriverSuccess("");
    try {
      const res = await fetch(`${SPONSOR_API}/applications/${appId}/reopen`, {
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
          {["drivers", "applications"].map((tab) => (
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
                    <tr key={a.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "10px 12px" }}>{a.driver_email}</td>
                      <td style={{ padding: "10px 12px" }}><StatusBadge status={a.status} /></td>
                      <td style={{ padding: "10px 12px", color: "#6b7280", fontSize: 12 }}>
                        {new Date(a.applied_at).toLocaleDateString()}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        {a.status === "REJECTED" && (
                          <button
                            type="button"
                            onClick={() => handleReopen(a.id)}
                            style={{
                              padding: "5px 12px", borderRadius: 6, border: "none",
                              background: "#4f46e5", color: "#fff", fontWeight: 600,
                              cursor: "pointer", fontSize: 12
                            }}
                          >
                            Reopen
                          </button>
                        )}
                        {a.status !== "REJECTED" && <span style={{ color: "#9ca3af", fontSize: 12 }}>—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
        )}
      </div>
    </div>
  );
}