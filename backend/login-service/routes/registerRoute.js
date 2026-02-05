/**
 * @file registerRoutes.js
 * @description Defines API routes for user registration
 * Handles new user account creation
 */

const express = require("express");
const router = express.Router();
const { register } = require("../controllers/loginController");

/**
 * POST /api/register
 * @description Register a new user account
 * @access Public
 * 
 * @body {string} username - Desired username (must be unique)
 * @body {string} email - User's email address (must be unique)
 * @body {string} password - User's password (will be hashed before storage)
 * 
 * @returns {Object} { message: string, user: { id: number, username: string, email: string } }
 * @throws {400} If username, email, or password missing
 * @throws {409} If username or email already exists
 * @throws {500} If server error
 * 
 * @example
 * POST /api/register
 * {
 *   "username": "john_doe",
 *   "email": "john@example.com",
 *   "password": "securePassword123"
 * }
 * 
 * Response:
 * {
 *   "message": "User registered successfully",
 *   "user": {
 *     "id": 1,
 *     "username": "john_doe",
 *     "email": "john@example.com"
 *   }
 * }
 */
router.post("/", register);

module.exports = router;