const express = require("express");
const app = express.Router();
const User = require("../model/user.js");
const Profile = require("../model/profiles.js");
const anticheatSystem = require("../structs/anticheat.js");
const battlepass = require("../structs/battlepass.js");
const log = require("../structs/log.js");

// Configuration for rewards
const REWARDS = {
    KILL: 25,      // V-Bucks per kill
    WIN: 70,      // V-Bucks per win
    XP_PER_KILL: 50,
    XP_PER_WIN: 300,
    XP_PER_LEVEL: 80000  // Chapter 2 Season 2 standard
};

/**
 * Report player kill - awards V-Bucks and XP
 * POST /api/game/kill
 * Body: { accountId, killerAccountId, victimAccountId, distance, headshot, position, velocity }
 */
app.post("/api/game/kill", async (req, res) => {
    try {
        const { accountId, killerAccountId, victimAccountId, distance, headshot, position, velocity } = req.body;

        if (!killerAccountId) {
            return res.status(400).json({ error: "killerAccountId is required" });
        }

        // Track kill for anticheat
        const killCheck = anticheatSystem.trackKill(
            killerAccountId,
            victimAccountId,
            distance || 0,
            headshot || false,
            Date.now()
        );

        if (killCheck.suspicious) {
            // Log violation
            await anticheatSystem.logViolation(
                killerAccountId,
                "Unknown",
                killCheck.type,
                7,
                { distance, headshot, ...killCheck },
                null
            );
            
            log.anticheat(`Suspicious kill detected: ${killerAccountId} - ${killCheck.type}`);
        }

        // Award V-Bucks and XP for kill
        const profile = await Profile.findOne({ accountId: killerAccountId });
        
        if (profile && profile.profiles.common_core && profile.profiles.athena) {
            // Award V-Bucks
            const commonCore = profile.profiles.common_core;
            const currentVBucks = commonCore.items.Currency?.MtxPurchased?.quantity || 0;
            
            if (!commonCore.items.Currency) {
                commonCore.items.Currency = {};
            }
            if (!commonCore.items.Currency.MtxPurchased) {
                commonCore.items.Currency.MtxPurchased = {
                    templateId: "Currency:MtxPurchased",
                    attributes: {
                        platform: "Shared"
                    },
                    quantity: 0
                };
            }
            
            commonCore.items.Currency.MtxPurchased.quantity = currentVBucks + REWARDS.KILL;
            commonCore.rvn += 1;
            commonCore.commandRevision += 1;
            commonCore.updated = new Date().toISOString();

            // Award XP using battle pass system
            const xpResult = await battlepass.awardXP(killerAccountId, REWARDS.XP_PER_KILL, profile);
            const newLevel = xpResult.newLevel || 1;

            // Save common_core for V-Bucks
            await profile.updateOne({
                $set: {
                    "profiles.common_core": commonCore
                }
            });

            log.backend(`Kill reward: ${killerAccountId} earned ${REWARDS.KILL} V-Bucks and ${REWARDS.XP_PER_KILL} XP`);

            return res.json({
                success: true,
                rewards: {
                    vbucks: REWARDS.KILL,
                    xp: REWARDS.XP_PER_KILL,
                    newLevel: newLevel
                }
            });
        }

        res.json({ success: true, message: "Kill recorded" });

    } catch (error) {
        log.error(`Error processing kill: ${error.message}`);
        res.status(500).json({ error: "Internal server error" });
    }
});

/**
 * Report match win - awards V-Bucks and XP
 * POST /api/game/win
 * Body: { accountId, placement, eliminations }
 */
