class IncomingWebSocketMessage {
    constructor(data) {
        this.type = data.type || "";
        this.payload = data.payload || {};
        this.messageId = data.id || null;
    }
}

module.exports = IncomingWebSocketMessage;

