const express = require("express");
const app = express.Router();
const config = require("../Config/config.json");
const functions = require("../structs/functions.js");
const log = require("../structs/log.js");
const MMCode = require("../model/mmcodes.js");
const { verifyToken } = require("../tokenManager/tokenVerify.js");
const qs = require("qs");
const error = require("../structs/error.js");
const { checkMatchmakingBan, checkCompetitiveBan } = require("../middleware/anticheat.js");
const Tournament = require("../model/tournament.js");
const User = require("../model/user.js");

let buildUniqueId = {};

// Simple stub for findPlayer
app.get("/fortnite/api/matchmaking/session/findPlayer/*", (req, res) => {
    log.debug("GET /fortnite/api/matchmaking/session/findPlayer/* called");
    res.set("Content-Type", "application/json").status(200).json({});
});

// Ticket endpoint: simplified for solo mode (no party logic)
app.get("/fortnite/api/game/v2/matchmakingservice/ticket/player/*", verifyToken, checkMatchmakingBan, checkCompetitiveBan, async (req, res) => {
    log.debug("GET /fortnite/api/game/v2/matchmakingservice/ticket/player/* called");
    if (req.user.isServer == true) return res.status(403).end();
    if (req.user.matchmakingId == null) return res.status(400).end();

    const playerCustomKey = qs.parse(req.url.split("?")[1], { ignoreQueryPrefix: true })['player.option.customKey'];
    const bucketId = qs.parse(req.url.split("?")[1], { ignoreQueryPrefix: true })['bucketId'];
    if (typeof bucketId !== "string" || bucketId.split(":").length !== 4) {
        return res.status(400).end();
    }
    
    // Extract region from query parameters or bucketId
    let regionId = qs.parse(req.url.split("?")[1], { ignoreQueryPrefix: true })['player.option.region'] || 
                   qs.parse(req.url.split("?")[1], { ignoreQueryPrefix: true })['region'];
    
    // If not in query, try to extract from bucketId
    if (!regionId && bucketId.split(":").length >= 3) {
        const bucketParts = bucketId.split(":");
        regionId = bucketParts[2] || bucketParts[1];
    }
    
    // Normalize region ID
    if (regionId) {
        regionId = regionId.toUpperCase();
        if (regionId === "NA-EAST" || regionId === "NAE" || regionId === "NA" || regionId === "US") {
            regionId = "NAE";
        } else if (regionId === "EUROPE" || regionId === "EU" || regionId === "GB" || regionId === "DE") {
            regionId = "EU";
        } else if (regionId === "BRAZIL" || regionId === "BR" || regionId === "SA" || regionId === "BRA") {
            regionId = "BRA";
        } else {
            regionId = "EU";
        }
    } else {
        regionId = "EU";
    }
    
    const rawPlaylist = bucketId.split(":")[bucketId.split(":").length - 1];
    
    // Store the selected region for this user
    const User = require("../model/user.js");
    await User.updateOne(
        { accountId: req.user.accountId },
        { $set: { matchmakingRegion: regionId } }
    );
    await global.kv.set(`playerRegion:${req.user.accountId}`, regionId);
    log.debug(`Player ${req.user.accountId} selected region: ${regionId}`);
    
    let playlist = rawPlaylist.toLowerCase();
    if (playlist === "2") {
        playlist = "playlist_defaultsolo";
    } else if (playlist === "10") {
        playlist = "playlist_defaultduo";
    } else if (playlist === "9") {
        playlist = "playlist_defaultsquad";
    } else if (playlist === "50") {
        playlist = "playlist_50v50";
    } else if (playlist === "11") {
        playlist = "playlist_50v50";
    } else if (playlist === "13") {
        playlist = "playlist_highexplosives_squads";
    } else if (playlist === "22") {
        playlist = "playlist_5x20";
    } else if (playlist === "36") {
        playlist = "playlist_blitz_solo";
    } else if (playlist === "37") {
        playlist = "playlist_blitz_duos";
    } else if (playlist === "19") {
        playlist = "playlist_blitz_squad";
    } else if (playlist === "33") {
        playlist = "playlist_carmine";
    } else if (playlist === "32") {
        playlist = "playlist_fortnite";
    } else if (playlist === "23") {
        playlist = "playlist_showdowntournament_solo";
    } else if (playlist === "24") {
        playlist = "playlist_highexplosives_squads";
    } else if (playlist === "44") {
        playlist = "playlist_impact_solo";
    } else if (playlist === "45") {
        playlist = "playlist_impact_duos";
    } else if (playlist === "46") {
        playlist = "playlist_impact_squads";
    } else if (playlist === "35") {
        playlist = "playlist_playground";
    } else if (playlist === "30") {
        playlist = "playlist_skysupply";
    } else if (playlist === "42") {
        playlist = "playlist_skysupply_duos";
    } else if (playlist === "43") {
        playlist = "playlist_skysupply_squads";
    } else if (playlist === "41") {
        playlist = "playlist_snipers";
    } else if (playlist === "39") {
        playlist = "playlist_snipers_solo";
    } else if (playlist === "40") {
        playlist = "playlist_snipers_duos";
    } else if (playlist === "26") {
        playlist = "playlist_solidgold_solo";
    } else if (playlist === "27") {
        playlist = "playlist_solidgold_squads";
    } else if (playlist === "28") {
        playlist = "playlist_showdownalt_solo";
    } else if (playlist === "29") {
        playlist = "playlist_showdownalt_duos";
    } else if (/^arena_s17_division\d+_duos$/.test(playlist)) {
        // Lategame Arena Duos: event window id (e.g. ARENA_S17_Division1_Duos)
        playlist = "playlist_showdownalt_duos";
    } else if (/^arena_s17_division\d+$/.test(playlist)) {
        // Lategame Arena Solo: event window id (e.g. ARENA_S17_Division1)
        playlist = "playlist_showdownalt_solo";
    }

    const isDuosPlaylist = /duo/i.test(playlist);

    let matchmakerIP;
    if (regionId === "EU") {
        matchmakerIP = config.matchmakerIPEU || config.matchmakerIP;
        log.debug(`Using EU matchmaker: ${matchmakerIP}`);
    } else if (regionId === "NAE") {
        matchmakerIP = config.matchmakerIPNAE || config.matchmakerIP;
        log.debug(`Using NAE matchmaker: ${matchmakerIP}`);
    } else if (regionId === "BRA") {
        matchmakerIP = config.matchmakerIPBRA || config.matchmakerIP;
        log.debug(`Using BRA matchmaker: ${matchmakerIP}`);
    } else {
        matchmakerIP = config.matchmakerIP;
        log.debug(`Using default matchmaker: ${matchmakerIP}`);
    }
    
    // Get region-specific game servers
    const gameServers = config.gameServerIP;
    let selectedServer = gameServers.find(server => server.split(":")[2].toLowerCase() === playlist);
    
    if (!selectedServer) {
        log.debug("No server found for playlist", playlist);
        return error.createError("errors.com.epicgames.common.matchmaking.playlist.not_found", `No server found for playlist ${playlist}`, [], 1013, "invalid_playlist", 404, res);
    }
    
    await global.kv.set(`playerPlaylist:${req.user.accountId}`, playlist);

    // Party/duo: store party size and members when getting ticket so in-game shows duo
    const accountId = req.user.accountId;
    const party = global.parties && Object.values(global.parties).find(
      (p) => p && p.members && Array.isArray(p.members) && p.members.some((m) => m && m.account_id === accountId)
    );
    if (party && party.members && party.members.length >= 2) {
      const memberIds = party.members.map((m) => m.account_id);
      await global.kv.setTTL(`matchmakingPartySize:${accountId}`, String(party.members.length), 5 * 60 * 1000);
      await global.kv.setTTL(`matchmakingPartyMembers:${accountId}`, JSON.stringify(memberIds), 5 * 60 * 1000);
      log.debug(`[PARTY] Player ${accountId} in party of ${party.members.length} - stored for in-game duo display`);
    } else {
      await global.kv.setTTL(`matchmakingPartySize:${accountId}`, String(1), 5 * 60 * 1000);
    }

    // CRITICAL: Create tournament document when player enters tournament playlist
    // This ensures the document exists from the start, preventing issues with missing documents
    const isTournamentPlaylist = playlist === "playlist_showdowntournament_solo" || 
                                 playlist === "Playlist_ShowdownTournament_Solo" ||
                                 (playlist && typeof playlist === 'string' && playlist.toLowerCase().includes("showdowntournament")) ||
                                 (playlist && typeof playlist === 'string' && playlist.toLowerCase().includes("tournament"));
    
    if (isTournamentPlaylist) {
        try {
            console.log(`[Tournament Init] Player ${req.user.accountId} entering tournament playlist: "${playlist}"`);
            
            // Check if tournament document already exists
            const existingTournament = await Tournament.findOne({ accountId: req.user.accountId });
            
            if (!existingTournament) {
                // Get user data for username
                const user = await User.findOne({ accountId: req.user.accountId });
                const username = user ? user.username : "Unknown";
                
                // Create tournament document with default values
                await Tournament.create({
                    accountId: req.user.accountId,
                    username: username,
                    tournamentPoints: 0,
                    wins: 0,
                    eliminations: 0,
                    matchesPlayed: 0,
                    season: "Chapter 3 Season 1",
                    version: "19.10",
                    hasReceivedTopReward: false,
                    lastUpdated: new Date()
                });
                
                console.log(`[Tournament Init] ✅ Created tournament document for ${req.user.accountId} (${username})`);
            } else {
                console.log(`[Tournament Init] ℹ️  Tournament document already exists for ${req.user.accountId}`);
            }
        } catch (err) {
            // Don't fail matchmaking if tournament document creation fails
            console.error(`[Tournament Init] ❌ Error creating tournament document for ${req.user.accountId}:`, err);
        }
    }

    // Party/duo code removed: solo-only, so we don't set duoTeam keys or matchmaking party TTLs here.

    if (typeof playerCustomKey == "string") {
        let codeDocument = await MMCode.findOne({ code_lower: playerCustomKey?.toLowerCase() });
        if (!codeDocument) {
            return error.createError("errors.com.epicgames.common.matchmaking.code.not_found", `The matchmaking code "${playerCustomKey}" was not found`, [], 1013, "invalid_code", 404, res);
        }
        const kvDocument = JSON.stringify({
            ip: codeDocument.ip,
            port: codeDocument.port,
            playlist: playlist,
            region: regionId
        });
        await global.kv.set(`playerCustomKey:${req.user.accountId}`, kvDocument);
    }
    
    if (typeof req.query.bucketId !== "string" || req.query.bucketId.split(":").length !== 4) {
        return res.status(400).end();
    }

    buildUniqueId[req.user.accountId] = req.query.bucketId.split(":")[0];

    // Build a robust serviceUrl: ensure protocol present and default port 4444 if not provided
    let serviceUrl = matchmakerIP;
    // Add ws:// if no protocol present
    if (!/^wss?:\/\//i.test(serviceUrl)) {
        serviceUrl = `ws://${serviceUrl}`;
    }
    // If no explicit port (e.g., ws://host or ws://host/), append default 4444
    if (!/:\d+(\/|$)/.test(serviceUrl)) {
        // remove trailing slash if present, then add :4444
        serviceUrl = serviceUrl.replace(/\/+$/,'') + ":4444";
    }
    const mmId = `${req.user.matchmakingId}`;
    const sep = serviceUrl.includes("?") ? "&" : "?";
    const serviceUrlWithPayload = serviceUrl + sep + "payload=" + encodeURIComponent(mmId);

    console.log(`[MM] serviceUrl for player ${req.user.accountId}: ${serviceUrlWithPayload}`);
    console.log(`[MM] playlist=${playlist}, region=${regionId}, bucketId=${req.query.bucketId}, playerCustomKey=${playerCustomKey}`);

    return res.json({
        "serviceUrl": serviceUrlWithPayload,
        "ticketType": "mms-player",
        "payload": mmId,
        "signature": "account"
    });
});

