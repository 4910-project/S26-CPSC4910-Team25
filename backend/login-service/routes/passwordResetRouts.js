/**
 * @file passwordResetRoutes.js
 * @description API routes for password reset functionality
 * Handles forgot password flow with secure token system
 */

const express = require("express");
const router = express.Router();
const {
  requestPasswordReset,
  verifyResetToken,
  resetPassword
} = require("../controllers/passwordResetController");

/**
 * POST /api/password-reset/request
 * @description Request a password reset token
 * @access Public
 * 
 * @body {string} email - User's email address
 * 
 * @returns {Object} { message: string }
 * @returns {Object} [DEV ONLY] { message: string, token: string, resetUrl: string }
 * 
 * @example
 * POST /api/password-reset/request
 * { "email": "user@example.com" }
 * 
 * Response (Production):
 * { "message": "If an account exists with this email, a reset link has been sent." }
 * 
 * Response (Development):
 * {
 *   "message": "Password reset token generated",
 *   "token": "abc123...",
 *   "resetUrl": "http://localhost:3000/reset-password?token=abc123..."
 * }
 */
router.post("/request", requestPasswordReset);

/**
 * GET /api/password-reset/verify/:token
 * @description Verify if a reset token is valid
 * @access Public
 * 
 * @param {string} token - Reset token from URL
 * 
 * @returns {Object} { valid: boolean, message: string }
 * @throws {400} If token is invalid or expired
 * 
 * @example
 * GET /api/password-reset/verify/abc123...
 * 
 * Response:
 * { "valid": true, "message": "Token is valid" }
 */
router.get("/verify/:token", verifyResetToken);

/**
 * POST /api/password-reset/reset
 * @description Reset password using valid token
 * @access Public
 * 
 * @body {string} token - Reset token
 * @body {string} newPassword - New password (min 8 characters)
 * 
 * @returns {Object} { message: string }
 * @throws {400} If token invalid or password too short
 * 
 * @example
 * POST /api/password-reset/reset
 * {
 *   "token": "abc123...",
 *   "newPassword": "newSecurePass123"
 * }
 * 
 * Response:
 * { "message": "Password reset successfully" }
 */
router.post("/reset", resetPassword);

module.exports = router;