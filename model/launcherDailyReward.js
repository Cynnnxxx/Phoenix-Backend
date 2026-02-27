const mongoose = require("mongoose");

const LauncherDailyRewardSchema = new mongoose.Schema(
  {
    accountId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    currentDay: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
      max: 30,
    },
    lastClaimAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model(
  "LauncherDailyReward",
  LauncherDailyRewardSchema
);

