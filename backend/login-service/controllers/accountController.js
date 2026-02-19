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

   await userModel.softDeleteUser(userId, null);

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
      const query = "SELECT id, username, email, role FROM users WHERE id = ? AND (is_deleted = 0 OR is_deleted IS NULL)";
      profileModel.db.get(query, [targetUserId], (err, row) => {
        if (err) reject(err);
        else resolve(row || null);
      });
    });

    if (!userExists) {
      return res.status(404).json({ message: "User not found or hidden" });
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
    await userModel.softDeleteUser(targetUserId, req.user.id);

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

const adminRestoreAccount = async (req, res) => 
{
  try 
  {
    if (req.user.role !== "ADMIN") 
    {
      return res.status(403).json({ message: "Access denied. You need to be an admin" });
    }
    const targetUserId = parseInt(req.params.userId);
    if (!targetUserId) return res.status(400).json({ message: "User ID is required" });

    const user = await userModel.findUserByIdIncludeDeleted(targetUserId);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (!user.is_deleted) return res.status(400).json({ message: "Account is already deleted" });

    await userModel.restoreUser(targetUserId);

    await new Promise((resolve, reject) => 
      {
      profileModel.db.run(
        `INSERT INTO audit_log (user_id, action_type, details) VALUES (?, 'ADMIN_RESTORED_USER', ?)`,
        [req.user.id, `Admin restored user: ${user.username} (${user.email})`],
        (err) => { if (err) reject(err); else resolve(); }
      );
    });

    res.json({
      message: "User account restored successfully.",
      restoredUser: { id: user.id, username: user.username, email: user.email, role: user.role }
    });
  } catch (err) {
    console.error("Admin restore account error:", err);
    res.status(500).json({ message: "Failed to restore user account" });
  }
};

const adminListDeletedAccounts = async (req, res) => 
{
  try 
  {
    if (req.user.role !== "ADMIN") 
    {
      return res.status(403).json({ message: "Access denied. Only admins have permission for this." });
    }
    const deletedUsers = await userModel.listDeletedUsers();
    res.json({ count: deletedUsers.length, deletedAccounts: deletedUsers });
  } catch (err) 
  {
    console.error("List deleted accounts error:", err);
    res.status(500).json({ message: "Failed to retrieve deleted accounts" });
  }
};

module.exports = {
  deleteAccount,
  adminDeleteAccount,
  adminRestoreAccount,
  adminListDeletedAccounts
};