app.post("/api/game/win", async (req, res) => {
    try {
        const { accountId, placement, eliminations } = req.body;

        if (!accountId) {
            return res.status(400).json({ error: "accountId is required" });
        }

        // Check for ban
        const ban = await anticheatSystem.isPlayerBanned(accountId);
        if (ban) {
            return res.status(403).json({ error: "Player is banned" });
        }

        const profile = await Profile.findOne({ accountId });
        
        if (profile && profile.profiles.common_core && profile.profiles.athena) {
            const commonCore = profile.profiles.common_core;
            const athena = profile.profiles.athena;

            // Award V-Bucks for win
            const currentVBucks = commonCore.items.Currency?.MtxPurchased?.quantity || 0;
            
            if (!commonCore.items.Currency) {
                commonCore.items.Currency = {};
            }
            if (!commonCore.items.Currency.MtxPurchased) {
                commonCore.items.Currency.MtxPurchased = {
                    templateId: "Currency:MtxPurchased",
                    attributes: {
                        platform: "Shared"
                    },
                    quantity: 0
                };
            }
            
            commonCore.items.Currency.MtxPurchased.quantity = currentVBucks + REWARDS.WIN;
            commonCore.rvn += 1;
            commonCore.commandRevision += 1;
            commonCore.updated = new Date().toISOString();

            // Award XP using battle pass system
            const xpResult = await battlepass.awardXP(accountId, REWARDS.XP_PER_WIN, profile);
            const newLevel = xpResult.newLevel || 1;
            
            // Update stats
            if (!athena.stats.attributes.lifetime_wins) {
                athena.stats.attributes.lifetime_wins = 0;
            }
            athena.stats.attributes.lifetime_wins += 1;

            // Save profiles
            await profile.updateOne({
                $set: {
                    "profiles.common_core": commonCore,
                    "profiles.athena": athena
                }
            });

            log.backend(`Win reward: ${accountId} earned ${REWARDS.WIN} V-Bucks and ${REWARDS.XP_PER_WIN} XP (Level ${newLevel})`);

            return res.json({
                success: true,
                rewards: {
                    vbucks: REWARDS.WIN,
                    xp: REWARDS.XP_PER_WIN,
                    newLevel: newLevel,
                    totalWins: athena.stats.attributes.lifetime_wins
                }
            });
        }

        res.json({ success: true, message: "Win recorded" });

    } catch (error) {
        log.error(`Error processing win: ${error.message}`);
        res.status(500).json({ error: "Internal server error" });
    }
});

/**
 * Report player movement for anticheat
 * POST /api/game/movement
 * Body: { accountId, position: {x, y, z}, velocity: {x, y, z} }
 */
app.post("/api/game/movement", async (req, res) => {
    try {
        const { accountId, position, velocity } = req.body;

        if (!accountId || !position) {
            return res.status(400).json({ error: "accountId and position are required" });
        }

        const movementCheck = anticheatSystem.trackMovement(
            accountId,
            position,
            velocity || { x: 0, y: 0, z: 0 },
            Date.now()
        );

        if (movementCheck.suspicious) {
            const user = await User.findOne({ accountId });
            
            await anticheatSystem.logViolation(
                accountId,
                user?.username || "Unknown",
                movementCheck.type,
                8,
                { position, velocity, ...movementCheck },
                null
            );
            
            log.anticheat(`Suspicious movement detected: ${accountId} - ${movementCheck.type}`);
            
            return res.json({ 
                success: true, 
                warning: "Suspicious movement detected",
                kicked: movementCheck.type === "teleport" 
            });
        }

        res.json({ success: true });

    } catch (error) {
        log.error(`Error processing movement: ${error.message}`);
        res.status(500).json({ error: "Internal server error" });
    }
});

/**
 * Award XP directly
 * POST /api/game/xp
 * Body: { accountId, xp }
 */
app.post("/api/game/xp", async (req, res) => {
    try {
        const { accountId, xp } = req.body;

        if (!accountId || !xp) {
            return res.status(400).json({ error: "accountId and xp are required" });
        }

        const profile = await Profile.findOne({ accountId });
        
        if (profile && profile.profiles.athena) {
            // Award XP using battle pass system
            const result = await battlepass.awardXP(accountId, xp, profile);
            
            if (result.success) {
                return res.json({
                    success: true,
                    xp: result.newXP,
                    level: result.newLevel,
                    leveledUp: result.leveledUp
                });
            }
        }

        res.status(404).json({ error: "Profile not found" });

    } catch (error) {
        log.error(`Error awarding XP: ${error.message}`);
        res.status(500).json({ error: "Internal server error" });
    }
});

module.exports = app;

