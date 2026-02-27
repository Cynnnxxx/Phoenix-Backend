const functions = require("../structs/functions.js");
const net = require("net");
const fs = require("fs");
const User = require("../model/user.js");
const Bans = require("../model/bans.js");
const log = require("../structs/log.js");

// NOTE: matchmaker runs inside the XMPP websocket server (see `xmpp/xmpp.js`).
// We keep an in-memory sessions store so queued players can remain in-lobby while the game server is restarting.
function getConfig() {
    try {
        return JSON.parse(fs.readFileSync("./Config/config.json").toString());
    } catch {
        return {};
    }
}

function getGamesessionsStore() {
    if (!global.gameSessions) global.gameSessions = new Map();
    if (!global.gameSessionsByAccountId) global.gameSessionsByAccountId = new Map();
    return {
        bySessionId: global.gameSessions,
        byAccountId: global.gameSessionsByAccountId
    };
}

async function tcpPing(host, port, timeoutMs = 750) {
    return await new Promise((resolve) => {
        const socket = new net.Socket();
        let done = false;

        const finish = (ok) => {
            if (done) return;
            done = true;
            try { socket.destroy(); } catch {}
            resolve(ok);
        };

        socket.setTimeout(timeoutMs);
        socket.once("connect", () => finish(true));
        socket.once("timeout", () => finish(false));
        socket.once("error", () => finish(false));
        socket.connect(port, host);
    });
}

function parseGameServerEntry(entry) {
    // format: ip:port:playlist
    if (typeof entry !== "string") return null;
    const parts = entry.split(":");
    if (parts.length < 2) return null;
    const ip = parts[0];
    const port = Number(parts[1]);
    const playlist = parts.slice(2).join(":") || null;
    if (!ip || !Number.isFinite(port)) return null;
    return { ip, port, playlist };
}

async function resolveAccountIdFromMatchmakingId(matchmakingId) {
    if (!matchmakingId || typeof matchmakingId !== "string") return null;
    try {
        const user = await User.findOne({ matchmakingId }).lean();
        return user?.accountId || null;
    } catch {
        return null;
    }
}

async function getTargetServerForAccount(accountId) {
    const config = getConfig();
    const gameServers = Array.isArray(config.gameServerIP) ? config.gameServerIP : [];

    // If we know the player's selected playlist, try to choose a matching server.
    let playlist = null;
    try {
        if (global.kv && accountId) {
            playlist = await global.kv.get(`playerPlaylist:${accountId}`);
        }
    } catch {}

    let selected = null;
    if (playlist) selected = gameServers.find(s => (s.split(":")[2] || "").toLowerCase() === String(playlist).toLowerCase());
    if (!selected) selected = gameServers[0];

    const parsed = parseGameServerEntry(selected);
    if (!parsed) return null;

    return { ...parsed, playlist: playlist || parsed.playlist };
}

function safeSend(ws, payload) {
    try {
        if (ws.readyState === 1) ws.send(JSON.stringify(payload));
    } catch {}
}

