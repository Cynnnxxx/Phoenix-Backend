const Users = require('../../../model/user.js');
const Profiles = require('../../../model/profiles.js');
const fs = require('fs');
const path = require('path');
const destr = require('destr');
const config = require('../../../Config/config.json');
const uuid = require("uuid");
const log = require("../../../structs/log.js");
const { MessageEmbed } = require('discord.js');
module.exports = {
    commandInfo: {
        name: "grant-reward",
        description: "Gives every player 1 random reward from Season 1 to Chapter 2 Season 2 (12.41) as a giftbox",
        options: []
    },
    execute: async (interaction) => {
        await interaction.deferReply({ ephemeral: true });
        if (!config.moderators.includes(interaction.user.id)) {
            return interaction.editReply({ content: "You do not have moderator permissions.", ephemeral: true });
        }
        try {
            const battlePassDir = path.join(__dirname, "../../../responses/Athena/BattlePass");
            const allRewards = [];
            const seasons = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
            log.debug("Loading battle pass rewards...");
            for (const season of seasons) {
                const seasonFile = path.join(battlePassDir, `Season${season}.json`);
                if (fs.existsSync(seasonFile)) {
                    try {
                        const battlePass = destr(fs.readFileSync(seasonFile, 'utf8'));
                        if (battlePass.paidRewards && Array.isArray(battlePass.paidRewards)) {
                            for (const tier of battlePass.paidRewards) {
                                if (tier && typeof tier === 'object') {
                                    for (const [itemId, quantity] of Object.entries(tier)) {
                                        if (itemId && quantity > 0) {
                                            if (!itemId.includes('Token:') && 
                                                !itemId.includes('AccountResource:') &&
                                                !itemId.includes('ChallengeBundleSchedule:')) {
                                                allRewards.push({
                                                    itemId: itemId,
                                                    quantity: quantity,
                                                    season: season
                                                });
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        if (battlePass.freeRewards && Array.isArray(battlePass.freeRewards)) {
                            for (const tier of battlePass.freeRewards) {
                                if (tier && typeof tier === 'object') {
                                    for (const [itemId, quantity] of Object.entries(tier)) {
                                        if (itemId && quantity > 0) {
                                            if (!itemId.includes('Token:') && 
                                                !itemId.includes('AccountResource:') &&
                                                !itemId.includes('ChallengeBundleSchedule:')) {
                                                allRewards.push({
                                                    itemId: itemId,
                                                    quantity: quantity,
                                                    season: season
                                                });
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    } catch (error) {
                        log.error(`Error loading Season ${season}:`, error);
                    }
                }
            }
            if (allRewards.length === 0) {
                return interaction.editReply({ content: "No rewards found in battle pass files.", ephemeral: true });
            }
            log.debug(`Loaded ${allRewards.length} total rewards from battle passes`);
            const allUsers = await Users.find({ banned: false }).lean();
            if (allUsers.length === 0) {
                return interaction.editReply({ content: "No users found in the database.", ephemeral: true });
            }
            log.debug(`Processing ${allUsers.length} users...`);
            const allItemsFile = path.join(__dirname, "../../../Config/DefaultProfiles/allathena.json");
            const allItems = destr(fs.readFileSync(allItemsFile, 'utf8'));
            const items = allItems.items || {};
            let successCount = 0;
            let failCount = 0;
            let skippedCount = 0;
            for (const user of allUsers) {
                try {
                    const profile = await Profiles.findOne({ accountId: user.accountId });
                    if (!profile) {
                        failCount++;
                        continue;
                    }
                    const randomReward = allRewards[Math.floor(Math.random() * allRewards.length)];
                    let cosmetic = null;
                    let foundItemKey = null;
                    if (items[randomReward.itemId]) {
                        foundItemKey = randomReward.itemId;
                        cosmetic = items[randomReward.itemId];
                    } else {
                        const rewardIdParts = randomReward.itemId.split(':');
                        if (rewardIdParts.length > 1) {
                            const rewardId = rewardIdParts[1];
                            for (const key of Object.keys(items)) {
                                const keyParts = key.split(':');
                                if (keyParts.length > 1 && keyParts[1] === rewardId) {
                                    foundItemKey = key;
                                    cosmetic = items[key];
                                    break;
                                }
                            }
                            if (!cosmetic) {
                                for (const key of Object.keys(items)) {
                                    if (key.includes(rewardId) || rewardId.includes(key.split(':')[1])) {
                                        foundItemKey = key;
                                        cosmetic = items[key];
                                        break;
                                    }
                                }
                            }
                        }
                    }
                    if (!cosmetic) {
                        log.debug(`Could not find cosmetic data for ${randomReward.itemId}, skipping user ${user.username}`);
                        skippedCount++;
                        continue;
                    }
                    if (profile.profiles.athena.items[foundItemKey]) {
                        log.debug(`User ${user.username} already has ${randomReward.itemId}, skipping`);
                        skippedCount++;
                        continue;
                    }
                    const common_core = profile.profiles["common_core"];
                    const athena = profile.profiles["athena"];
                    const purchaseId = uuid.v4();
                    const lootList = [{
                        "itemType": cosmetic.templateId,
                        "itemGuid": cosmetic.templateId,
                        "quantity": randomReward.quantity || 1
                    }];
                    common_core.items[purchaseId] = {
                        "templateId": `GiftBox:GB_MakeGood`,
                        "attributes": {
                            "fromAccountId": `[Random Battle Pass Reward]`,
                            "lootList": lootList,
                            "params": {
                                "userMessage": `Random reward from Season ${randomReward.season}!`
                            },
                            "giftedOn": new Date().toISOString()
                        },
                        "quantity": 1
                    };
                    athena.items[foundItemKey] = cosmetic;
                    common_core.rvn++;
                    common_core.commandRevision++;
                    common_core.updated = new Date().toISOString();
                    athena.rvn++;
                    athena.commandRevision++;
                    athena.updated = new Date().toISOString();
                    await Profiles.updateOne(
                        { accountId: user.accountId },
                        { 
                            $set: { 
                                'profiles.common_core': common_core, 
                                'profiles.athena': athena 
                            } 
                        }
                    );
                    successCount++;
                    log.debug(`Gave random reward to ${user.username}: ${randomReward.itemId} from Season ${randomReward.season}`);
                } catch (error) {
                    log.error(`Error processing user ${user.username}:`, error);
                    failCount++;
                }
            }
            const embed = new MessageEmbed()
                .setTitle("Random Rewards Distributed")
                .setDescription(
                    `**Total Users:** ${allUsers.length}\n` +
                    `**✅ Success:** ${successCount}\n` +
                    `**⏭️ Skipped:** ${skippedCount}\n` +
                    `**❌ Failed:** ${failCount}\n\n` +
                    `Rewards were randomly selected from Season 2-12 battle passes and sent as giftboxes.`
                )
                .setColor("GREEN")
                .setFooter({
                    text: "Vortyx",
                    iconURL: "https://i.imgur.com/VKPcwAJ.png"
                })
                .setTimestamp();
            await interaction.editReply({ embeds: [embed], ephemeral: true });
            log.debug(`Random reward distribution completed: ${successCount} success, ${skippedCount} skipped, ${failCount} failed`);
        } catch (error) {
            log.error("Error in giverandomreward command:", error);
            await interaction.editReply({ content: "An unexpected error occurred while distributing rewards.", ephemeral: true });
        }
    }
};
