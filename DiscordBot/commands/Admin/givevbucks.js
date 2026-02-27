const Users = require('../../../model/user');
const Profiles = require('../../../model/profiles');
const config = require('../../../Config/config.json');
const uuid = require("uuid");
const { MessageEmbed } = require("discord.js");

module.exports = {
    commandInfo: {
        name: "givevbucks",
        description: "Give V-Bucks to a user by their in-game username. Sends as a gift box with a custom message.",
        options: [
            {
                name: "username",
                description: "The in-game username of the player to give V-Bucks to",
                required: true,
                type: 3
            },
            {
                name: "amount",
                description: "Amount of V-Bucks to give",
                required: true,
                type: 4
            },
            {
                name: "sender",
                description: "Name to show in the gift message (e.g. Cynx, Yeah). Defaults to your Discord username.",
                required: false,
                type: 3
            }
        ]
    },
    execute: async (interaction) => {
        await interaction.deferReply({ ephemeral: true });
        if (!config.moderators.includes(interaction.user.id)) {
            return interaction.editReply({ content: "You do not have moderator permissions.", ephemeral: true });
        }

        const username = (interaction.options.getString('username') || '').trim();
        const vbucks = parseInt(interaction.options.getInteger('amount'));
        const senderName = (interaction.options.getString('sender') || interaction.user.username).trim();

        if (!username) {
            return interaction.editReply({ content: "Please provide a valid in-game username.", ephemeral: true });
        }
        if (isNaN(vbucks) || vbucks <= 0) {
            return interaction.editReply({ content: "Please provide a valid positive V-Bucks amount.", ephemeral: true });
        }

        const user = await Users.findOne({ username: username }) ||
            await Users.findOne({ username_lower: username.toLowerCase() });
        if (!user) {
            return interaction.editReply({ content: `User **${username}** was not found.`, ephemeral: true });
        }

        const filter = { accountId: user.accountId };
        const updateCommonCore = { $inc: { 'profiles.common_core.items.Currency:MtxPurchased.quantity': vbucks } };
        const updateProfile0 = { $inc: { 'profiles.profile0.items.Currency:MtxPurchased.quantity': vbucks } };
        const options = { new: true };
        const updatedProfile = await Profiles.findOneAndUpdate(filter, updateCommonCore, options);
        if (!updatedProfile) {
            return interaction.editReply({ content: "Profile not found for this user.", ephemeral: true });
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

        const giftMessage = `Congratulations! You got ${vbucks.toLocaleString()} V-Bucks from ${senderName}!`;

        common_core.items[purchaseId] = {
            "templateId": `GiftBox:GB_MakeGood`,
            "attributes": {
                "fromAccountId": `[${senderName}]`,
                "lootList": lootList,
                "params": {
                    "userMessage": giftMessage
                },
                "giftedOn": new Date().toISOString()
            },
            "quantity": 1
        };

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
            .setTitle("V-Bucks Gift Sent")
            .setDescription(`Successfully sent **${vbucks.toLocaleString()}** V-Bucks to **${user.username}** as a gift box!\n\nMessage: *"${giftMessage}"*`)
            .setThumbnail("https://i.imgur.com/yLbihQa.png")
            .setColor("GREEN")
            .setFooter({
                text: "Vortyx",
                iconURL: "https://imgur.com/nVt67YD"
            })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed], ephemeral: true });
    }
};
