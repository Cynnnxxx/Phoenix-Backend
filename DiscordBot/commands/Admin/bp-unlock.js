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
        name: "bp-unlock",
        description: "Gives a user a complete battle pass from Season 1 to Chapter 2 Season 2 (12.41) with all skins",
        options: [
            {
                name: "user",
                description: "the user you want to give the battle pass to",
                required: true,
                type: 6
            },
            {
                name: "season",
                description: "the season number (1-12)",
                required: true,
                type: 4,
                choices: [
                    { name: "Season 1", value: 1 },
                    { name: "Season 2", value: 2 },
                    { name: "Season 3", value: 3 },
                    { name: "Season 4", value: 4 },
                    { name: "Season 5", value: 5 },
                    { name: "Season 6", value: 6 },
                    { name: "Season 7", value: 7 },
                    { name: "Season 8", value: 8 },
                    { name: "Season 9", value: 9 },
                    { name: "Season 10", value: 10 },
                    { name: "Season 11", value: 11 },
                    { name: "Chapter 2 Season 2 (12.41)", value: 12 }
                ]
            }
        ]
    },
    execute: async (interaction) => {
        await interaction.deferReply({ ephemeral: true });
        if (!config.moderators.includes(interaction.user.id)) {
            return interaction.editReply({ content: "you do not have moderator permissions.", ephemeral: true });
        }
        const selectedUser = interaction.options.getUser('user');
        const selectedUserId = selectedUser.id;
        const season = interaction.options.getInteger('season');
        try {
            const user = await Users.findOne({ discordId: selectedUserId });
            if (!user) {
                return interaction.editReply({ content: "that user does not own an account", ephemeral: true });
            }
            const profile = await Profiles.findOne({ accountId: user.accountId });
            if (!profile) {
                return interaction.editReply({ content: "that user does not have a profile", ephemeral: true });
            }
            const battlePassDir = path.join(__dirname, "../../../responses/Athena/BattlePass");
            let seasonFile;
            if (season === 1) {
                seasonFile = path.join(battlePassDir, `Season2.json`);
                log.debug("Season 1 doesn't exist, using Season 2 instead");
            } else {
                seasonFile = path.join(battlePassDir, `Season${season}.json`);
            }
            if (!fs.existsSync(seasonFile)) {
                return interaction.editReply({ content: `Battle pass file for Season ${season} not found.`, ephemeral: true });
            }
            const battlePass = destr(fs.readFileSync(seasonFile, 'utf8'));
            const allRewards = [];
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
                                        quantity: quantity
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
                                        quantity: quantity
                                    });
                                }
                            }
                        }
                    }
                }
            }
            if (allRewards.length === 0) {
                return interaction.editReply({ content: `No rewards found in Season ${season} battle pass.`, ephemeral: true });
            }
            log.debug(`Found ${allRewards.length} rewards in Season ${season} battle pass`);
            const allItemsFile = path.join(__dirname, "../../../Config/DefaultProfiles/allathena.json");
            const allItems = destr(fs.readFileSync(allItemsFile, 'utf8'));
            const items = allItems.items || {};
            const common_core = profile.profiles["common_core"];
            const athena = profile.profiles["athena"];
            const lootList = [];
            let addedCount = 0;
            let skippedCount = 0;
            let notFoundCount = 0;
            for (const reward of allRewards) {
                let cosmetic = null;
                let foundItemKey = null;
                if (items[reward.itemId]) {
                    foundItemKey = reward.itemId;
                    cosmetic = items[reward.itemId];
                } else {
                    const rewardIdParts = reward.itemId.split(':');
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
                    log.debug(`Could not find cosmetic data for ${reward.itemId}`);
                    notFoundCount++;
                    continue;
                }
                if (athena.items[foundItemKey]) {
                    log.debug(`User already has ${reward.itemId}, skipping`);
                    skippedCount++;
                    continue;
                }
                athena.items[foundItemKey] = cosmetic;
                lootList.push({
                    "itemType": cosmetic.templateId,
                    "itemGuid": cosmetic.templateId,
                    "quantity": reward.quantity || 1
                });
                addedCount++;
            }
            if (addedCount === 0) {
                return interaction.editReply({ 
                    content: `No new items to add. User may already have all items from Season ${season}, or items could not be found.`, 
                    ephemeral: true 
                });
            }
            const purchaseId = uuid.v4();
            common_core.items[purchaseId] = {
                "templateId": `GiftBox:GB_MakeGood`,
                "attributes": {
                    "fromAccountId": `[${interaction.user.username}]`,
                    "lootList": lootList,
                    "params": {
                        "userMessage": `Complete Battle Pass from Season ${season === 1 ? '1 (using Season 2)' : season}! Enjoy all ${addedCount} rewards!`
                    },
                    "giftedOn": new Date().toISOString()
                },
                "quantity": 1
            };
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
            const embed = new MessageEmbed()
                .setTitle("Battle Pass Gifted")
                .setDescription(
                    `**User:** ${selectedUser.username}\n` +
                    `**Season:** ${season === 1 ? 'Season 1 (using Season 2)' : `Season ${season}`}\n` +
                    `**✅ Items Added:** ${addedCount}\n` +
                    `**⏭️ Already Owned:** ${skippedCount}\n` +
                    `**❌ Not Found:** ${notFoundCount}\n\n` +
                    `All items have been added to their locker and sent as a giftbox!`
                )
                .setColor("GREEN")
                .setFooter({
                    text: "Vortyx",
                    iconURL: "https://i.imgur.com/VKPcwAJ.png"
                })
                .setTimestamp();
            await interaction.editReply({ embeds: [embed], ephemeral: true });
            log.debug(`Gave Season ${season} battle pass to ${user.username}: ${addedCount} items added, ${skippedCount} skipped, ${notFoundCount} not found`);
        } catch (error) {
            log.error("Error in givebattlepass command:", error);
            await interaction.editReply({ content: "An unexpected error occurred while giving the battle pass.", ephemeral: true });
        }
    }
};
