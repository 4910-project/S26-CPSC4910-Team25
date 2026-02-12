const profileModel = require("../models/profileModel");
const userModel = require("../models/loginModel");

// ============================
// delete account
// ============================

/**
 * delets account from the server
 * @route DELETE /api/account
 * 
 */
const deleteAccount = async (req, res) => {
  try {
    const userId = req.user.id;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ 
        message: "Password confirmation required to delete account" 
      });
    }

    
    const user = await userModel.findUserByEmail(req.user.email);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // make sure the password is right
    const { comparePassword } = require("../utils/hash");
    const isMatch = await comparePassword(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ 
        message: "Incorrect password" 
      });
    }

    
    await new Promise((resolve, reject) => {
      const query = `
        INSERT INTO audit_log (user_id, action_type, details)
        VALUES (?, 'ACCOUNT_DELETED', 'User deleted their account')
      `;
      profileModel.db.run(query, [userId], function(err) {
        if (err) reject(err);
        else resolve();
      });
    });

    // deletes user, i hate this function why is it so complicated to delete from a db

    await new Promise((resolve, reject) => {
      const query = "DELETE FROM users WHERE id = ?";
      profileModel.db.run(query, [userId], function(err) {
        if (err) {
          reject(err);
          return;
        }
        if (this.changes === 0) {
          reject(new Error("User not found"));
          return;
        }
        resolve();
      });
    });

    res.json({ 
      message: "Account deleted successfully" 
    });
  } catch (err) {
    console.error("Delete account error:", err);
    res.status(500).json({ message: "Failed to delete account" });
  }
};


const adminDeleteAccount = async (req, res) => {
  try {
    const adminRole = req.user.role;
    const targetUserId = parseInt(req.params.userId);

    // check admin auth
    if (adminRole !== 'ADMIN') {
      return res.status(403).json({ 
        message: "Access denied. Admin privileges required." 
      });
    }

    if (!targetUserId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    // Prevents admin from deleting itself
    if (targetUserId === req.user.id) {
      return res.status(400).json({ 
        message: "Cannot delete your own admin account" 
      });
    }

    
    const userExists = await new Promise((resolve, reject) => {
      const query = "SELECT id, username, email, role FROM users WHERE id = ?";
      profileModel.db.get(query, [targetUserId], (err, row) => {
        if (err) reject(err);
        else resolve(row || null);
      });
    });

    if (!userExists) {
      return res.status(404).json({ message: "User not found" });
    }

    
    await new Promise((resolve, reject) => {
      const query = `
        INSERT INTO audit_log (user_id, action_type, details)
        VALUES (?, 'ADMIN_DELETED_USER', ?)
      `;
      const details = `Admin deleted user: ${userExists.username} (${userExists.email})`;
      profileModel.db.run(query, [req.user.id, details], function(err) {
        if (err) reject(err);
        else resolve();
      });
    });

    // delete user
    await new Promise((resolve, reject) => {
      const query = "DELETE FROM users WHERE id = ?";
      profileModel.db.run(query, [targetUserId], function(err) {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });

    res.json({ 
      message: `User account deleted successfully`,
      deletedUser: {
        id: userExists.id,
        username: userExists.username,
        email: userExists.email
      }
    });
  } catch (err) {
    console.error("Admin delete account error:", err);
    res.status(500).json({ message: "Failed to delete user account" });
  }
};

module.exports = {
  deleteAccount,
  adminDeleteAccount
};