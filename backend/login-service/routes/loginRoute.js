/**
  *  Defines API routes for user authentication 
 * And Handles login requests and protected profile endpoint
 */

const express = require("express");
const router = express.Router();
const { login, me, authenticateToken } = require("../controllers/loginController");

/**
 * POST /api/login
 * @description Authenticate user and return JWT token
 * @access Public
 * 
 * @body {string} identifier - User's email or username
 * @body {string} password - User's password
 * 
 * @returns {Object} { message: string, token: string }
 * @throws {400} If identifier or password missing
 * @throws {401} If credentials invalid
 * @throws {500} If server error
 */
router.post("/", login);

/**
 * GET /api/login/me
 * @description Get current logged-in user information
 * @access Protected (requires valid JWT)
 * 
 * @header {string} Authorization - Bearer token
 * 
 * @returns {Object} { id: number, username: string, email: string }
 * @throws {401} If no token provided
 * @throws {403} If token invalid or expired
 * @throws {404} If user not found
 * @throws {500} If server error
 */
router.get("/me", authenticateToken, me);

/**
 * GET /api/login/verify
 * @description Verify if token is valid
 * @access Protected (requires valid JWT)
 * 
 * @header {string} Authorization - Bearer token
 * 
 * @returns {Object} { valid: true, user: Object }
 * @throws {401} If no token provided
 * @throws {403} If token invalid or expired
 */
router.get("/verify", authenticateToken, (req, res) => 
{
  res.json
  ({ 
        valid: true, 
        user: req.user 
  });
});

module.exports = router;