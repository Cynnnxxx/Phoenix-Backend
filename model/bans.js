const mongoose = require("mongoose");

const BansSchema = new mongoose.Schema(
    {
        accountId: { type: String, required: true, index: true },
        username: { type: String, required: true },
        banType: { type: String, required: true, enum: ["matchmaking", "competitive", "permanent"] },
        reason: { type: String, default: "Violation of terms" },
        bannedBy: { type: String, default: "System" },
        bannedAt: { type: Date, required: true, default: Date.now },
        expiresAt: { type: Date, default: null }, // null = permanent
        isActive: { type: Boolean, default: true },
        metadata: { type: Object, default: {} }
    },
    {
        collection: "bans"
    }
);

// Index for efficient queries
BansSchema.index({ accountId: 1, isActive: 1 });
BansSchema.index({ expiresAt: 1 });

const model = mongoose.model('BansSchema', BansSchema);

module.exports = model;

