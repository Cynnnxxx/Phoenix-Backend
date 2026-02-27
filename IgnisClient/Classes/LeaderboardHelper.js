const crypto = require("crypto");

class LeaderboardHelper {
    static generateLeaderboardHash(leaderboard) {
        const jsonString = JSON.stringify(leaderboard);
        const hash = crypto.createHash("sha256").update(jsonString).digest("base64");
        return hash;
    }
}

module.exports = LeaderboardHelper;

