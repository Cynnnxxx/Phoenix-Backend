const log = require("../../structs/log.js");

class IgnisSocketUtils {
    static sendToClient(connections, connectionId, message) {
        if (connections.has(connectionId)) {
            const connection = connections.get(connectionId);
            try {
                if (connection.readyState === 1) {
                    connection.send(message);
                    return true;
                }
            } catch (ex) {
                log.error(`Failed to send message to ${connectionId}: ${ex}`);
                connections.delete(connectionId);
                return false;
            }
        }
        return false;
    }

    static sendJsonToClient(connections, connectionId, obj) {
        try {
            const json = JSON.stringify(obj);
            return this.sendToClient(connections, connectionId, json);
        } catch (ex) {
            log.error(`Failed to serialize object for client ${connectionId}: ${ex}`);
            return false;
        }
    }

    static sendToAllClients(connections, message) {
        const disconnectedClients = [];
        let successCount = 0;

        for (const [id, connection] of connections.entries()) {
            try {
                if (connection.readyState === 1) {
                    connection.send(message);
                    successCount++;
                } else {
                    disconnectedClients.push(id);
                }
            } catch (ex) {
                log.error(`Failed to send broadcast message to ${id}: ${ex}`);
                disconnectedClients.push(id);
            }
        }

        for (const clientId of disconnectedClients) {
            connections.delete(clientId);
        }

        return successCount;
    }

    static sendJsonToAllClients(connections, obj) {
        try {
            const json = JSON.stringify(obj);
            return this.sendToAllClients(connections, json);
        } catch (ex) {
            log.error(`Failed to serialize object for broadcast: ${ex}`);
            return 0;
        }
    }

    static disconnectClient(connections, connectionId, reason = null) {
        if (connections.has(connectionId)) {
            const connection = connections.get(connectionId);
            connections.delete(connectionId);
            try {
                if (reason) {
                    log.info(`Disconnecting client ${connectionId}: ${reason}`);
                }
                connection.close();
            } catch (ex) {
                log.error(`Error disconnecting client ${connectionId}: ${ex}`);
            }
        }
    }

    static sendErrorResponse(connections, connectionId, errorMessage, messageId = null) {
        const errorResponse = {
            type: "error",
            timestamp: Date.now(),
            message: errorMessage,
            id: messageId
        };

        return this.sendJsonToClient(connections, connectionId, errorResponse);
    }

    static sendSuccessResponse(connections, connectionId, responseType, payload = null, messageId = null) {
        const response = {
            type: responseType,
            timestamp: Date.now(),
            payload,
            id: messageId
        };

        return this.sendJsonToClient(connections, connectionId, response);
    }

    static getConnectedClientCount(connections) {
        return connections.size;
    }

    static getConnectedClientIds(connections) {
        return Array.from(connections.keys());
    }

    static isClientConnected(connections, connectionId) {
        return connections.has(connectionId);
    }
}

module.exports = IgnisSocketUtils;

