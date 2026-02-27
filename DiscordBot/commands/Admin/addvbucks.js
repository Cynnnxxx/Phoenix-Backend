const Users = require('../../../model/user');
const Profiles = require('../../../model/profiles');
const config = require('../../../Config/config.json');
const uuid = require("uuid");
const { MessageEmbed } = require("discord.js");
module.exports = {
    commandInfo: {
        name: "addvbucks",
        description: "Modify a user's V-Bucks balance. Use negative values to deduct.",
        options: [
            {
                name: "user",
                description: "The user whose V-Bucks balance to modify",
                required: true,
                type: 6
            },
            {
                name: "vbucks",
                description: "Amount of V-Bucks to add (use negative to deduct)",
                required: true,
                type: 4
            }
        ]
    },
    execute: async (interaction) => {
        await interaction.deferReply({ ephemeral: true });
        if (!config.moderators.includes(interaction.user.id)) {
            return interaction.editReply({ content: "You do not have moderator permissions.", ephemeral: true });
        }
        const selectedUser = interaction.options.getUser('nigga');
        const selectedUserId = selectedUser?.id;
        const user = await Users.findOne({ discordId: selectedUserId });
        if (!user) {
            return interaction.editReply({ content: "that nigga does not own an account", ephemeral: true });
        }
        const vbucks = parseInt(interaction.options.getInteger('vbucks'));
        if (isNaN(vbucks) || vbucks === 0) {
            return interaction.editReply({ content: "Invalid V-Bucks amount specified.", ephemeral: true });
        }
        const filter = { accountId: user.accountId };
        const updateCommonCore = { $inc: { 'profiles.common_core.items.Currency:MtxPurchased.quantity': vbucks } };
        const updateProfile0 = { $inc: { 'profiles.profile0.items.Currency:MtxPurchased.quantity': vbucks } };
        const options = { new: true };
        const updatedProfile = await Profiles.findOneAndUpdate(filter, updateCommonCore, options);
        if (!updatedProfile) {
            return interaction.editReply({ content: "that nigga does not own an account", ephemeral: true });
        }
        await Profiles.updateOne(filter, updateProfile0);
        const common_core = updatedProfile.profiles["common_core"];
        const profile0 = updatedProfile.profiles["profile0"];
        const newQuantityCommonCore = common_core.items['Currency:MtxPurchased'].quantity;
        const newQuantityProfile0 = profile0.items['Currency:MtxPurchased'].quantity + vbucks;
        if (newQuantityCommonCore < 0 || newQuantityCommonCore >= 1000000) {
            return interaction.editReply({
                content: "V-Bucks amount is out of valid range after the update.",
                ephemeral: true
            });
        }
        const purchaseId = uuid.v4();
        const lootList = [{
            "itemType": "Currency:MtxGiveaway",
            "itemGuid": "Currency:MtxGiveaway",
            "quantity": vbucks
        }];
        common_core.items[purchaseId] = {
            "templateId": `GiftBox:GB_MakeGood`,
            "attributes": {
                "fromAccountId": `[Administrator]`,
                "lootList": lootList,
                "params": {
                    "userMessage": `Have a great day, thanks for playing Vortyx!`
                },
                "giftedOn": new Date().toISOString()
            },
            "quantity": 1
        };
        let ApplyProfileChanges = [
            {
                "changeType": "itemQuantityChanged",
                "itemId": "Currency:MtxPurchased",
                "quantity": newQuantityCommonCore
            },
            {
                "changeType": "itemQuantityChanged",
                "itemId": "Currency:MtxPurchased",
                "quantity": newQuantityProfile0
            },
            {
                "changeType": "itemAdded",
                "itemId": purchaseId,
                "templateId": "GiftBox:GB_MakeGood"
            }
        ];
        common_core.rvn += 1;
        common_core.commandRevision += 1;
        common_core.updated = new Date().toISOString();
        await Profiles.updateOne(filter, {
            $set: {
                'profiles.common_core': common_core,
                'profiles.profile0.items.Currency:MtxPurchased.quantity': newQuantityProfile0
            }
        });
        const embed = new MessageEmbed()
            .setTitle("added vbucks")
            .setDescription(`added **${vbucks}** vbux to <@${selectedUserId}>`)
            .setThumbnail("https://i.imgur.com/yLbihQa.png")
            .setColor("GREEN")
            .setFooter({
                text: "Vortyx",
                iconURL: "https://imgur.com/nVt67YD"
            })
            .setTimestamp();
        await interaction.editReply({ embeds: [embed], ephemeral: true });
        return {
            profileRevision: common_core.rvn,
            profileCommandRevision: common_core.commandRevision,
            profileChanges: ApplyProfileChanges,
            newQuantityCommonCore,
            newQuantityProfile0
        };
    }
};