app.get("/fortnite/api/game/v2/matchmaking/account/:accountId/session/:sessionId", (req, res) => {
    log.debug(`GET /fortnite/api/game/v2/matchmaking/account/${req.params.accountId}/session/${req.params.sessionId} called`);
    res.json({
        "accountId": req.params.accountId,
        "sessionId": req.params.sessionId,
        "key": "none"
    });
});

// Return real party size when player is in a party (so in-game shows duo/squad)
app.get("/fortnite/api/matchmaking/party-size", async (req, res) => {
    const matchmakingId = (req.query.matchmakingId || "").trim();
    if (!matchmakingId) {
        return res.json({ partySize: 1 });
    }
    try {
        const user = await User.findOne({ matchmakingId }).lean();
        const accountId = user?.accountId;
        if (!accountId) {
            return res.json({ partySize: 1 });
        }
        // Prefer stored party size from when they got the ticket
        const storedSize = await global.kv.get(`matchmakingPartySize:${accountId}`);
        if (storedSize) {
            const size = Math.max(1, parseInt(storedSize, 10) || 1);
            return res.json({ partySize: size });
        }
        // Fallback: look up current party from global.parties
        const party = global.parties && Object.values(global.parties).find(
            (p) => p && p.members && Array.isArray(p.members) && p.members.some((m) => m && m.account_id === accountId)
        );
        if (party && party.members && party.members.length >= 1) {
            await global.kv.setTTL(`matchmakingPartySize:${accountId}`, String(party.members.length), 5 * 60 * 1000);
            return res.json({ partySize: party.members.length });
        }
        return res.json({ partySize: 1 });
    } catch (e) {
        return res.json({ partySize: 1 });
    }
});

