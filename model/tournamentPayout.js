const mongoose = require("mongoose");

const tournamentPayoutSchema = new mongoose.Schema(
    {
        eventId: { type: String, required: true },
        eventWindowId: { type: String, required: true },
        paidAt: { type: Date, default: Date.now },
        payouts: [
            {
                accountId: String,
                username: String,
                rank: Number,
                vbucks: Number
            }
        ]
    },
    {
        collection: "tournamentpayouts"
    }
);

// Prevent double-payout for the same event window
tournamentPayoutSchema.index({ eventId: 1, eventWindowId: 1 }, { unique: true });

const TournamentPayout = mongoose.model("TournamentPayout", tournamentPayoutSchema);

module.exports = TournamentPayout;
