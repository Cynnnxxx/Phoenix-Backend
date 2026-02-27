class ConnectionInfo {
    constructor(socket) {
        this.socket = socket;
        this.lastActivity = new Date();
        this.connectedAt = new Date();
        this.failedSendAttempts = 0;
    }

    get isHealthy() {
        return this.failedSendAttempts < 3 && 
               this.socket && 
               this.socket.readyState === 1;
    }
}

module.exports = ConnectionInfo;