/** Game server duo/team lookup: return comma-separated display names of BOTH party members (e.g. "PlayerA,PlayerB").
 *  Game server expects exactly 2 names; otherwise it kicks the player (ServerReturnToMainMenu). Solos get "not found". */
app.get("/fortnite/api/matchmaking/session/team/:playerName", async (req, res) => {
    const playerName = decodeURIComponent(req.params.playerName || "").trim();
    if (!playerName) {
        res.set("Content-Type", "text/plain").send("not found");
        return;
    }
    try {
        const playerNameLower = playerName.toLowerCase();
        let user = await User.findOne({ username: playerName }).lean();
        if (!user) user = await User.findOne({ username_lower: playerNameLower }).lean();
        const accountId = user?.accountId;
        if (!accountId) {
            res.set("Content-Type", "text/plain").send("not found");
            return;
        }
        // Prefer stored party members from when they got the ticket (same session)
        let memberIds = null;
        const stored = await global.kv.get(`matchmakingPartyMembers:${accountId}`);
        if (stored) {
            try {
                memberIds = JSON.parse(stored);
            } catch (_) {}
        }
        // Fallback: current party from global.parties
        if (!memberIds || memberIds.length < 2) {
            const party = global.parties && Object.values(global.parties).find(
                (p) => p && p.members && Array.isArray(p.members) && p.members.some((m) => m && m.account_id === accountId)
            );
            if (party && party.members && party.members.length >= 2) {
                memberIds = party.members.map((m) => m.account_id);
            }
        }
        if (!memberIds || memberIds.length < 2) {
            res.set("Content-Type", "text/plain").send("not found");
            return;
        }
        // Duos only: cap to 2 members (no trios)
        if (memberIds.length > 2) {
            const idx = memberIds.indexOf(accountId);
            if (idx >= 0) {
                memberIds = [accountId, memberIds[idx === 0 ? 1 : 0]];
            } else {
                memberIds = memberIds.slice(0, 2);
            }
        }
        // Game server expects comma-separated list of BOTH members (size >= 2); otherwise it kicks. Return "Name1,Name2".
        const users = await User.find({ accountId: { $in: memberIds } }).lean();
        const idToName = new Map(users.map((u) => [u.accountId, u.username || u.accountId]));
        const names = memberIds.map((id) => idToName.get(id) || id);
        res.set("Content-Type", "text/plain").send(names.join(","));
    } catch (e) {
        log.debug("duo team lookup error: " + (e && e.message));
        res.set("Content-Type", "text/plain").send("not found");
    }
});

