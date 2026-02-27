const mongoose = require("mongoose");

const AnticheatSchema = new mongoose.Schema(
    {
        accountId: { type: String, required: true, index: true },
        username: { type: String, required: true },
        violationType: { 
            type: String, 
            required: true,
            enum: [
                "speed_hack",
                "fly_hack", 
                "aimbot",
                "esp_wallhack",
                "rapid_fire",
                "no_recoil",
                "teleport",
                "god_mode",
                "invalid_stats",
                "suspicious_kills",
                "impossible_movement",
                "packet_manipulation",
                "other"
            ]
        },
        severity: { type: Number, required: true, min: 1, max: 10 }, // 1-10 severity
        detectedAt: { type: Date, required: true, default: Date.now },
        gameSession: { type: String, default: null },
        details: { type: Object, default: {} },
        actionTaken: { 
            type: String, 
            enum: ["warning", "kick", "temp_ban", "permanent_ban", "none"],
            default: "none"
        },
        resolved: { type: Boolean, default: false },
        appealed: { type: Boolean, default: false },
        appealMessage: { type: String, default: null },
        appealedAt: { type: Date, default: null }
    },
    {
        collection: "anticheat_logs"
    }
);

// Indexes for performance
AnticheatSchema.index({ accountId: 1, detectedAt: -1 });
AnticheatSchema.index({ violationType: 1 });
AnticheatSchema.index({ resolved: 1 });

const model = mongoose.model('AnticheatSchema', AnticheatSchema);

module.exports = model;

