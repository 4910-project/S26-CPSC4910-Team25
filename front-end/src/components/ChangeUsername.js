import React, { useState } from "react";
import "./ChangePassword.css";

const API_BASE = "http://localhost:8001/api/profile";

export default function ChangeUsername({ token, onClose }) {
  const [formData, setFormData] = useState({
    newUsername: "",
    confirmUsername: ""
  });
  
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    setError("");
  };


  const validateUsername = () => {
    const u1 = formData.newUsername.trim();
    const u2 = formData.confirmUsername.trim();

    if (u1.length < 3) {
      setError("New username must be at least 3 characters long");
      return false;
    }

    if (u1 !== u2) {
        setError("Usernames do not match");
        return false;
    }

    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!validateUsername()) {
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/change-username`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          newUsername: formData.newUsername.trim()
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Failed to change username");
      }

      setSuccess(data.message);
      
      // Clear form
      setFormData({
        newUsername: "",
        confirmUsername: ""
      });

      // Close modal after 2 seconds
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOverlayClick = (e) => {
    if (e.target.className === "change-password-overlay") {
      onClose();
    }
  };

  return (
    <div className="change-password-overlay" onClick={handleOverlayClick}>
      <div className="change-password-modal">
        <div className="modal-header">
          <h2>Change Username</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        <form onSubmit={handleSubmit} className="password-form">
          <div className="form-group">
            <label htmlFor="newUsername">New Username</label>
            <div className="password-input-wrapper">
              <input
                type="text"
                id="newUsername"
                name="newUsername"
                value={formData.newUsername}
                onChange={handleChange}
                required
                autoComplete="username"
              />
              
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="confirmUsername">Confirm Username</label>
            <div className="password-input-wrapper">
              <input
                type="text"
                id="confirmUsername"
                name="confirmUsername"
                value={formData.confirmUsername}
                onChange={handleChange}
                required
                autoComplete="username"
              />
              
          </div>
          </div>

          <div className="form-actions">
            <button 
              type="submit" 
              className="btn-submit"
              disabled={loading}
            >
              {loading ? "Changing..." : "Change Username"}
            </button>
            <button 
              type="button" 
              className="btn-cancel"
              onClick={onClose}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}