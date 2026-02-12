require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const { hashPassword, comparePassword } = require("../utils/hash");
const userModel = require("../models/loginModel");
const jwt = require("jsonwebtoken");

// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET; // Replace with process.env.JWT_SECRET in production
const JWT_EXPIRES_IN = "30m"; // token expires in 30 minutes

// ============================
// Register Controller
// ============================

/**
 * Register a new user.
 * Hashes the password before storing in the database.
 *
 * @async
 * @function register
 * @param {Object} req - Express request object
 * @param {Object} req.body - Request body
 * @param {string} req.body.username - Username of the new user
 * @param {string} req.body.email - Email of the new user
 * @param {string} req.body.password - Plain password of the new user
 * @param {Object} res - Express response object
 * @returns {JSON} JSON response with success message and new user info
 */
const register = async (req, res) => {
  const { username, email, password, role } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ message: "Username, email, and password are required" });
  }

  try {
    const existingUser = await userModel.findUserByEmail(email);
    const existingUsername = await userModel.findUserByUsername(username);

    if (existingUser || existingUsername) {
      return res.status(409).json({ message: "Username or email already exists" });
    }

    const hashedPassword = await hashPassword(password);
    const newUser = await userModel.createUser(username, email, hashedPassword);

    const userRole = role || 'DRIVER';
    await require("../models/profileModel").updateUserRole(newUser.id, userRole);

    res.status(201).json({
      message: "User registered successfully",
      user: { id: newUser.id, username: newUser.username, email: newUser.email },
    });
  } catch (err) {
    console.error("Register error:", err);
    
    // CRITICAL FIX: Handle race condition where duplicate insert happens
    // between our check and insert (concurrent requests)
    if (err.code === 'SQLITE_CONSTRAINT' || err.errno === 19) {
      return res.status(409).json({ message: "Username or email already exists" });
    }
    
    res.status(500).json({ message: "Internal server error" });
  }
};

// ============================
// Login Controller (email OR username)
// ============================

/**
 * Log in a user using email or username.
 * Compares the entered password with the hashed password stored in the database.
 * Generates a JWT token on successful login.
 *
 * @async
 * @function login
 * @param {Object} req - Express request object
 * @param {Object} req.body - Request body
 * @param {string} req.body.identifier - User's email or username
 * @param {string} req.body.password - User's plain password
 * @param {Object} res - Express response object
 * @returns {JSON} JSON response with success message and JWT token
 */
const login = async (req, res) => {
  const { identifier, password } = req.body;

  if (!identifier || !password) {
    return res.status(400).json({ message: "Identifier and password are required" });
  }

  try {
    // Try to find user by email first, then by username
    let user = await userModel.findUserByEmail(identifier);
    if (!user) user = await userModel.findUserByUsername(identifier);

    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    const isMatch = await comparePassword(password, user.password);
    if (!isMatch) return res.status(401).json({ message: "Invalid credentials" });

    const role = await require("../models/profileModel").getUserRole(user.id);

    // Include both email and username in JWT for flexibility
    const token = jwt.sign(
      { id: user.id, username: user.username, email: user.email, role: role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({ message: "Login successful", token, role });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

// ============================
// JWT Middleware
// ============================

/**
 * Middleware to authenticate a JWT token.
 * Protects routes by verifying the token.
 *
 * @function authenticateToken
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {void} Calls next() if token is valid, otherwise sends 401/403 response
 */
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

  if (!token) return res.status(401).json({ message: "Access token required" });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: "Invalid or expired token" });
    req.user = user;
    next();
  });
};

// ============================
// Get Current User (email OR username)
// ============================

/**
 * Get the currently logged-in user.
 * Can fetch user by email or username from JWT.
 * Requires `authenticateToken` middleware.
 *
 * @async
 * @function me
 * @param {Object} req - Express request object (requires req.user)
 * @param {Object} res - Express response object
 * @returns {JSON} JSON response with user information
 */
const me = async (req, res) => {
  const { email, username } = req.user;

  try {
    let user;
    if (email) user = await userModel.findUserByEmail(email);
    else if (username) user = await userModel.findUserByUsername(username);

    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({ id: user.id, username: user.username, email: user.email });
  } catch (err) {
    console.error("Me error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  register,
  login,
  authenticateToken,
  me,
};
