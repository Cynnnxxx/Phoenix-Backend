const WebSocket = require("ws");
const http = require("http");
const ConnectionManager = require("./ConnectionManager.js");
const MessageHandler = require("./MessageHandler.js");
const LauncherSessionsManager = require("./Classes/LauncherSessionsManager.js");
const log = require("../structs/log.js");
const { v4: uuidv4 } = require("uuid");

class IgnisClient {
    constructor() {
        this.maxConnections = 7000;
        this.heartbeatIntervalMs = 30000;
        this.cleanupIntervalMs = 60000;
        this.server = null;
        this.httpServer = null;
        this.connectionManager = new ConnectionManager();
        this.messageHandler = new MessageHandler(this.connectionManager);
        this.heartbeatTimer = null;
        this.cleanupTimer = null;
        this.disposed = false;
        this.connectionSemaphore = this.maxConnections;
    }

    async start(port = 9999) {
        if (this.disposed) {
            throw new Error("IgnisClient has been disposed");
        }

        return new Promise((resolve, reject) => {
            try {
                this.httpServer = http.createServer();

                this.server = new WebSocket.Server({
                    server: this.httpServer,
                    perMessageDeflate: false,
                    clientTracking: true
                });

                this.server.on("connection", (socket, req) => {
                    this.handleConnection(socket, req);
                });

                this.httpServer.on("error", (err) => {
                    reject(err);
                });

                this.httpServer.listen(port, "0.0.0.0", () => {
                    log.backend(`Ignis WebSocket Server started on ws://0.0.0.0:${port} (Max: ${this.maxConnections})`);
                    resolve();
                });

                this.startTimers();

                this.connectionManager.monitorConnections();
            } catch (err) {
                reject(err);
            }
        });
    }

    async handleConnection(socket, req) {
        if (this.connectionSemaphore <= 0) {
            socket.close();
            return;
        }

        this.connectionSemaphore--;

        try {
            socket._socketId = uuidv4();
            socket._url = req.url;

            socket.on("open", () => {
            });

            socket.on("close", () => {
                this.connectionSemaphore++;
                this.connectionManager.removeConnection(socket._socketId);
            });

            socket.on("message", (message) => {
                this.messageHandler.handleMessage(socket, message.toString());
            });

            socket.on("error", (error) => {
                this.connectionManager.handleError(socket, error);
                this.connectionSemaphore++;
            });

            await this.connectionManager.addConnection(socket, req.url);
        } catch (ex) {
            log.error(`Error handling connection: ${ex.message}`);
            socket.close();
            this.connectionSemaphore++;
        }
    }

    startTimers() {
        this.heartbeatTimer = setInterval(() => {
            this.connectionManager.sendHeartbeat();
        }, this.heartbeatIntervalMs);

        this.cleanupTimer = setInterval(() => {
            this.connectionManager.cleanup();
        }, this.cleanupIntervalMs);
    }

    getConnectedClientCount() {
        return this.connectionManager.getConnectionCount();
    }

    isClientConnected(id) {
        return this.connectionManager.isConnected(id);
    }

    async sendToClient(id, message) {
        return await this.connectionManager.sendToClient(id, message);
    }

    async sendToAllClients(message) {
        return await this.connectionManager.sendToAllClients(message);
    }

    async broadcastToLauncherClients(message) {
        return await this.connectionManager.broadcastToLauncherClients(message);
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;

        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }

        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }

        if (this.connectionManager) {
            this.connectionManager.dispose();
        }

        if (this.server) {
            this.server.close();
            this.server = null;
        }

        if (this.httpServer) {
            this.httpServer.close();
            this.httpServer = null;
        }
    }
}

module.exports = IgnisClient;

