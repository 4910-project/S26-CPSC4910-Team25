import React, { useState, useEffect } from "react";
import "./SponsorProfile.css";

const API_BASE = "http://localhost:8001/api/profile";

export default function SponsorProfile({ token, onLogout }) {
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

  // Fetch profile on component mount
  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/sponsor`, {
        headers: {
          "Authorization": `Bearer ${token}`
        }
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
        // Profile doesn't exist yet - enable editing mode
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
    setProfile({
      ...profile,
      [e.target.name]: e.target.value
    });
    setError("");
    setSuccess("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSaving(true);

    try {
      // Validate required fields
      if (!profile.company_name) {
        throw new Error("Company name is required");
      }

      // Validate point value
      const pointValue = parseFloat(profile.point_value);
      if (isNaN(pointValue) || pointValue < 0) {
        throw new Error("Point value must be a valid positive number");
      }

      const res = await fetch(`${API_BASE}/sponsor`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          ...profile,
          point_value: pointValue
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Failed to save profile");
      }

      setSuccess(data.message);
      setIsEditing(false);
      
      // Refresh profile data
      await fetchProfile();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    fetchProfile(); // Reset to original data
    setIsEditing(false);
    setError("");
    setSuccess("");
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
            <button 
              onClick={() => setIsEditing(true)}
              className="btn-edit"
            >
              Edit Profile
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
        </div>

        {isEditing && (
          <div className="form-actions">
            <button 
              type="submit" 
              disabled={saving}
              className="btn-save"
            >
              {saving ? "Saving..." : "Save Profile"}
            </button>
            <button 
              type="button" 
              onClick={handleCancel}
              className="btn-cancel"
            >
              Cancel
            </button>
          </div>
        )}
      </form>
    </div>
  );
}