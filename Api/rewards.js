const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
const User = require("../model/user.js");
const Profile = require("../model/profiles.js");
const LauncherDailyReward = require("../model/launcherDailyReward.js");
const log = require("../structs/log.js");

const app = express.Router();

// Luck Box config
const FORTNITE_API = "https://fortnite-api.com/v2/cosmetics/br";
const LUCK_BOX_COSTS = {
  common: 400,
  uncommon: 1000,
  epic: 5000,
  legendary: 6000,
};
const RARITY_MAP = {
  common: ["common"],
  uncommon: ["uncommon"],
  epic: ["epic"],
  legendary: ["legendary", "mythic"],
};
const ALLOWED_TYPES = ["outfit", "pickaxe", "emote"];

// Simple daily reward table (30 days of V-Bucks)
// You can later change individual entries to cosmetics if desired.
const DAILY_REWARDS = [
  0,
  3000, // Day 1
  500, // Day 2
  500, // Day 3
  800, // Day 4
  800, // Day 5
  1000, // Day 6
  1000, // Day 7
  1200, // Day 8
  1200, // Day 9
  1500, // Day 10
  1500, // Day 11
  1800, // Day 12
  1800, // Day 13
  2000, // Day 14
  2000, // Day 15
  2200, // Day 16
  2200, // Day 17
  2400, // Day 18
  2400, // Day 19
  2600, // Day 20
  2600, // Day 21
  2800, // Day 22
  2800, // Day 23
  3000, // Day 24
  3000, // Day 25
  3200, // Day 26
  3200, // Day 27
  3500, // Day 28
  5000, // Day 29
  7500, // Day 30
];

function getRewardAmountForDay(day) {
  if (day < 1) day = 1;
  if (day > 30) day = 30;
  return DAILY_REWARDS[day] || 0;
}

// Must stay in sync with launcher.js generateAccountSecret
function generateAccountSecret(accountId, discordId) {
  const combined = `${accountId}:${discordId}:${global.JWT_SECRET}`;
  const hash = crypto.createHash("sha256").update(combined).digest("base64");
  return hash;
}

async function verifyLauncherIdentity(accountId, secret) {
  if (!accountId || !secret) return { ok: false, error: "Missing identity" };

  const user = await User.findOne({ accountId });
  if (!user) return { ok: false, error: "User not found" };

  const expectedSecret = generateAccountSecret(user.accountId, user.discordId);
  if (expectedSecret !== secret) {
    return { ok: false, error: "Invalid launcher secret" };
  }

  return { ok: true, user };
}

async function getOrCreateProgress(accountId) {
  let progress = await LauncherDailyReward.findOne({ accountId });
  if (!progress) {
    progress = await LauncherDailyReward.create({
      accountId,
      currentDay: 1,
      lastClaimAt: null,
    });
  }
  return progress;
}

function canClaimToday(progress) {
  if (!progress.lastClaimAt) return true;
  const now = Date.now();
  const last = progress.lastClaimAt.getTime();
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  return now - last >= ONE_DAY_MS;
}

async function awardVbucks(accountId, amount) {
  if (amount <= 0) return;

  const profile = await Profile.findOne({ accountId });
  if (!profile || !profile.profiles) {
    throw new Error("Profile not found for account");
  }

  const commonCore = profile.profiles["common_core"];
  const profile0 = profile.profiles["profile0"];

  if (!commonCore || !profile0) {
    throw new Error("Invalid profile structure");
  }

  // Ensure currency nodes exist
  if (!commonCore.items) commonCore.items = {};
  if (!commonCore.items["Currency:MtxPurchased"]) {
    commonCore.items["Currency:MtxPurchased"] = {
      templateId: "Currency:MtxPurchased",
      attributes: {
        platform: "Shared",
      },
      quantity: 0,
    };
  }

  const currentVBucks =
    commonCore.items["Currency:MtxPurchased"].quantity || 0;
  const newVBucks = currentVBucks + amount;

  commonCore.items["Currency:MtxPurchased"].quantity = newVBucks;
  commonCore.rvn = (commonCore.rvn || 0) + 1;
  commonCore.commandRevision = (commonCore.commandRevision || 0) + 1;
  commonCore.updated = new Date().toISOString();

  // Mirror to profile0 for compatibility
  if (!profile0.items) profile0.items = {};
  if (!profile0.items["Currency:MtxPurchased"]) {
    profile0.items["Currency:MtxPurchased"] = {
      templateId: "Currency:MtxPurchased",
      attributes: {
        platform: "Shared",
      },
      quantity: 0,
    };
  }

  profile0.items["Currency:MtxPurchased"].quantity =
    (profile0.items["Currency:MtxPurchased"].quantity || 0) + amount;

  await profile.updateOne({
    $set: {
      "profiles.common_core": commonCore,
      "profiles.profile0": profile0,
    },
  });

  log.backend(
    `[LauncherRewards] Awarded ${amount} V-Bucks to account ${accountId}`
  );
}

