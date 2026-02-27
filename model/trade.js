const mongoose = require("mongoose");

const TradeSchema = new mongoose.Schema(
    {
        created: { type: Date, required: true, default: Date.now },
        tradeId: { type: String, required: true, unique: true },
        initiatorAccountId: { type: String, required: true },
        initiatorDiscordId: { type: String, required: true },
        initiatorUsername: { type: String, required: true },
        receiverAccountId: { type: String, required: true },
        receiverDiscordId: { type: String, required: true },
        receiverUsername: { type: String, required: true },
        initiatorItems: [{
            itemKey: { type: String, required: true },
            templateId: { type: String, required: true },
            itemData: { type: Object, required: true }
        }],
        receiverItems: [{
            itemKey: { type: String, required: true },
            templateId: { type: String, required: true },
            itemData: { type: Object, required: true }
        }],
        status: { 
            type: String, 
            enum: ["pending", "accepted", "completed", "cancelled", "expired"],
            default: "pending"
        },
        expiresAt: { type: Date, required: true, default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) } // 24 hours
    },
    {
        collection: "trades"
    }
);

// Index for efficient queries
TradeSchema.index({ tradeId: 1 });
TradeSchema.index({ initiatorAccountId: 1, status: 1 });
TradeSchema.index({ receiverAccountId: 1, status: 1 });
TradeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const model = mongoose.model('TradeSchema', TradeSchema);

module.exports = model;

