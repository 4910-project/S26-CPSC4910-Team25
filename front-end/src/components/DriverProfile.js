import React, { useState, useEffect } from "react";
import "./DriverProfile.css";

const API_BASE = "http://localhost:8001/api/profile";

export default function DriverProfile({ token, onLogout }) {
  const [profile, setProfile] = useState({
    first_name: "",
    last_name: "",
    phone: "",
    license_number: "",
    address: "",
    city: "",
    state: "",
    zip_code: ""
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
      const res = await fetch(`${API_BASE}/driver`, {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });

      const data = await res.json();

      if (res.ok && data.profile) {
        setProfile({
          first_name: data.profile.first_name || "",
          last_name: data.profile.last_name || "",
          phone: data.profile.phone || "",
          license_number: data.profile.license_number || "",
          address: data.profile.address || "",
          city: data.profile.city || "",
          state: data.profile.state || "",
          zip_code: data.profile.zip_code || ""
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
      if (!profile.first_name || !profile.last_name) {
        throw new Error("First name and last name are required");
      }

      const res = await fetch(`${API_BASE}/driver`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(profile)
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
      <div className="profile-container">
        <div className="loading">Loading profile...</div>
      </div>
    );
  }

  return (
    <div className="profile-container">
      <div className="profile-header">
        <h1>Driver Profile</h1>
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
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="first_name">First Name *</label>
            <input
              type="text"
              id="first_name"
              name="first_name"
              value={profile.first_name}
              onChange={handleChange}
              disabled={!isEditing}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="last_name">Last Name *</label>
            <input
              type="text"
              id="last_name"
              name="last_name"
              value={profile.last_name}
              onChange={handleChange}
              disabled={!isEditing}
              required
            />
          </div>
        </div>

        <div className="form-row">
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

          <div className="form-group">
            <label htmlFor="license_number">License Number</label>
            <input
              type="text"
              id="license_number"
              name="license_number"
              value={profile.license_number}
              onChange={handleChange}
              disabled={!isEditing}
            />
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="address">Address</label>
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