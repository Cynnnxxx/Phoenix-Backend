const anticheatSystem = require("../structs/anticheat.js");
const Bans = require("../model/bans.js");
const log = require("../structs/log.js");

/**
 * Middleware to check if player is banned before allowing game actions
 */
async function checkBan(req, res, next) {
    try {
        const accountId = req.user?.accountId || req.params?.accountId || req.body?.accountId;
        
        if (!accountId) {
            return next();
        }

        // Check for active bans
        const ban = await Bans.findOne({
            accountId,
            isActive: true,
            $or: [
                { expiresAt: null },
                { expiresAt: { $gt: new Date() } }
            ]
        });

        if (ban) {
            log.anticheat(`Banned player ${accountId} attempted to access: ${req.path}`);
            
            return res.status(403).json({
                error: "Player is banned",
                banType: ban.banType,
                reason: ban.reason,
                expiresAt: ban.expiresAt ? ban.expiresAt.toISOString() : "Permanent",
                bannedAt: ban.bannedAt.toISOString()
            });
        }

        next();
    } catch (err) {
        log.error(`Error in ban check middleware: ${err.message}`);
        next();
    }
}

/**
 * Middleware to check if player is banned from matchmaking
 */
async function checkMatchmakingBan(req, res, next) {
    try {
        const accountId = req.user?.accountId || req.params?.accountId || req.body?.accountId;
        
        if (!accountId) {
            return next();
        }

        const ban = await anticheatSystem.isPlayerBanned(accountId, "matchmaking");
        
        if (ban) {
            log.anticheat(`Player ${accountId} with matchmaking ban attempted to queue`);
            
            return res.status(403).json({
                error: "You are banned from matchmaking",
                reason: ban.reason,
                expiresAt: ban.expiresAt ? ban.expiresAt.toISOString() : "Permanent"
            });
        }

        next();
    } catch (err) {
        log.error(`Error in matchmaking ban check: ${err.message}`);
        next();
    }
}

/**
 * Middleware to check if player is banned from competitive
 */
async function checkCompetitiveBan(req, res, next) {
    try {
        const accountId = req.user?.accountId || req.params?.accountId || req.body?.accountId;
        
        if (!accountId) {
            return next();
        }

        // Check if the playlist is competitive/arena
        const bucketId = req.query?.bucketId || "";
        const isCompetitive = bucketId.toLowerCase().includes("showdown") || 
                             bucketId.toLowerCase().includes("arena") ||
                             bucketId.toLowerCase().includes("tournament");

        if (isCompetitive) {
            const ban = await anticheatSystem.isPlayerBanned(accountId, "competitive");
            
            if (ban) {
                log.anticheat(`Player ${accountId} with competitive ban attempted to join arena`);
                
                return res.status(403).json({
                    error: "You are banned from competitive modes",
                    reason: ban.reason,
                    expiresAt: ban.expiresAt ? ban.expiresAt.toISOString() : "Permanent"
                });
            }
        }

        next();
    } catch (err) {
        log.error(`Error in competitive ban check: ${err.message}`);
        next();
    }
}

module.exports = {
    checkBan,
    checkMatchmakingBan,
    checkCompetitiveBan
};