module.exports = async (ws, req) => {
    const { bySessionId, byAccountId } = getGamesessionsStore();

    // create hashes
    const ticketId = functions.MakeID().replace(/-/ig, "");
    const matchId = functions.MakeID().replace(/-/ig, "");
    const sessionId = functions.MakeID().replace(/-/ig, "");

    // Try to resolve the player for this websocket so we can expose `/gamesessions` info.
    let matchmakingId = null;
    let accountId = null;
    let isBanned = false;

    // Some clients send their payload as the first websocket message; we opportunistically parse it.
    ws.once("message", async (message) => {
        try {
            if (Buffer.isBuffer(message)) message = message.toString();
            const parsed = JSON.parse(message);
            const maybe = typeof parsed === "object" && parsed ? (parsed.payload || parsed.ticketId || parsed.accountId) : null;
            if (typeof maybe === "string") matchmakingId = maybe;
        } catch {}

        // Resolve accountId from matchmakingId (best-effort).
        if (!accountId && matchmakingId) accountId = await resolveAccountIdFromMatchmakingId(matchmakingId);
    });

    ws.on("close", () => {
        try {
            bySessionId.delete(sessionId);
            if (accountId) byAccountId.delete(accountId);
        } catch {}
    });

    // Seed gamesession immediately so the API can show "queued" even while waiting for server uptime.
    const baseSession = {
        id: sessionId,
        matchId,
        ticketId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        state: "Connecting",
        accountId: null,
        matchmakingId: null,
        playlist: null,
        serverAddress: null,
        serverPort: null
    };
    bySessionId.set(sessionId, baseSession);

    function updateSession(patch) {
        const existing = bySessionId.get(sessionId) || {};
        const next = { ...existing, ...patch, updatedAt: new Date().toISOString() };
        bySessionId.set(sessionId, next);
        if (next.accountId) byAccountId.set(next.accountId, sessionId);
        return next;
    }

    Connecting();
    await functions.sleep(250);
    Waiting();
    await functions.sleep(250);

    const config = getConfig();
    const pollMs = Number(config.matchmakerQueuePollMs) || 1000; // requested: 1 sec wait
    const maxRetries = Number(config.matchmakerMaxRetries) || 5; // Max retries before skipping ping check
    const skipPingCheck = config.matchmakerSkipPingCheck !== false; // Skip ping check after retries

    let retryCount = 0;
    let target = null;

    // Keep the client queued until the target game server is reachable.
    // This prevents lobby drops while the game server is restarting.
    while (ws.readyState === 1) {
        // If the user payload arrived a bit later, update the store.
        if (!accountId && matchmakingId) {
            accountId = await resolveAccountIdFromMatchmakingId(matchmakingId);
        }

        // Check if player is banned from matchmaking
        if (accountId && !isBanned) {
            const ban = await Bans.findOne({
                accountId,
                banType: { $in: ["matchmaking", "permanent"] },
                isActive: true,
                $or: [
                    { expiresAt: null },
                    { expiresAt: { $gt: new Date() } }
                ]
            });

            if (ban) {
                isBanned = true;
                log.anticheat(`Banned player ${accountId} attempted to join matchmaking`);
                
                // Send ban notification
                safeSend(ws, {
                    payload: {
                        state: "Error",
                        message: `You are banned from matchmaking. Reason: ${ban.reason}`,
                        expiresAt: ban.expiresAt ? ban.expiresAt.toISOString() : "Permanent"
                    },
                    name: "Error"
                });
                
                ws.close();
                return;
            }
        }

        // Get target server
        if (!target) {
            target = await getTargetServerForAccount(accountId);
        }

        // If no target server configured, skip ping check and proceed
        if (!target) {
            log.debug(`[Matchmaker] No target server configured, proceeding anyway`);
            break;
        }

        updateSession({
            state: "Queued",
            accountId: accountId || null,
            matchmakingId: matchmakingId || null,
            playlist: target?.playlist || null,
            serverAddress: target?.ip || null,
            serverPort: target?.port || null
        });

        Queued(1);

        // If we know where to connect, check if the game server is up.
        if (target?.ip && target?.port) {
            const ok = await tcpPing(target.ip, target.port, Math.min(750, pollMs));
            if (ok) {
                log.debug(`[Matchmaker] Game server ${target.ip}:${target.port} is reachable, proceeding`);
                break;
            }
            
            retryCount++;
            log.debug(`[Matchmaker] Game server ${target.ip}:${target.port} not reachable (attempt ${retryCount}/${maxRetries})`);
            
            // Skip ping check after max retries if enabled
            if (retryCount >= maxRetries && skipPingCheck) {
                log.debug(`[Matchmaker] Max retries reached (${maxRetries}), skipping ping check and proceeding`);
                break;
            }
        } else {
            // No valid IP/port, proceed anyway
            log.debug(`[Matchmaker] No valid server IP/port configured, proceeding anyway`);
            break;
        }

        await functions.sleep(pollMs);
    }

    if (ws.readyState !== 1) return;

    updateSession({ state: "SessionAssignment", accountId: accountId || null, matchmakingId: matchmakingId || null });
    SessionAssignment();
    await functions.sleep(500);

    updateSession({ state: "Play", accountId: accountId || null, matchmakingId: matchmakingId || null });
    Join();

    function Connecting() {
        updateSession({ state: "Connecting" });
        safeSend(ws, {
            payload: { state: "Connecting" },
            name: "StatusUpdate"
        });
    }

    function Waiting() {
        updateSession({ state: "Waiting" });
        safeSend(ws, {
            payload: { totalPlayers: 1, connectedPlayers: 1, state: "Waiting" },
            name: "StatusUpdate"
        });
    }

    function Queued(estimatedWaitSec = 1) {
        safeSend(ws, {
            payload: {
                ticketId,
                queuedPlayers: 1,
                estimatedWaitSec,
                status: {},
                state: "Queued"
            },
            name: "StatusUpdate"
        });
    }

    function SessionAssignment() {
        safeSend(ws, {
            payload: { matchId, state: "SessionAssignment" },
            name: "StatusUpdate"
        });
    }

    function Join() {
        safeSend(ws, {
            payload: { matchId, sessionId, joinDelaySec: 1 },
            name: "Play"
        });
    }
};