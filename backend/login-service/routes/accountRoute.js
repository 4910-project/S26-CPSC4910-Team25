/**
 * @file accountRoutes.js
 * @description API routes for account management
 * handles server side deletion of accounts
 */

const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../controllers/loginController");
const {
  deleteAccount,
  adminDeleteAccount
} = require("../controllers/accountController");


router.delete("/", authenticateToken, deleteAccount);

router.delete("/admin/:userId", authenticateToken, adminDeleteAccount);

module.exports = router;