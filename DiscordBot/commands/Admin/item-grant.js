const Users = require('../../../model/user.js');
const Profiles = require('../../../model/profiles.js');
const fs = require('fs');
const path = require('path');
const destr = require('destr');
const config = require('../../../Config/config.json');
const uuid = require("uuid");
const log = require("../../../structs/log.js");
const { MessageEmbed } = require('discord.js');

// Helper function to search for cosmetic by ID in a JSON file
function findCosmeticById(items, searchId) {
    // Try exact match first (e.g., "AthenaCharacter:Character_Believer_Vortyx")
    if (items[searchId]) {
        return { key: searchId, cosmetic: items[searchId] };
    }
    
    // Try partial match (e.g., "Character_Believer_Vortyx" -> "AthenaCharacter:Character_Believer_Vortyx")
    for (const key of Object.keys(items)) {
        const [type, id] = key.split(":");
        // Match by full ID or partial ID
        if (id === searchId || key.includes(searchId) || searchId.includes(id)) {
            return { key, cosmetic: items[key] };
        }
    }
    
    return null;
}

// Helper function to search in both allathena.json and allchaos.json
async function findCosmeticInFiles(searchId) {
    try {
        // Search in allathena.json
        const allathenaFile = fs.readFileSync(path.join(__dirname, "../../../Config/DefaultProfiles/allathena.json"));
        const allathenaJson = destr(allathenaFile.toString());
        const allathenaResult = findCosmeticById(allathenaJson.items, searchId);
        if (allathenaResult) {
            return { ...allathenaResult, source: 'allathena' };
        }
        
        // Search in allchaos.json
        const allchaosFile = fs.readFileSync(path.join(__dirname, "../../../Config/DefaultProfiles/allchaos.json"));
        const allchaosJson = destr(allchaosFile.toString());
        const allchaosResult = findCosmeticById(allchaosJson.items, searchId);
        if (allchaosResult) {
            return { ...allchaosResult, source: 'allchaos' };
        }
        
        return null;
    } catch (error) {
        log.error(`Error searching for cosmetic: ${error}`);
        return null;
    }
}

// Helper function to get cosmetic image from API or return null
async function getCosmeticImage(cosmeticId) {
    try {
        // Try to extract the ID part (e.g., "Character_Believer_Vortyx" from "AthenaCharacter:Character_Believer_Vortyx")
        const idPart = cosmeticId.includes(':') ? cosmeticId.split(':')[1] : cosmeticId;
        const response = await fetch(`https://fortnite-api.com/v2/cosmetics/br/search?id=${idPart}`);
        const json = await response.json();
        if (json.data && json.data.images && json.data.images.icon) {
            return json.data.images.icon;
        }
    } catch (error) {
        // Ignore API errors, just return null
    }
    return null;
}

