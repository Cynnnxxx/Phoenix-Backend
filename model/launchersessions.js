const mongoose = require("mongoose");

const LauncherSessionsSchema = new mongoose.Schema(
    {
        socketId: { type: String, required: true, unique: true },
        protocol: { type: String, default: "launcher" },
        token: { type: String, default: null },
        accountId: { type: String, default: null },
        secret: { type: String, default: null },
        displayName: { type: String, default: null },
        isAuthenticated: { type: Boolean, default: false },
        subscribedToServers: { type: Boolean, default: false },
        connectedAt: { type: Date, default: Date.now }
    },
    {
        collection: "launchersessions"
    }
);

const model = mongoose.model("LauncherSessionsSchema", LauncherSessionsSchema);

module.exports = model;

