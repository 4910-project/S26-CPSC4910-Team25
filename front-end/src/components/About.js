import React, { useState, useEffect } from "react";
import "./About.css";

const API_BASE =
  process.env.REACT_APP_API_URL ||
  "http://Team-25-app-env.eba-mghj3gwy.us-east-1.elasticbeanstalk.com";

  
export default function About({ onBack }) {
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${API_BASE}/api/about`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load");
        return res.json();
      })
      .then((data) => {
        setInfo(data);
        setLoading(false);
      })
      .catch(() => {
        setError("Could not load about information. Please try again later.");
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="about-wrapper">
        <div className="about-loading">
          <div className="about-spinner" />
          <p>Loading…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="about-wrapper">
        <div className="about-error">
          <span className="about-error-icon">⚠</span>
          <p>{error}</p>
          {onBack && (
            <button className="about-back-btn" onClick={onBack}>
              ← Go Back
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="about-wrapper">
      {/* Hero Banner */}
      <div className="about-hero">
        <div className="about-hero-glow" />
        <div className="about-hero-content">
          <div className="about-badge">Good Driver Incentive Program</div>
          <h1 className="about-title">{info.product_name}</h1>
          <p className="about-tagline">
            Rewarding excellence on the road, one mile at a time.
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="about-container">

        {/* Description Card */}
        <div className="about-card about-card-description">
          <div className="about-card-icon">🚛</div>
          <h2>About the Program</h2>
          <p className="about-description">{info.product_description}</p>
        </div>

        {/* Meta Grid */}
        <div className="about-meta-grid">
          <div className="about-meta-card">
            <span className="about-meta-label">Team</span>
            <span className="about-meta-value">{info.team_number}</span>
          </div>
          <div className="about-meta-card">
            <span className="about-meta-label">Version</span>
            <span className="about-meta-value">{info.version}</span>
          </div>
          <div className="about-meta-card">
            <span className="about-meta-label">Release Date</span>
            <span className="about-meta-value">{info.release_date}</span>
          </div>
          <div className="about-meta-card">
            <span className="about-meta-label">Product</span>
            <span className="about-meta-value about-meta-value--sm">
              {info.product_name}
            </span>
          </div>
        </div>

        {/* How It Works */}
        <div className="about-card">
          <h2>How It Works</h2>
          <div className="about-steps">
            <div className="about-step">
              <div className="about-step-num">1</div>
              <div>
                <strong>Sponsors Set the Rules</strong>
                <p>Companies enroll drivers and define the behaviors they want to reward.</p>
              </div>
            </div>
            <div className="about-step">
              <div className="about-step-num">2</div>
              <div>
                <strong>Drivers Earn Points</strong>
                <p>Good on-road performance earns points credited directly to a driver's account.</p>
              </div>
            </div>
            <div className="about-step">
              <div className="about-step-num">3</div>
              <div>
                <strong>Redeem for Rewards</strong>
                <p>Drivers browse a sponsor-curated product catalog and redeem points for real goods.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Back Button */}
        {onBack && (
          <div className="about-footer">
            <button className="about-back-btn" onClick={onBack}>
              ← Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}