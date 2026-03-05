const express = require("express");
const pool = require("../db");
const auth = require("../middleware/auth"); // JWT middleware
const router = express.Router();

router.post("/", auth, async (req, res) => {
    try{
        const driverUserId = req.user.id;
        const { sponsor_id } = req.body;

        if (!sponsor_id) {
            return res.status(400).json({ error: "sponsor_id is required"});
        }
        const [pending] = await pool.query(
            `
            SELECT id
            FROM driver_applications
            WHERE driver_user_id=? AND status='pending' 
            LIMIT 1
            `,
            [driverUserId]
        );

        if (pending.length > 0) {
            return res.status(409).json({ error: "You already have one pending application"});
        }


        const [result] = await pool.query(
            `
            INSERT INTO driver_applications(driver_user_id, sponsor_id, status)
            VALUES (?, ?, 'pending')
            `,
            [driverUserId, sponsor_id]
        );
        res.status(201).jsonp({ ok: true, application_id: result.insertId});
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error" });
    }
});

// Cancel Pending Application
router.patch("/:id/cancel", auth, async (req, res) => {
    try{
        const driverUserId = req.user.id;
        const appId = Number(req.params.id);

        const [result] = await pool.query(
            `
            UPDATE driver_applications
            SET status='cancelled'
            WHERE id=? AND driver_user_id=? AND status='pending'
            `,
            [appId, driverUserId]
        );
        res.json({ ok: true, status: "cancelled "});
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error" });
    }
});

// Sort driver applications and see denial reason
router.get("/", auth, async (req, res) => {
    try {
        const driverUserId = req.user.id;

        const[rows] = await pool.query(
            `
            SELECT id, sponsor_id, status, denial_reason, created_at
            FROM driver_applications
            WHERE driver_user_id=?
            ORDER BY created_at DESC
            `,
            [driverUserId]
        );

        res.json({ ok: true, applications: rows });
    } catch(err) {
        console.error(err);
        res.status(500).json({ error: "Server error "});
    }
});


module.exports = router;