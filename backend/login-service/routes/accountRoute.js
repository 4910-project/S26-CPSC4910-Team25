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
  adminDeleteAccount,
  adminRestoreAccount,      
  adminListDeletedAccounts, 
} = require("../controllers/accountController");


router.get("/admin/deleted", authenticateToken, adminListDeletedAccounts);

router.delete("/admin/:userId", authenticateToken, adminDeleteAccount);
router.post("/admin/:userId/restore", authenticateToken, adminRestoreAccount);

module.exports = router;