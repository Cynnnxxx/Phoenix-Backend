const jwt = require("jsonwebtoken");
const User = require("../model/user.js");
const LauncherSessionsManager = require("./Classes/LauncherSessionsManager.js");
const CacheManager = require("./CacheManager.js");
const IncomingWebSocketMessage = require("./Classes/Message/IncomingWebSocketMessage.js");
const functions = require("../structs/functions.js");
const log = require("../structs/log.js");
const fs = require("fs");
const net = require("net");

// Lightweight TCP ping helper used only to detect
// whether a configured game server process is online.
async function tcpPing(host, port, timeoutMs = 750) {
  return await new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;

    const finish = (ok) => {
      if (done) return;
      done = true;
      try {
        socket.destroy();
      } catch {}
      resolve(ok);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(port, host);
  });
}

class MessageHandler {
  constructor(connectionManager) {
    this.connectionManager = connectionManager;
    this.cache = new CacheManager();
  }

  async handleMessage(socket, message) {
    const socketId = socket._socketId || socket.id || "unknown";

    if (
      !message ||
      typeof message !== "string" ||
      message.length > 1024 * 1024
    ) {
      await this.sendError(socketId, "Invalid message");
      return;
    }

    try {
      const msgData = JSON.parse(message);
      const msg = new IncomingWebSocketMessage(msgData);

      if (!msg.type) {
        await this.sendError(socketId, "Invalid format");
        return;
      }

      const { success, session } =
        await LauncherSessionsManager.tryGetLauncherSession(socketId);
      if (!success || !session) {
        await this.sendError(socketId, "Session not found");
        return;
      }

      await Promise.race([
        this.processMessage(socket, session, msg),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Timeout")), 30000)
        ),
      ]);
    } catch (ex) {
      log.error(`Message error from ${socketId}: ${ex}`);
      await this.sendError(socketId, "Processing failed");
    }
  }

  async processMessage(socket, client, msg) {
    const socketId = socket._socketId || socket.id || "unknown";
    const type = msg.type.toLowerCase();

    switch (type) {
      case "ping":
        await this.sendResponse(socketId, "pong", null, msg.messageId);
        break;
      case "request_user":
        await this.handleUserRequest(socket, client, msg);
        break;
      case "request_storefront":
        await this.handleStorefrontRequest(socket, client, msg);
        break;
      case "request_leaderboard":
        await this.handleLeaderboardRequest(socket, client, msg);
        break;
      case "request_servers":
        await this.handleServersRequest(socket, client, msg);
        break;
      case "subscribe_servers":
        await this.handleServerSubscription(socket, client, msg);
        break;
      case "unsubscribe_servers":
        await this.handleServerUnsubscription(socket, client, msg);
        break;
      default:
        await this.sendError(
          socketId,
          `Unknown type: ${msg.type}`,
          msg.messageId
        );
        break;
    }
  }

  async handleUserRequest(socket, client, msg) {
    const socketId = socket._socketId || socket.id || "unknown";

    if (!client.token) {
      await this.sendError(socketId, "No token", msg.messageId);
      return;
    }

    try {
      const tokenWithoutPrefix = client.token.replace("eg1~", "");
      const decodedToken = jwt.decode(tokenWithoutPrefix);

      if (!decodedToken) {
        await this.sendError(socketId, "Invalid token", msg.messageId);
        return;
      }

      const accountId = decodedToken.sub || decodedToken.accountId;
      const user = await User.findOne({ accountId });

      if (!user) {
        await this.sendError(socketId, "User not found", msg.messageId);
        return;
      }

      if (client.protocol === "launcher") {
        client.accountId = accountId;
        client.secret = decodedToken.secret || client.secret;
        client.displayName =
          decodedToken.dn ||
          decodedToken.displayName ||
          user.username ||
          "Unknown";
        client.isAuthenticated = true;
        await LauncherSessionsManager.updateLauncherSession(client, socket);
      }

      const discordInfo =
        typeof decodedToken.discord === "string"
          ? JSON.parse(decodedToken.discord)
          : decodedToken.discord || {};

      const profileInfo =
        typeof decodedToken.profile === "string"
          ? JSON.parse(decodedToken.profile)
          : decodedToken.profile || {};

      const userPayload = {
        token: {
          id: decodedToken.sub || decodedToken.accountId || decodedToken.id,
          discord: {
            id: discordInfo.id || user.discordId || "",
            username: discordInfo.username || user.username || "",
            displayName: discordInfo.displayName || user.username || "",
            avatarUrl: discordInfo.avatarUrl || user.avatar || "",
            isDonator: discordInfo.isDonator || false,
          },
          roles: {
            list: [],
          },
          profile: {
            athena: profileInfo.athena || {
              favoriteCharacterId: "cid_001_athena_commando_f_default",
              season: {
                level: 1,
                xp: 0,
                battlePass: {
                  purchased: false,
                  level: 1,
                  xp: 0,
                },
              },
              hype: 0,
            },
            common_core: profileInfo.common_core || {
              vbucks: 0,
            },
            stats: profileInfo.stats || {},
          },
          hellowelcometocrystalfortnite:
            decodedToken.hellowelcometocrystalfortnite ||
            decodedToken.secret ||
            "",
        },
      };

      await this.sendResponse(socketId, "user", userPayload, msg.messageId);
    } catch (ex) {
      log.error(`Error handling user request: ${ex.message}`);
      await this.sendError(socketId, "User request failed", msg.messageId);
    }
  }

  async handleStorefrontRequest(socket, client, msg) {
    const socketId = socket._socketId || socket.id || "unknown";

    if (!(await this.validateAuth(socketId, client, msg.messageId))) return;

    try {
      const catalog = functions.getItemShop();

      const dailyStorefront = catalog.storefronts.find(
        (s) => s.name === "BRDailyStorefront"
      );
      const featuredStorefront = catalog.storefronts.find(
        (s) => s.name === "BRWeeklyStorefront"
      );

      const daily = dailyStorefront ? dailyStorefront.catalogEntries : [];
      const featured = featuredStorefront
        ? featuredStorefront.catalogEntries
        : [];

      const extractItems = (entries) => {
        return entries
          .filter((entry) => {
            if (
              !entry ||
              !entry.itemGrants ||
              !Array.isArray(entry.itemGrants) ||
              entry.itemGrants.length === 0
            ) {
              return false;
            }
            const firstGrant = entry.itemGrants[0];
            if (!firstGrant || !firstGrant.templateId) {
              return false;
            }
            return true;
          })
          .map((entry) => {
            const price =
              entry.prices &&
              Array.isArray(entry.prices) &&
              entry.prices.length > 0
                ? entry.prices[0].finalPrice ??
                  entry.prices[0].regularPrice ??
                  0
                : 0;

            const templateId =
              entry.itemGrants && entry.itemGrants.length > 0
                ? entry.itemGrants[0].templateId
                : "Unknown";

            return {
              Id: templateId,
              Price: price,
            };
          });
      };

      const dailyItems = extractItems(daily);
      const featuredItems = extractItems(featured);

      await this.sendResponse(
        socketId,
        "storefront",
        { Daily: dailyItems, Featured: featuredItems },
        msg.messageId
      );
    } catch (ex) {
      log.error(`Error handling storefront request: ${ex.message}`);
      await this.sendError(
        socketId,
        "Storefront request failed",
        msg.messageId
      );
    }
  }

  async handleLeaderboardRequest(socket, client, msg) {
    const socketId = socket._socketId || socket.id || "unknown";

    if (!(await this.validateAuth(socketId, client, msg.messageId))) return;

    try {
      const leaderboard = await this.cache.getLeaderboard();
      if (!leaderboard || leaderboard.length === 0) {
        await this.sendError(socketId, "No leaderboard data", msg.messageId);
        return;
      }

      const payload = {
        data: leaderboard,
        lastUpdated: Date.now(),
        totalEntries: leaderboard.length,
      };

      await this.sendResponse(socketId, "leaderboard", payload, msg.messageId);
    } catch (ex) {
      log.error(`Error handling leaderboard request: ${ex.message}`);
      await this.sendError(
        socketId,
        "Leaderboard request failed",
        msg.messageId
      );
    }
  }

  async handleServersRequest(socket, client, msg) {
    const socketId = socket._socketId || socket.id || "unknown";

    try {
      const parseGameServerEntry = (entry) => {
        if (typeof entry !== "string") return null;
        const parts = entry.split(":");
        if (parts.length < 2) return null;
        const ip = parts[0];
        const port = Number(parts[1]);
        const playlist = parts.slice(2).join(":") || "";
        if (!ip || !Number.isFinite(port)) return null;
        return { ip, port, playlist };
      };

      let config = {};
      try {
        config = JSON.parse(fs.readFileSync("./Config/config.json").toString());
      } catch {}

      const configuredServers = Array.isArray(config.gameServerIP)
        ? config.gameServerIP
        : [];

      // 1) Build groups from live matchmaking sessions (if any)
      const serverGroups = new Map();
      if (global.gameSessions) {
        for (const [sessionId, session] of global.gameSessions.entries()) {
          if (
            session &&
            session.serverAddress &&
            session.serverPort &&
            session.playlist
          ) {
            const validState =
              session.state === "Play" ||
              session.state === "Queued" ||
              session.state === "SessionAssignment" ||
              session.state === "Connecting" ||
              session.state === "Waiting";
            if (!validState) continue;

            const serverKey = `${session.serverAddress}:${session.serverPort}:${session.playlist}`;
            if (!serverGroups.has(serverKey)) {
              serverGroups.set(serverKey, {
                serverAddress: session.serverAddress,
                serverPort: Number(session.serverPort),
                playlist: session.playlist,
                players: 0,
                sessionIds: [],
                started: false,
              });
            }

            const group = serverGroups.get(serverKey);
            group.sessionIds.push(sessionId);
            group.started = group.started || session.state === "Play";

            // Prefer explicit player counts if present; otherwise count sessions
            const explicitPlayers =
              Number(session.players) ||
              Number(session.totalPlayers) ||
              Number(session.playerCount) ||
              0;
            group.players = Math.max(group.players, explicitPlayers);
            if (explicitPlayers <= 0) {
              group.players += 1;
            }
          }
        }
      }

      // 2) Add configured servers so they show even without active sessions.
      const parsedConfigured = configuredServers
        .map(parseGameServerEntry)
        .filter(Boolean);

      for (const s of parsedConfigured) {
        const key = `${s.ip}:${s.port}:${s.playlist || ""}`;
        if (!serverGroups.has(key)) {
          serverGroups.set(key, {
            serverAddress: s.ip,
            serverPort: s.port,
            playlist: s.playlist || "",
            players: 0,
            sessionIds: [],
            started: false,
          });
        }
      }

      // 3) Probe configured servers to see which processes are actually online.
      //    We *always* include configured servers in the payload; ping only
      //    influences the "Started" flag (so servers no longer disappear
      //    completely if a ping fails).
      const serverEntries = Array.from(serverGroups.entries());
      const pingResults = await Promise.all(
        serverEntries.map(([, group]) =>
          group.serverAddress && group.serverPort
            ? tcpPing(group.serverAddress, group.serverPort, 750).catch(
                () => false
              )
            : Promise.resolve(false)
        )
      );

      // 4) Convert to launcher payload
      const sessions = [];
      for (let idx = 0; idx < serverEntries.length; idx++) {
        const [, group] = serverEntries[idx];
        const pingOk = pingResults[idx] === true;

        sessions.push({
          Players: Math.max(0, Number(group.players) || 0),
          SessionId:
            group.sessionIds[0] ||
            `${group.serverAddress}:${group.serverPort}:${group.playlist}`,
          Playlist: group.playlist || "",
          CapPlayers: 50,
          // Treat the server as "started" if either there is an active
          // matchmaking session in Play state, *or* the TCP port is reachable.
          Started: Boolean(group.started || pingOk),
          Region: "",
          Version: "",
        });
      }

      sessions.sort((a, b) => b.Players - a.Players);

      await this.sendResponse(
        socketId,
        "servers",
        { data: sessions },
        msg.messageId
      );
    } catch (ex) {
      log.error(`Error handling servers request: ${ex.message}`);
      await this.sendResponse(socketId, "servers", { data: [] }, msg.messageId);
    }
  }

  async handleServerSubscription(socket, client, msg) {
    const socketId = socket._socketId || socket.id || "unknown";

    if (!(await this.validateAuth(socketId, client, msg.messageId))) return;

    try {
      client.subscribedToServers = true;
      await LauncherSessionsManager.updateLauncherSession(client, socket);

      await this.sendResponse(
        socketId,
        "servers_subscribed",
        { subscribed: true },
        msg.messageId
      );
      log.backend(`Client ${socketId} subscribed to server updates`);
    } catch (ex) {
      log.error(`Error subscribing to servers: ${ex.message}`);
      await this.sendError(socketId, "Subscription failed", msg.messageId);
    }
  }

  async handleServerUnsubscription(socket, client, msg) {
    const socketId = socket._socketId || socket.id || "unknown";

    if (!(await this.validateAuth(socketId, client, msg.messageId))) return;

    try {
      client.subscribedToServers = false;
      await LauncherSessionsManager.updateLauncherSession(client, socket);

      await this.sendResponse(
        socketId,
        "servers_unsubscribed",
        { subscribed: false },
        msg.messageId
      );
      log.backend(`Client ${socketId} unsubscribed from server updates`);
    } catch (ex) {
      log.error(`Error unsubscribing from servers: ${ex.message}`);
      await this.sendError(socketId, "Unsubscription failed", msg.messageId);
    }
  }

  async validateAuth(connectionId, client, messageId) {
    if (!client.token) {
      await this.sendError(connectionId, "No token", messageId);
      return false;
    }

    try {
      const tokenWithoutPrefix = client.token.replace("eg1~", "");
      const decodedToken = jwt.decode(tokenWithoutPrefix);

      if (!decodedToken) {
        await this.sendError(connectionId, "Invalid token", messageId);
        return false;
      }

      const accountId = decodedToken.sub || decodedToken.accountId;
      const user = await User.findOne({ accountId });

      if (!user) {
        await this.sendError(connectionId, "User not found", messageId);
        return false;
      }

      return true;
    } catch (ex) {
      await this.sendError(connectionId, "Validation failed", messageId);
      return false;
    }
  }

  async sendResponse(connectionId, type, payload, messageId) {
    const response = {
      type,
      timestamp: Date.now(),
      payload,
      id: messageId,
    };

    await this.connectionManager.sendToClient(
      connectionId,
      JSON.stringify(response)
    );
  }

  async sendError(connectionId, message, messageId = null) {
    const error = {
      type: "error",
      message,
      timestamp: Date.now(),
      id: messageId,
    };

    await this.connectionManager.sendToClient(
      connectionId,
      JSON.stringify(error)
    );
  }
}

module.exports = MessageHandler;
