import React, { useState, useEffect } from "react";
import "./PasswordReset.css";

const API_BASE = "http://localhost:8001/api/password-reset";

export default function PasswordReset() {
  const [step, setStep] = useState("request"); // request, reset, success
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  // Check if URL has token parameter
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get("token");
    
    if (urlToken) {
      setToken(urlToken);
      verifyToken(urlToken);
    }
  }, []);

  const verifyToken = async (tokenToVerify) => {
    try {
      const res = await fetch(`${API_BASE}/verify/${tokenToVerify}`);
      const data = await res.json();

      if (res.ok && data.valid) {
        setStep("reset");
      } else {
        setError("Invalid or expired reset token");
      }
    } catch (err) {
      setError("Failed to verify token");
    }
  };

  const handleRequestReset = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      if (!email) {
        throw new Error("Email is required");
      }

      const res = await fetch(`${API_BASE}/request`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Failed to send reset link");
      }

      // In development, show the token
      if (data.token) {
        setToken(data.token);
        setSuccess(`Reset link generated! Token: ${data.token}`);
        setStep("reset");
      } else {
        setSuccess(data.message);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    // Validate passwords
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters long");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/reset`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          token,
          newPassword
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Failed to reset password");
      }

      setSuccess(data.message);
      setStep("success");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBackToLogin = () => {
    window.location.href = "/"; // Redirect to login page
  };

  return (
    <div className="password-reset-container">
      <div className="password-reset-card">
        {step === "request" && (
          <>
            <h2>Reset Password</h2>
            <p className="subtitle">
              Enter your email address and we'll send you a link to reset your password.
            </p>

            {error && <div className="error-message">{error}</div>}
            {success && <div className="success-message">{success}</div>}

            <form onSubmit={handleRequestReset} className="reset-form">
              <div className="form-group">
                <label htmlFor="email">Email Address</label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  autoFocus
                />
              </div>

              <button 
                type="submit" 
                className="btn-submit"
                disabled={loading}
              >
                {loading ? "Sending..." : "Send Reset Link"}
              </button>
            </form>

            <div className="form-footer">
              <button 
                onClick={handleBackToLogin}
                className="link-button"
              >
                ← Back to Login
              </button>
            </div>
          </>
        )}

        {step === "reset" && (
          <>
            <h2>Create New Password</h2>
            <p className="subtitle">
              Enter your new password below.
            </p>

            {error && <div className="error-message">{error}</div>}
            {success && <div className="success-message">{success}</div>}

            <form onSubmit={handleResetPassword} className="reset-form">
              <div className="form-group">
                <label htmlFor="newPassword">New Password</label>
                <div className="password-wrapper">
                  <input
                    type={showPassword ? "text" : "password"}
                    id="newPassword"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    autoFocus
                  />
                  <button
                    type="button"
                    className="toggle-visibility"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
                <small className="hint">Must be at least 8 characters</small>
              </div>

              <div className="form-group">
                <label htmlFor="confirmPassword">Confirm Password</label>
                <input
                  type={showPassword ? "text" : "password"}
                  id="confirmPassword"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>

              <button 
                type="submit" 
                className="btn-submit"
                disabled={loading}
              >
                {loading ? "Resetting..." : "Reset Password"}
              </button>
            </form>
          </>
        )}

        {step === "success" && (
          <>
            <div className="success-icon">✓</div>
            <h2>Password Reset Successful!</h2>
            <p className="subtitle">
              Your password has been reset successfully. You can now log in with your new password.
            </p>

            <button 
              onClick={handleBackToLogin}
              className="btn-submit"
            >
              Go to Login
            </button>
          </>
        )}
      </div>
    </div>
  );
}