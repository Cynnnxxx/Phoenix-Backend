const log = require("../../structs/log.js");

function getLauncherSessions() {
  if (!global.launcherSessions) {
    global.launcherSessions = new Map();
  }
  return global.launcherSessions;
}

class LauncherSessionsManager {
  static async addLauncherSession(launcherSession, socket) {
    if (!socket) {
      throw new Error("Socket is required");
    }

    if (!launcherSession || !launcherSession.socketId) {
      throw new Error("LauncherSession and socketId are required");
    }

    try {
      const sessions = getLauncherSessions();

      if (launcherSession.accountId) {
        for (const [existingSocketId, existingSession] of sessions.entries()) {
          if (
            existingSession.accountId === launcherSession.accountId &&
            existingSocketId !== launcherSession.socketId
          ) {
            const oldSocket = global.socketConnections
              ? global.socketConnections.get(existingSocketId)
              : null;

            if (
              oldSocket &&
              oldSocket !== socket &&
              oldSocket.readyState === 1
            ) {
              log.backend(
                `Closing old socket ${existingSocketId} for account ${launcherSession.accountId} (new socket: ${launcherSession.socketId})`
              );
              try {
                oldSocket.close();
              } catch (ex) {
                log.error(`Error closing old socket: ${ex.message}`);
              }
              global.socketConnections.delete(existingSocketId);
              sessions.delete(existingSocketId);
            } else {
              sessions.delete(existingSocketId);
              if (oldSocket && global.socketConnections) {
                global.socketConnections.delete(existingSocketId);
              }
            }
          }
        }
      }

      sessions.set(launcherSession.socketId, {
        socketId: launcherSession.socketId,
        protocol: launcherSession.protocol || "launcher",
        token: launcherSession.token || null,
        accountId: launcherSession.accountId || null,
        secret: launcherSession.secret || null,
        displayName: launcherSession.displayName || null,
        isAuthenticated: launcherSession.isAuthenticated || false,
        subscribedToServers: launcherSession.subscribedToServers || false,
        connectedAt: launcherSession.connectedAt || new Date(),
      });

      if (!global.socketConnections) {
        global.socketConnections = new Map();
      }
      global.socketConnections.set(launcherSession.socketId.toString(), socket);
    } catch (ex) {
      log.error(
        `Error in AddLauncherSession for SocketId ${launcherSession?.socketId}: ${ex}`
      );
      throw ex;
    }
  }

  static async removeLauncherSession(socketId) {
    try {
      const sessions = getLauncherSessions();
      let socket = null;

      if (global.socketConnections) {
        socket = global.socketConnections.get(socketId.toString());
        global.socketConnections.delete(socketId.toString());
      }

      const deleted = sessions.delete(socketId.toString());

      if (!deleted) {
        log.error(
          `Failed to delete launcher session with SocketId ${socketId}`
        );
      } else {
        log.backend(
          `Successfully deleted launcher session with SocketId ${socketId}`
        );
      }

      if (socket) {
        try {
          socket.close();
        } catch (ex) {
          log.error(`Error closing socket during removal: ${ex.message}`);
        }
      }
    } catch (ex) {
      log.error(`Error removing launcher session: ${ex.message}`);
    }
  }

  static async removeLauncherSessionByAccountId(accountId) {
    if (!accountId) return;

    try {
      const sessions = getLauncherSessions();
      let sessionToRemove = null;
      let socketIdToRemove = null;

      for (const [socketId, session] of sessions.entries()) {
        if (session.accountId === accountId) {
          sessionToRemove = session;
          socketIdToRemove = socketId;
          break;
        }
      }

      if (!sessionToRemove) {
        log.error(`Launcher session with AccountId ${accountId} not found`);
        return;
      }

      let socket = null;
      if (global.socketConnections) {
        socket = global.socketConnections.get(socketIdToRemove.toString());
        global.socketConnections.delete(socketIdToRemove.toString());
      }

      sessions.delete(socketIdToRemove.toString());
      log.backend(
        `Successfully deleted launcher session with AccountId ${accountId}`
      );

      if (socket) {
        try {
          socket.close();
        } catch (ex) {
          log.error(`Error closing socket during removal: ${ex.message}`);
        }
      }
    } catch (ex) {
      log.error(`Error removing launcher session by accountId: ${ex.message}`);
    }
  }

