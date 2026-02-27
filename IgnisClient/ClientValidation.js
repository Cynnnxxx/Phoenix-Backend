const jwt = require("jsonwebtoken");
const log = require("../structs/log.js");
const LauncherSessionsManager = require("./Classes/LauncherSessionsManager.js");
const functions = require("../structs/functions.js");

class ClientValidation {
    static async validateTokenFromQuery(socket, url) {
        if (!socket || !url) {
            log.error("Socket or URL is null");
            return false;
        }

        const socketId = socket._socketId || socket.id || null;
        if (!socketId) {
            log.error("Socket ID is null");
            return false;
        }

        try {
            let token = null;
            try {
                const urlObj = new URL(url, "http://localhost");
                token = urlObj.searchParams.get("token");
            } catch (ex) {
                const queryStart = url.indexOf("?");
                if (queryStart >= 0 && queryStart < url.length - 1) {
                    const queryString = url.substring(queryStart + 1);
                    const params = new URLSearchParams(queryString);
                    token = params.get("token");
                }
            }

            if (!token) {
                log.error(`No token provided for client ${socketId}`);
                return false;
            }

            const tokenWithoutPrefix = token.replace("eg1~", "");
            let decodedToken;
            try {
                decodedToken = jwt.decode(tokenWithoutPrefix);
            } catch (ex) {
                log.error(`Invalid token format for client ${socketId}: ${ex.message}`);
                return false;
            }

            if (!decodedToken) {
                log.error(`Invalid token format for client ${socketId}`);
                return false;
            }

            const accountId = decodedToken.sub || decodedToken.accountId || null;
            if (!accountId) {
                log.error(`No account ID found in token for client ${socketId}`);
                return false;
            }

            let secret = decodedToken.secret || null;
            if (!secret && decodedToken.discord?.id) {
                secret = functions.MakeID();
            }

            if (!secret) {
                log.error(`Unable to generate or retrieve secret for client ${socketId}`);
                return false;
            }

            const existingLaunchers = await LauncherSessionsManager.listAllLauncherSessions();
            const existingLauncher = existingLaunchers.find(l => l && l.accountId === accountId);

            if (existingLauncher) {
                const oldSocket = global.socketConnections ? global.socketConnections.get(existingLauncher.socketId) : null;
                const oldSocketIsActive = oldSocket && oldSocket.readyState === 1 && oldSocket !== socket;
                
                const updateSession = {
                    socketId: socketId,
                    protocol: existingLauncher.protocol || "launcher",
                    token: token,
                    accountId: accountId,
                    secret: secret,
                    displayName: existingLauncher.displayName || decodedToken.displayName || decodedToken.discord?.displayName || null,
                    isAuthenticated: true,
                    subscribedToServers: existingLauncher.subscribedToServers || false,
                    connectedAt: existingLauncher.connectedAt || new Date()
                };

                try {
                    await LauncherSessionsManager.updateLauncherSession(updateSession, socket, oldSocketIsActive);
                } catch (ex) {
                    log.error(`Failed to update existing launcher session for account ${accountId}: ${ex.message}`);
                    return false;
                }
                return true;
            }

            const newLauncherSession = {
                socketId: socketId,
                protocol: "launcher",
                token: token,
                accountId: accountId,
                secret: secret,
                connectedAt: new Date()
            };

            try {
                await LauncherSessionsManager.addLauncherSession(newLauncherSession, socket);
                return true;
            } catch (ex) {
                log.error(`Failed to add new launcher session for account ${accountId}: ${ex.message}`);
                return false;
            }
        } catch (ex) {
            log.error(`Error validating token for client ${socketId}: ${ex}`);
            return false;
        }
    }
}

module.exports = ClientValidation;

