const mongoose = require("mongoose");

const blacklistSchema = new mongoose.Schema({
    accountId: {
        type: String,
        required: true,
        unique: true
    },
    reason: {
        type: String,
        default: "No reason provided"
    },
    date: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model("Blacklist", blacklistSchema);
