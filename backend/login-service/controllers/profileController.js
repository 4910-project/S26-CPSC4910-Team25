const profileModel = require("../models/profileModel");
const { hashPassword } = require("../utils/hash");

// ============================
// Driver Profile Controllers
// ============================

/**
 * Create or update driver profile
 * @route POST /api/profile/driver
 * @access Protected (Driver role)
 */
const createOrUpdateDriverProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const profileData = req.body;

    // Validate required fields for creation
    if (!profileData.first_name || !profileData.last_name) {
      return res.status(400).json({ 
        message: "First name and last name are required" 
      });
    }

    // Check if profile already exists
    const existingProfile = await profileModel.getDriverProfile(userId);

    if (existingProfile) {
      // Update existing profile
      await profileModel.updateDriverProfile(userId, profileData);
      const updatedProfile = await profileModel.getDriverProfile(userId);
      
      return res.json({
        message: "Driver profile updated successfully",
        profile: updatedProfile
      });
    } else {
      // Create new profile
      await profileModel.createDriverProfile(userId, profileData);
      const newProfile = await profileModel.getDriverProfile(userId);
      
      return res.status(201).json({
        message: "Driver profile created successfully",
        profile: newProfile
      });
    }
  } catch (err) {
    console.error("Driver profile error:", err);
    res.status(500).json({ message: "Failed to save driver profile" });
  }
};

/**
 * Get driver profile
 * @route GET /api/profile/driver
 * @access Protected (Driver role)
 */
const getDriverProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const profile = await profileModel.getDriverProfile(userId);

    if (!profile) {
      return res.status(404).json({ 
        message: "Driver profile not found. Please create your profile." 
      });
    }

    res.json({ profile });
  } catch (err) {
    console.error("Get driver profile error:", err);
    res.status(500).json({ message: "Failed to retrieve driver profile" });
  }
};

// ============================
// Sponsor Profile Controllers
// ============================

/**
 * Create or update sponsor profile
 * @route POST /api/profile/sponsor
 * @access Protected (Sponsor role)
 */
const createOrUpdateSponsorProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const profileData = req.body;

    // Validate required fields
    if (!profileData.company_name) {
      return res.status(400).json({ 
        message: "Company name is required" 
      });
    }

    // Check if profile already exists
    const existingProfile = await profileModel.getSponsorProfile(userId);

    if (existingProfile) {
      // Update existing profile
      await profileModel.updateSponsorProfile(userId, profileData);
      const updatedProfile = await profileModel.getSponsorProfile(userId);
      
      return res.json({
        message: "Sponsor profile updated successfully",
        profile: updatedProfile
      });
    } else {
      // Create new profile
      await profileModel.createSponsorProfile(userId, profileData);
      const newProfile = await profileModel.getSponsorProfile(userId);
      
      return res.status(201).json({
        message: "Sponsor profile created successfully",
        profile: newProfile
      });
    }
  } catch (err) {
    console.error("Sponsor profile error:", err);
    res.status(500).json({ message: "Failed to save sponsor profile" });
  }
};

/**
 * Get sponsor profile
 * @route GET /api/profile/sponsor
 * @access Protected (Sponsor role)
 */
const getSponsorProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const profile = await profileModel.getSponsorProfile(userId);

    if (!profile) {
      return res.status(404).json({ 
        message: "Sponsor profile not found. Please create your profile." 
      });
    }

    res.json({ profile });
  } catch (err) {
    console.error("Get sponsor profile error:", err);
    res.status(500).json({ message: "Failed to retrieve sponsor profile" });
  }
};

// ============================
// Change Password Controller
// ============================

/**
 * Change password (authenticated user)
 * @route POST /api/profile/change-password
 * @access Protected
 */
const changePassword = async (req, res) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        message: "Current password and new password are required" 
      });
    }

    // Validate password complexity
    if (newPassword.length < 8) {
      return res.status(400).json({ 
        message: "New password must be at least 8 characters long" 
      });
    }

    // Get user from database
    const { findUserByEmail } = require("../models/loginModel");
    const user = await findUserByEmail(req.user.email);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Verify current password
    const { comparePassword } = require("../utils/hash");
    const isMatch = await comparePassword(currentPassword, user.password);

    if (!isMatch) {
      return res.status(401).json({ 
        message: "Current password is incorrect" 
      });
    }

    // Hash new password
    const hashedPassword = await hashPassword(newPassword);

    // Update password in database
    await new Promise((resolve, reject) => {
      const query = "UPDATE users SET password = ? WHERE id = ?";
      profileModel.db.run(query, [hashedPassword, userId], function(err) {
        if (err) reject(err);
        else resolve();
      });
    });

    // Log password change in audit log
    await new Promise((resolve, reject) => {
      const query = `
        INSERT INTO audit_log (user_id, action_type, details)
        VALUES (?, 'PASSWORD_CHANGE', 'User changed password')
      `;
      profileModel.db.run(query, [userId], function(err) {
        if (err) reject(err);
        else resolve();
      });
    });

    res.json({ message: "Password changed successfully" });
  } catch (err) {
    console.error("Change password error:", err);
    res.status(500).json({ message: "Failed to change password" });
  }
};

module.exports = {
  createOrUpdateDriverProfile,
  getDriverProfile,
  createOrUpdateSponsorProfile,
  getSponsorProfile,
  changePassword
};