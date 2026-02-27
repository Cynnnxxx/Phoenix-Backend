const ConnectionInfo = require("./Classes/ConnectionInfo.js");
const ClientValidation = require("./ClientValidation.js");
const LauncherSessionsManager = require("./Classes/LauncherSessionsManager.js");
const log = require("../structs/log.js");
const { v4: uuidv4 } = require("uuid");

class ConnectionManager {
    constructor() {
        this.connections = new Map();
        this.disposed = false;
    }

    async addConnection(socket, url) {
        try {
            if (socket._socket && socket._socket.remoteAddress) {
            }
        } catch (ex) {
        }

        if (!socket._socketId) {
            socket._socketId = uuidv4();
        }

        if (!await ClientValidation.validateTokenFromQuery(socket, url)) {
            socket.close();
            return;
        }

        const info = new ConnectionInfo(socket);
        this.connections.set(socket._socketId, info);
        log.debug(`Client connected: ${socket._socketId}`);
    }

    removeConnection(socketId) {
        if (this.connections.has(socketId)) {
            const info = this.connections.get(socketId);
            const duration = new Date() - info.connectedAt;
            const minutes = Math.floor(duration / 60000);
            const seconds = Math.floor((duration % 60000) / 1000);
            log.debug(`Client disconnected: ${socketId} after ${minutes}:${seconds.toString().padStart(2, '0')}`);
            this.connections.delete(socketId);
        }
    }

    handleError(socket, ex) {
        const socketId = socket._socketId || socket.id || "unknown";
        log.debug(`Socket error for ${socketId}: ${ex.message}`);
        this.removeConnection(socketId);
        this.safeClose(socket);
    }

    async sendToClient(id, message) {
        if (!this.connections.has(id)) return;

        const info = this.connections.get(id);
        if (!info.isHealthy) return;

        try {
            if (info.socket.readyState === 1) {
                info.socket.send(message);
                info.lastActivity = new Date();
            } else {
                this.removeConnection(id);
            }
        } catch (ex) {
            log.debug(`Send failed to ${id}: ${ex.message}`);
            this.removeConnection(id);
        }
    }

    async sendToAllClients(message) {
        const tasks = Array.from(this.connections.keys()).map(id => 
            this.sendToClient(id, message)
        );
        await Promise.all(tasks);
    }

    sendHeartbeat() {
        const ping = JSON.stringify({
            type: "heartbeat",
            timestamp: Date.now()
        });
        setImmediate(() => this.sendToAllClients(ping));
    }

    async monitorConnections() {
        const monitorLoop = async () => {
            while (!this.disposed) {
                try {
                    const stale = [];
                    const now = Date.now();
                    const fiveMinutesAgo = now - (5 * 60 * 1000);

                    for (const [id, info] of this.connections.entries()) {
                        const lastActivityTime = info.lastActivity.getTime();
                        if (!info.isHealthy || lastActivityTime < fiveMinutesAgo) {
                            stale.push(id);
                        }
                    }

                    for (const id of stale) {
                        if (this.connections.has(id)) {
                            const info = this.connections.get(id);
                            this.safeClose(info.socket);
                            this.connections.delete(id);
                        }
                    }

                    await new Promise(resolve => setTimeout(resolve, 60000));
                } catch (ex) {
                    log.error(`Monitor error: ${ex}`);
                    await new Promise(resolve => setTimeout(resolve, 30000));
                }
            }
        };
        
        monitorLoop().catch(ex => {
            log.error(`Monitor loop error: ${ex}`);
        });
    }

    async broadcastToLauncherClients(message) {
        try {
            const launcherSessions = await LauncherSessionsManager.listAllLauncherSessions();
            const broadcastTasks = [];

            for (const session of launcherSessions) {
                if (session.protocol === "launcher" && session.isAuthenticated) {
                    broadcastTasks.push(this.sendToClient(session.socketId, message));
                }
            }

            if (broadcastTasks.length > 0) {
                await Promise.all(broadcastTasks);
                log.info(`Broadcasted message to ${broadcastTasks.length} launcher clients`);
            }
        } catch (ex) {
            log.error(`Error broadcasting to launcher clients: ${ex.message}`);
        }
    }

    cleanup() {
        const healthy = Array.from(this.connections.values()).filter(c => c.isHealthy).length;
        log.debug(`Connections: ${healthy}/${this.connections.size} healthy`);
        if (this.connections.size > 1000) {
            global.gc && global.gc();
        }
    }

    getConnectionCount() {
        return this.connections.size;
    }

    isConnected(id) {
        return this.connections.has(id) && this.connections.get(id).isHealthy;
    }

    safeClose(socket) {
        try {
            if (socket && socket.readyState !== 3) {
                socket.close();
            }
        } catch (ex) {
        }
    }

    dispose() {
        this.disposed = true;
        for (const info of this.connections.values()) {
            this.safeClose(info.socket);
        }
        this.connections.clear();
    }
}

module.exports = ConnectionManager;

