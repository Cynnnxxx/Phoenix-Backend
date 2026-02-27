const mongoose = require('mongoose');

const tournamentSchema = new mongoose.Schema(
    {
        "accountId": { type: String, required: true, unique: true },
        "username": { type: String, default: "" },
        "tournamentPoints": { type: Number, default: 0 },
        "wins": { type: Number, default: 0 },
        "eliminations": { type: Number, default: 0 },
        "matchesPlayed": { type: Number, default: 0 },
        "season": { type: String, default: "Chapter 3 Season 1" },
        "version": { type: String, default: "19.10" },
        "hasReceivedTopReward": { type: Boolean, default: false },
        "lastUpdated": { type: Date, default: Date.now }
    },
    {
        "collection": "tournament"
    }
);

const Tournament = mongoose.model('Tournament', tournamentSchema);

module.exports = Tournament;