app.get("/fortnite/api/matchmaking/session/:sessionId", verifyToken, async (req, res) => {
    log.debug(`GET /fortnite/api/matchmaking/session/${req.params.sessionId} called`);
    try {
        const playlist = await global.kv.get(`playerPlaylist:${req.user.accountId}`);
        
        let playerRegion = await global.kv.get(`playerRegion:${req.user.accountId}`);
        if (!playerRegion) {
            const User = require("../model/user.js");
            const user = await User.findOne({ accountId: req.user.accountId });
            playerRegion = user?.matchmakingRegion || "EU";
            await global.kv.set(`playerRegion:${req.user.accountId}`, playerRegion);
        }
        
        const regionIPs = {
            "EU": "26.157.83.30",
            "NAE": "23.27.249.103",
            "BRA": "108.165.230.79" // IP do servidor do Brasil
        };
        const regionSubregions = { 
            "EU": "GB", 
            "NAE": "VA", 
            "BRA": "SP" 
        };
        const selectedIP = regionIPs[playerRegion] || regionIPs["EU"];
        const subRegion = regionSubregions[playerRegion] || regionSubregions["EU"];
        
        let kvDocument = await global.kv.get(`playerCustomKey:${req.user.accountId}`);
        if (!kvDocument) {
            const gameServers = config.gameServerIP;
            const pl = (playlist || "").toLowerCase();
            let selectedServer = gameServers.find(s => (String((s || "").split(":")[2] || "")).toLowerCase() === pl);
            if (!selectedServer) {
                console.warn(`[Matchmaking] No server found for playlist "${playlist}" – check gameServerIP in config`);
                return error.createError("errors.com.epicgames.common.matchmaking.playlist.not_found", `No server found for playlist ${playlist}`, [], 1013, "invalid_playlist", 404, res);
            }
            const serverPort = selectedServer.split(":")[1];
            kvDocument = JSON.stringify({
                ip: selectedIP,
                port: serverPort,
                playlist: playlist || (selectedServer.split(":")[2]),
                region: playerRegion
            });
        } else {
            const codeKV = JSON.parse(kvDocument);
            codeKV.ip = selectedIP;
            codeKV.region = playerRegion;
            kvDocument = JSON.stringify(codeKV);
        }
        
        const codeKV = JSON.parse(kvDocument);

        return res.json({
            "id": req.params.sessionId,
            "ownerId": functions.MakeID().replace(/-/ig, "").toUpperCase(),
            "ownerName": `[DS]fortnite-live${playerRegion.toLowerCase()}gcec1c2e30ubrcore0a-z8hj-1968`,
            "serverName": `[DS]fortnite-live${playerRegion.toLowerCase()}gcec1c2e30ubrcore0a-z8hj-1968`,
            "serverAddress": codeKV.ip,
            "serverPort": codeKV.port,
            "maxPublicPlayers": 220,
            "openPublicPlayers": 175,
            "maxPrivatePlayers": 0,
            "openPrivatePlayers": 0,
            "attributes": {
                "REGION_s": playerRegion,
                "GAMEMODE_s": "FORTATHENA",
                "ALLOWBROADCASTING_b": true,
                "SUBREGION_s": subRegion,
                "DCID_s": `FORTNITE-LIVE${playerRegion}GCEC1C2E30UBRCORE0A-14840880`,
                "tenant_s": "Fortnite",
                "MATCHMAKINGPOOL_s": "Any",
                "STORMSHIELDDEFENSETYPE_i": 0,
                "HOTFIXVERSION_i": 0,
                "PLAYLISTNAME_s": codeKV.playlist,
                "SESSIONKEY_s": functions.MakeID().replace(/-/ig, "").toUpperCase(),
                "TENANT_s": "Fortnite",
                "BEACONPORT_i": 15009
            },
            "publicPlayers": [],
            "privatePlayers": [],
            "totalPlayers": 45,
            "allowJoinInProgress": true,
            "shouldAdvertise": false,
            "isDedicated": false,
            "usesStats": false,
            "allowInvites": false,
            "usesPresence": false,
            "allowJoinViaPresence": true,
            "allowJoinViaPresenceFriendsOnly": false,
            "buildUniqueId": buildUniqueId[req.user.accountId] || "0",
            "lastUpdated": new Date().toISOString(),
            "started": false
        });
    } catch (err) {
        console.error("[Matchmaking] Session error:", err?.message || err);
        return error.createError(
            "errors.com.epicgames.common.server_error",
            "Session unavailable. Please try again.",
            [],
            500,
            "session_error",
            500,
            res
        );
    }
});

app.post("/fortnite/api/matchmaking/session/*/join", (req, res) => {
    log.debug("POST /fortnite/api/matchmaking/session/*/join called");
    res.status(204);
    res.end();
});

app.post("/fortnite/api/matchmaking/session/matchMakingRequest", (req, res) => {
    log.debug("POST /fortnite/api/matchmaking/session/matchMakingRequest called");
    res.json([]);
});

module.exports = app;