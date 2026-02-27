const Arena = require("../model/arena.js");
const User = require("../model/user.js");
const LeaderboardEntry = require("./Classes/LeaderboardEntry.js");
const log = require("../structs/log.js");

class CacheManager {
    constructor() {
        this.cachedLeaderboard = null;
        this.lastUpdate = null;
        this.cacheExpiry = 5 * 60 * 1000;
        this.leaderboardLock = false;
    }

    async getLeaderboard() {
        while (this.leaderboardLock) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }

        try {
            this.leaderboardLock = true;

            if (this.cachedLeaderboard && this.lastUpdate && 
                (Date.now() - this.lastUpdate) < this.cacheExpiry) {
                return this.cachedLeaderboard;
            }

            return await this.refreshLeaderboard();
        } finally {
            this.leaderboardLock = false;
        }
    }

    async refreshLeaderboard() {
        try {
            const arenaEntries = await Arena.find({ hype: { $gt: 0 } });

            const users = await User.find({});
            const usernameMap = new Map();
            users.forEach(user => {
                if (user.username && user.username.trim() !== "InvalidSocketUser") {
                    usernameMap.set(user.accountId, user.username.trim());
                }
            });

            const leaderboard = arenaEntries
                .map(arena => {
                    const username = usernameMap.get(arena.accountId) || "UnknownUser";
                    return new LeaderboardEntry(arena.accountId, username, arena.hype);
                })
                .sort((a, b) => b.hype - a.hype)
                .slice(0, 25);

            this.cachedLeaderboard = leaderboard;
            this.lastUpdate = Date.now();
            return this.cachedLeaderboard;
        } catch (ex) {
            log.error(`Leaderboard refresh failed: ${ex}`);
            return this.cachedLeaderboard;
        }
    }
}

module.exports = CacheManager;