module.exports = {
    commandInfo: {
        name: "item-grant",
        description: "Grants a specific cosmetic item or bundle to a user's account. Requires moderator permissions.",
        options: [
            {
                name: "user",
                description: "The target user to receive the cosmetic item",
                required: true,
                type: 6
            },
            {
                name: "type",
                description: "Choose to grant a single item or a bundle",
                required: true,
                type: 3,
                choices: [
                    { name: "Item", value: "item" },
                    { name: "Bundle", value: "bundle" }
                ]
            },
            {
                name: "cosmeticname",
                description: "Item ID (e.g. Character_Believer_Vortyx) or bundle name",
                required: true,
                type: 3
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
        const user = await Users.findOne({ discordId: selectedUserId });
        if (!user) {
            return interaction.editReply({ content: "That user does not own an account", ephemeral: true });
        }
        
        const profile = await Profiles.findOne({ accountId: user.accountId });
        if (!profile) {
            return interaction.editReply({ content: "That user does not own an account", ephemeral: true });
        }
        
        const grantType = interaction.options.getString('type');
        const cosmeticname = interaction.options.getString('cosmeticname');
        
        try {
            // Handle bundle grants
            if (grantType === "bundle") {
                const possiblePaths = [
                    path.join(__dirname, "../../../Config/bundles.json"),
                    path.join(process.cwd(), "Config", "bundles.json"),
                    path.join(process.cwd(), "Config", "bundles", "bundles.json"),
                    path.resolve(__dirname, "../../../Config/bundles.json"),
                    path.resolve(__dirname, "../../../Config/bundles/bundles.json")
                ];
                let bundlesPath = null;
                for (const p of possiblePaths) {
                    if (fs.existsSync(p)) {
                        bundlesPath = p;
                        break;
                    }
                }
                if (!bundlesPath) {
                    const searched = possiblePaths[0];
                    return interaction.editReply({
                        content: `Bundles configuration file not found. Place \`bundles.json\` in the Config folder. Path checked: \`${searched}\``,
                        ephemeral: true
                    });
                }
                
                const bundlesConfig = JSON.parse(fs.readFileSync(bundlesPath, 'utf8'));
                const bundle = bundlesConfig.bundles[cosmeticname];
                
                if (!bundle || !bundle.items || bundle.items.length === 0) {
                    return interaction.editReply({ 
                        content: `Bundle "${cosmeticname}" not found or is empty. Available bundles: ${Object.keys(bundlesConfig.bundles).join(", ")}`, 
                        ephemeral: true 
                    });
                }
                
                const common_core = profile.profiles["common_core"];
                const athena = profile.profiles["athena"];
                const lootList = [];
                const ApplyProfileChanges = [];
                const grantedItems = [];
                const skippedItems = [];
                
                // Process each item in the bundle
                for (const itemId of bundle.items) {
                    // Try to find the cosmetic in both files
                    const cosmeticData = await findCosmeticInFiles(itemId);
                    
                    if (!cosmeticData) {
                        skippedItems.push(itemId);
                        continue;
                    }
                    
                    // Check if user already has this item
                    if (profile.profiles.athena.items[cosmeticData.key]) {
                        skippedItems.push(itemId);
                        continue;
                    }
                    
                    // Add the cosmetic
                    athena.items[cosmeticData.key] = cosmeticData.cosmetic;
                    lootList.push({
                        "itemType": cosmeticData.cosmetic.templateId,
                        "itemGuid": cosmeticData.cosmetic.templateId,
                        "quantity": 1
                    });
                    ApplyProfileChanges.push({
                        "changeType": "itemAdded",
                        "itemId": cosmeticData.key,
                        "templateId": cosmeticData.cosmetic.templateId
                    });
                    grantedItems.push(itemId);
                }
                
                if (grantedItems.length === 0) {
                    return interaction.editReply({ 
                        content: `No items from bundle "${cosmeticname}" could be granted. All items may already be owned or not found.`, 
                        ephemeral: true 
                    });
                }
                
                // Create gift box
                const purchaseId = uuid.v4();
                common_core.items[purchaseId] = {
                    "templateId": `GiftBox:GB_MakeGood`,
                    "attributes": {
                        "fromAccountId": `[${interaction.user.username}]`,
                        "lootList": lootList,
                        "params": {
                            "userMessage": `Bundle: ${cosmeticname}`
                        },
                        "giftedOn": new Date().toISOString()
                    },
                    "quantity": 1
                };
                ApplyProfileChanges.push({
                    "changeType": "itemAdded",
                    "itemId": purchaseId,
                    "templateId": "GiftBox:GB_MakeGood"
                });
                
                // Update profiles
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
                    .setTitle("Bundle Gift Sent")
                    .setDescription(`Successfully granted bundle **${cosmeticname}** to ${selectedUser.username}\n\n**Granted:** ${grantedItems.length} item(s)\n${skippedItems.length > 0 ? `**Skipped:** ${skippedItems.length} item(s) (already owned or not found)` : ''}`)
                    .setColor("GREEN")
                    .setFooter({
                        text: "Vortyx",
                        iconURL: "https://i.imgur.com/VKPcwAJ.png"
                    })
                    .setTimestamp();
                
                await interaction.editReply({ embeds: [embed], ephemeral: true });
                return;
            }
            
            // Handle single item grants
            // First, try to find by ID directly (for custom skins like Character_Believer_Vortyx)
            let cosmeticData = await findCosmeticInFiles(cosmeticname);
            let cosmeticFromAPI = null;
            let cosmeticimage = null;
            
            if (!cosmeticData) {
                // If not found by ID, try API search by name
                try {
                    const apiResponse = await fetch(`https://fortnite-api.com/v2/cosmetics/br/search?name=${encodeURIComponent(cosmeticname)}`);
                    const apiJson = await apiResponse.json();
                    cosmeticFromAPI = apiJson.data;
                    
                    if (cosmeticFromAPI) {
                        cosmeticimage = cosmeticFromAPI.images?.icon;
                        // Try to find in files using API ID
                        cosmeticData = await findCosmeticInFiles(cosmeticFromAPI.id);
                    }
                } catch (apiError) {
                    // Continue without API data
                }
            } else {
                // Found by ID, try to get image
                cosmeticimage = await getCosmeticImage(cosmeticData.key);
            }
            
            if (!cosmeticData) {
                return interaction.editReply({ 
                    content: `Could not find the cosmetic "${cosmeticname}". Make sure the ID is correct (e.g., "Character_Believer_Vortyx") or the name is spelled correctly.`, 
                    ephemeral: true 
                });
            }
            
            // Check if user already has this cosmetic
            if (profile.profiles.athena.items[cosmeticData.key]) {
                return interaction.editReply({ content: "That user already has that cosmetic", ephemeral: true });
            }
            
            const cosmetic = cosmeticData.cosmetic;
            const purchaseId = uuid.v4();
            const lootList = [{
                "itemType": cosmetic.templateId,
                "itemGuid": cosmetic.templateId,
                "quantity": 1
            }];
            
            const common_core = profile.profiles["common_core"];
            const athena = profile.profiles["athena"];
            
            common_core.items[purchaseId] = {
                "templateId": `GiftBox:GB_MakeGood`,
                "attributes": {
                    "fromAccountId": `[${interaction.user.username}]`,
                    "lootList": lootList,
                    "params": {
                        "userMessage": `Have a great day, thanks for playing Vortyx!`
                    },
                    "giftedOn": new Date().toISOString()
                },
                "quantity": 1
            };
            
            athena.items[cosmeticData.key] = cosmetic;
            
            let ApplyProfileChanges = [
                {
                    "changeType": "itemAdded",
                    "itemId": cosmeticData.key,
                    "templateId": cosmetic.templateId
                },
                {
                    "changeType": "itemAdded",
                    "itemId": purchaseId,
                    "templateId": "GiftBox:GB_MakeGood"
                }
            ];
            
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
            
            const displayName = cosmeticFromAPI?.name || cosmeticname;
            const embed = new MessageEmbed()
                .setTitle("Cosmetic Gift Sent")
                .setDescription(`Successfully gave the user the cosmetic **${displayName}**\n**ID:** ${cosmeticData.key}\n**Source:** ${cosmeticData.source || 'unknown'}`)
                .setColor("GREEN")
                .setFooter({
                    text: "Vortyx",
                    iconURL: "https://i.imgur.com/VKPcwAJ.png"
                })
                .setTimestamp();
            
            if (cosmeticimage) {
                embed.setThumbnail(cosmeticimage);
            }
            
            await interaction.editReply({ embeds: [embed], ephemeral: true });
            return {
                profileRevision: common_core.rvn,
                profileCommandRevision: common_core.commandRevision,
                profileChanges: ApplyProfileChanges
            };
        } catch (err) {
            log.error(err);
            await interaction.editReply({ content: `An unexpected error occurred: ${err.message}`, ephemeral: true });
        }
    }
};