// Luck Box helpers
async function deductVbucks(accountId, amount) {
  const profile = await Profile.findOne({ accountId });
  if (!profile || !profile.profiles) throw new Error("Profile not found");
  const commonCore = profile.profiles["common_core"];
  const profile0 = profile.profiles["profile0"];
  if (!commonCore || !profile0) throw new Error("Invalid profile structure");
  if (!commonCore.items) commonCore.items = {};
  if (!commonCore.items["Currency:MtxPurchased"]) throw new Error("V-Bucks currency not found");
  const currentVBucks = commonCore.items["Currency:MtxPurchased"].quantity || 0;
  if (currentVBucks < amount) throw new Error("Insufficient V-Bucks");
  commonCore.items["Currency:MtxPurchased"].quantity = currentVBucks - amount;
  commonCore.rvn = (commonCore.rvn || 0) + 1;
  commonCore.commandRevision = (commonCore.commandRevision || 0) + 1;
  commonCore.updated = new Date().toISOString();
  if (!profile0.items) profile0.items = {};
  if (!profile0.items["Currency:MtxPurchased"]) {
    profile0.items["Currency:MtxPurchased"] = {
      templateId: "Currency:MtxPurchased",
      attributes: { platform: "Shared" },
      quantity: 0,
    };
  }
  profile0.items["Currency:MtxPurchased"].quantity = Math.max(
    0,
    (profile0.items["Currency:MtxPurchased"].quantity || 0) - amount
  );
  await profile.updateOne({
    $set: { "profiles.common_core": commonCore, "profiles.profile0": profile0 },
  });
}

// Luck Box: only cosmetics from Chapter 1 through Chapter 2 Season 4 (14.40)
function isInChapter1ToC2S4(item) {
  const intro = item.introduction;
  if (!intro || intro.chapter == null) return false;
  const chapter = parseInt(intro.chapter, 10);
  const season = intro.season != null ? intro.season.toString() : null;
  if (!Number.isFinite(chapter)) return false;
  if (chapter === 1) return true;
  if (chapter === 2 && season != null) {
    const s = parseInt(season, 10);
    return Number.isFinite(s) && s >= 1 && s <= 4;
  }
  return false;
}

async function fetchRandomItemByRarity(rarity) {
  const response = await axios.get(FORTNITE_API, { timeout: 10000 });
  const cosmetics = response.data.data || [];
  const rarityValues = RARITY_MAP[rarity] || ["common"];

  // Filter by rarity and chapter, group by type (outfit, pickaxe, emote)
  const byType = { outfit: [], pickaxe: [], emote: [] };
  for (const item of cosmetics) {
    const itemRarity = item.rarity?.value?.toLowerCase();
    const itemType = item.type?.value?.toLowerCase();
    if (
      isInChapter1ToC2S4(item) &&
      rarityValues.includes(itemRarity) &&
      ALLOWED_TYPES.includes(itemType) &&
      item.id &&
      item.name
    ) {
      if (byType[itemType]) byType[itemType].push(item);
    }
  }

  // Equal chance for outfits, pickaxes, and emotes across all tiers (common, uncommon, epic, legendary)
  const typesWithItems = ["outfit", "pickaxe", "emote"].filter((t) => byType[t]?.length > 0);
  if (typesWithItems.length === 0) throw new Error(`No items found for rarity: ${rarity}`);

  const chosenType = typesWithItems[Math.floor(Math.random() * typesWithItems.length)];
  const pool = byType[chosenType];
  const randomItem = pool[Math.floor(Math.random() * pool.length)];

  const typeMap = { outfit: "skin", pickaxe: "pickaxe", emote: "emote" };
  const itemType = typeMap[chosenType] || "skin";

  return {
    templateId: randomItem.id,
    name: randomItem.name,
    type: itemType,
    rarity: rarity,
    imageUrl: randomItem.images?.icon || null,
  };
}

async function grantItemToUserAsGiftBox(accountId, item) {
  const profile = await Profile.findOne({ accountId });
  if (!profile || !profile.profiles) throw new Error("Profile not found");
  const commonCore = profile.profiles["common_core"];
  const athena = profile.profiles["athena"];
  if (!commonCore || !athena) throw new Error("Profile structure invalid");
  if (!commonCore.items) commonCore.items = {};
  if (!athena.items) athena.items = {};

  const typeMap = { skin: "AthenaCharacter", pickaxe: "AthenaPickaxe", emote: "AthenaDance" };
  const templatePrefix = typeMap[item.type] || "AthenaCharacter";
  const itemKey = `${templatePrefix}:${item.templateId}`;

  if (athena.items[itemKey]) return;

  athena.items[itemKey] = { templateId: itemKey, attributes: {}, quantity: 1 };
  athena.rvn = (athena.rvn || 0) + 1;
  athena.commandRevision = (athena.commandRevision || 0) + 1;
  athena.updated = new Date().toISOString();

  const purchaseId = uuidv4();
  const lootList = [
    { itemType: itemKey, itemGuid: itemKey, quantity: 1 },
  ];
  commonCore.items[purchaseId] = {
    templateId: "GiftBox:GB_MakeGood",
    attributes: {
      fromAccountId: "[Axys Luck Box]",
      lootList,
      params: { userMessage: `You won: ${item.name}` },
      giftedOn: new Date().toISOString(),
    },
    quantity: 1,
  };
  commonCore.rvn = (commonCore.rvn || 0) + 1;
  commonCore.commandRevision = (commonCore.commandRevision || 0) + 1;
  commonCore.updated = new Date().toISOString();

  await profile.updateOne({
    $set: {
      "profiles.athena": athena,
      "profiles.common_core": commonCore,
    },
  });
  log.backend(`[LuckBox] Granted ${item.templateId} (${item.name}) to account ${accountId} as gift box`);
}