  static async tryGetLauncherSession(socketId) {
    const sessions = getLauncherSessions();
    const session = sessions.get(socketId.toString());
    return { success: session !== undefined, session: session || null };
  }

  static async tryGetLauncherSessionByAccountId(accountId) {
    if (!accountId) return { success: false, session: null };
    const sessions = getLauncherSessions();

    for (const [socketId, session] of sessions.entries()) {
      if (session.accountId === accountId) {
        return { success: true, session };
      }
    }

    return { success: false, session: null };
  }

  static async listAllLauncherSessions() {
    const sessions = getLauncherSessions();
    return Array.from(sessions.values());
  }

  static async updateLauncherSession(
    session,
    socket,
    shouldCleanupOldSessions = false
  ) {
    if (!session || !session.socketId) {
      throw new Error("Session and socketId are required");
    }
    if (!socket) {
      throw new Error("Socket is required");
    }

    try {
      const sessions = getLauncherSessions();
      const existingSession = sessions.get(session.socketId.toString());

      if (existingSession) {
        const updatedSession = {
          socketId: session.socketId,
          protocol:
            session.protocol !== undefined
              ? session.protocol
              : existingSession.protocol,
          token:
            session.token !== undefined ? session.token : existingSession.token,
          accountId:
            session.accountId !== undefined
              ? session.accountId
              : existingSession.accountId,
          secret:
            session.secret !== undefined
              ? session.secret
              : existingSession.secret,
          displayName:
            session.displayName !== undefined
              ? session.displayName
              : existingSession.displayName,
          isAuthenticated:
            session.isAuthenticated !== undefined
              ? session.isAuthenticated
              : existingSession.isAuthenticated,
          subscribedToServers:
            session.subscribedToServers !== undefined
              ? session.subscribedToServers
              : existingSession.subscribedToServers,
          connectedAt: session.connectedAt || existingSession.connectedAt,
        };

        sessions.set(session.socketId.toString(), updatedSession);
      } else {
        const newSession = {
          socketId: session.socketId,
          protocol: session.protocol || "launcher",
          token: session.token || null,
          accountId: session.accountId || null,
          secret: session.secret || null,
          displayName: session.displayName || null,
          isAuthenticated: session.isAuthenticated || false,
          subscribedToServers: session.subscribedToServers || false,
          connectedAt: session.connectedAt || new Date(),
        };

        sessions.set(session.socketId.toString(), newSession);
      }

      if (
        shouldCleanupOldSessions &&
        session.accountId &&
        global.socketConnections
      ) {
        for (const [oldSocketId, oldSession] of sessions.entries()) {
          if (
            oldSession.accountId === session.accountId &&
            oldSocketId !== session.socketId.toString()
          ) {
            const oldSocket = global.socketConnections.get(oldSocketId);
            if (
              oldSocket &&
              oldSocket !== socket &&
              oldSocket.readyState === 1
            ) {
              log.backend(
                `Removing old launcher session connection: ${oldSocketId} (new connection from ${session.socketId})`
              );
              try {
                oldSocket.close();
              } catch (ex) {
                log.error(`Error closing old connection: ${ex.message}`);
              }
              global.socketConnections.delete(oldSocketId);
              sessions.delete(oldSocketId);
            } else {
              if (!oldSocket || oldSocket.readyState !== 1) {
                sessions.delete(oldSocketId);
                if (oldSocket && global.socketConnections) {
                  global.socketConnections.delete(oldSocketId);
                }
              }
            }
          }
        }
      }

      if (!global.socketConnections) {
        global.socketConnections = new Map();
      }
      global.socketConnections.set(session.socketId.toString(), socket);
    } catch (ex) {
      log.error(
        `Failed to update launcher session ${session.socketId}: ${ex.message}`
      );
      throw ex;
    }
  }
}

module.exports = LauncherSessionsManager;
