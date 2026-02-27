const mongoose = require("mongoose");

const RedeemCodesSchema = new mongoose.Schema(
    {
        code: { type: String, required: true, unique: true },
        code_lower: { type: String, required: true, unique: true },
        vbucks: { type: Number, required: true },
        used: { type: Boolean, default: false },
        usedBy: { type: String, default: null },
        usedAt: { type: Date, default: null },
        created: { type: Date, default: Date.now },
        expiresAt: { type: Date, default: null }
    },
    {
        collection: "redeemcodes"
    }
);

const model = mongoose.model('RedeemCodesSchema', RedeemCodesSchema);

module.exports = model;

