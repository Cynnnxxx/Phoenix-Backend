class RateLimiter {
    constructor(maxMessagesPerMinute = 60) {
        this.maxMessagesPerMinute = maxMessagesPerMinute;
        this.clientMessageTimes = new Map();
        this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
    }

    isAllowed(clientId) {
        const now = new Date();
        const cutoff = new Date(now.getTime() - 60000);

        if (!this.clientMessageTimes.has(clientId)) {
            this.clientMessageTimes.set(clientId, []);
        }

        const messageQueue = this.clientMessageTimes.get(clientId);

        while (messageQueue.length > 0 && messageQueue[0] <= cutoff) {
            messageQueue.shift();
        }

        if (messageQueue.length >= this.maxMessagesPerMinute) {
            return false;
        }

        messageQueue.push(now);
        return true;
    }

    cleanup() {
        const cutoff = new Date(Date.now() - 120000);
        const clientsToRemove = [];

        for (const [clientId, queue] of this.clientMessageTimes.entries()) {
            while (queue.length > 0 && queue[0] <= cutoff) {
                queue.shift();
            }

            if (queue.length === 0) {
                clientsToRemove.push(clientId);
            }
        }

        for (const clientId of clientsToRemove) {
            this.clientMessageTimes.delete(clientId);
        }
    }

    dispose() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        this.clientMessageTimes.clear();
    }
}

module.exports = RateLimiter;