async function getLuckBoxUserData(accountId) {
  const user = await User.findOne({ accountId }).lean();
  const profile = await Profile.findOne({ accountId }).lean();
  if (!user || !profile) return null;
  const vbucks = profile.profiles?.common_core?.items?.["Currency:MtxPurchased"]?.quantity || 0;
  return {
    id: user.accountId,
    discord: { displayName: user.username, username: user.username, avatarUrl: user.avatar || null },
    profile: { common_core: { vbucks }, athena: profile.profiles?.athena || {} },
  };
}

// Get daily reward status
app.post("/h/d/v1/rewards/daily/status", async (req, res) => {
  try {
    const { accountId, secret } = req.body || {};

    const verified = await verifyLauncherIdentity(accountId, secret);
    if (!verified.ok) {
      return res.status(401).json({ ok: false, error: verified.error });
    }

    const progress = await getOrCreateProgress(accountId);
    const canClaim = canClaimToday(progress);
    const rewardAmount = getRewardAmountForDay(progress.currentDay);

    return res.json({
      ok: true,
      accountId,
      currentDay: progress.currentDay,
      canClaim,
      lastClaimAt: progress.lastClaimAt,
      reward: {
        type: "vbucks",
        amount: rewardAmount,
        label: `${rewardAmount.toLocaleString()} V-Bucks`,
      },
    });
  } catch (ex) {
    log.error(`[LauncherRewards] Status error: ${ex.message}`);
    return res.status(500).json({
      ok: false,
      error: "Internal server error",
    });
  }
});

// Claim daily reward
app.post("/h/d/v1/rewards/daily/claim", async (req, res) => {
  try {
    const { accountId, secret } = req.body || {};

    const verified = await verifyLauncherIdentity(accountId, secret);
    if (!verified.ok) {
      return res.status(401).json({ ok: false, error: verified.error });
    }

    const progress = await getOrCreateProgress(accountId);

    if (!canClaimToday(progress)) {
      return res.status(400).json({
        ok: false,
        error: "Reward already claimed. Try again tomorrow.",
      });
    }

    const rewardAmount = getRewardAmountForDay(progress.currentDay);
    if (rewardAmount > 0) {
      await awardVbucks(accountId, rewardAmount);
    }

    progress.lastClaimAt = new Date();
    if (progress.currentDay < 30) {
      progress.currentDay += 1;
    }
    await progress.save();

    return res.json({
      ok: true,
      accountId,
      currentDay: progress.currentDay,
      reward: {
        type: "vbucks",
        amount: rewardAmount,
        label: `${rewardAmount.toLocaleString()} V-Bucks`,
      },
    });
  } catch (ex) {
    log.error(`[LauncherRewards] Claim error: ${ex.message}`);
    return res.status(500).json({
      ok: false,
      error: "Internal server error",
    });
  }
});

// Luck Box - open
app.post("/h/d/v1/luckbox/open", async (req, res) => {
  try {
    const { accountId, secret, rarity } = req.body || {};

    if (!accountId || !secret || !rarity) {
      return res.status(400).json({ success: false, error: "Missing required fields" });
    }

    if (!LUCK_BOX_COSTS[rarity]) {
      return res.status(400).json({ success: false, error: "Invalid rarity" });
    }

    const identityCheck = await verifyLauncherIdentity(accountId, secret);
    if (!identityCheck.ok) {
      return res.status(401).json({ success: false, error: identityCheck.error });
    }

    const cost = LUCK_BOX_COSTS[rarity];
    const profile = await Profile.findOne({ accountId });
    if (!profile) {
      return res.status(404).json({ success: false, error: "Profile not found" });
    }

    const currentVBucks =
      profile.profiles?.common_core?.items?.["Currency:MtxPurchased"]?.quantity || 0;
    if (currentVBucks < cost) {
      return res.status(400).json({ success: false, error: "Insufficient V-Bucks" });
    }

    await deductVbucks(accountId, cost);
    const wonItem = await fetchRandomItemByRarity(rarity);
    await grantItemToUserAsGiftBox(accountId, wonItem);
    const updatedUser = await getLuckBoxUserData(accountId);

    log.backend(
      `[LuckBox] ${identityCheck.user.username} opened ${rarity} box, won ${wonItem.name} (${wonItem.templateId})`
    );

    return res.json({ success: true, item: wonItem, user: updatedUser });
  } catch (error) {
    log.error(`[LuckBox] Error opening luck box: ${error.message}`);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to open luck box",
    });
  }
});

module.exports = app;

