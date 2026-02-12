/**
 * @file profileRoutes.js
 * @description API routes for user profile management
 * Handles driver profiles, sponsor profiles, and password changes
 */

const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../controllers/loginController");
const {
  createOrUpdateDriverProfile,
  getDriverProfile,
  createOrUpdateSponsorProfile,
  getSponsorProfile,
  changePassword
} = require("../controllers/profileController");

// ============================
// Driver Profile Routes
// ============================

/**
 * GET /api/profile/driver
 * @description Get current driver's profile
 * @access Protected (requires authentication)
 */
router.get("/driver", authenticateToken, getDriverProfile);

/**
 * POST /api/profile/driver
 * @description Create or update driver profile
 * @access Protected (requires authentication)
 * 
 * @body {string} first_name - Driver's first name
 * @body {string} last_name - Driver's last name
 * @body {string} [phone] - Phone number
 * @body {string} [license_number] - Driver's license number
 * @body {string} [address] - Street address
 * @body {string} [city] - City
 * @body {string} [state] - State
 * @body {string} [zip_code] - ZIP code
 * @body {number} [sponsor_id] - Sponsor company ID
 */
router.post("/driver", authenticateToken, createOrUpdateDriverProfile);

// ============================
// Sponsor Profile Routes
// ============================

/**
 * GET /api/profile/sponsor
 * @description Get current sponsor's profile
 * @access Protected (requires authentication)
 */
router.get("/sponsor", authenticateToken, getSponsorProfile);

/**
 * POST /api/profile/sponsor
 * @description Create or update sponsor profile
 * @access Protected (requires authentication)
 * 
 * @body {string} company_name - Company name (required)
 * @body {string} [contact_name] - Contact person name
 * @body {string} [phone] - Phone number
 * @body {string} [address] - Street address
 * @body {string} [city] - City
 * @body {string} [state] - State
 * @body {string} [zip_code] - ZIP code
 * @body {number} [point_value] - Dollar value per point (default 0.01)
 */
router.post("/sponsor", authenticateToken, createOrUpdateSponsorProfile);

// ============================
// Password Management Routes
// ============================

/**
 * POST /api/profile/change-password
 * @description Change password for authenticated user
 * @access Protected (requires authentication)
 * 
 * @body {string} currentPassword - User's current password
 * @body {string} newPassword - New password (min 8 characters)
 */
router.post("/change-password", authenticateToken, changePassword);

module.exports = router;