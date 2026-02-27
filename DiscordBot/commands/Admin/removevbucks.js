const Users = require('../../../model/user');
const Profiles = require('../../../model/profiles');
const config = require('../../../Config/config.json');
const { MessageEmbed } = require('discord.js');
module.exports = {
    commandInfo: {
        name: "removevbucks",
        description: "Remove V-Bucks from a user's account",
        options: [
            {
                name: "user",
                description: "The user to remove V-Bucks from",
                required: true,
                type: 6
            },
            {
                name: "amount",
                description: "The amount of V-Bucks to remove",
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
        const selectedUser = interaction.options.getUser('user');
        const selectedUserId = selectedUser?.id;
        const user = await Users.findOne({ discordId: selectedUserId });
        if (!user) {
            return interaction.editReply({ content: "That user does not have an account", ephemeral: true });
        }
        const vbucks = parseInt(interaction.options.getInteger('amount'));
        if (isNaN(vbucks) || vbucks === 0) {
            return interaction.editReply({ content: "invalid vbux amount specified.", ephemeral: true });
        }
        const filter = { accountId: user.accountId };
        const updateCommonCore = { $inc: { 'profiles.common_core.items.Currency:MtxPurchased.quantity': -vbucks } };
        const updateProfile0 = { $inc: { 'profiles.profile0.items.Currency:MtxPurchased.quantity': -vbucks } };
        const updatedProfile = await Profiles.findOneAndUpdate(filter, updateCommonCore, { new: true });
        if (!updatedProfile) {
            return interaction.editReply({ content: "That user does not have an account", ephemeral: true });
        }
        await Profiles.updateOne(filter, updateProfile0);
        const profile0 = updatedProfile.profiles["profile0"];
        const common_core = updatedProfile.profiles["common_core"];
        const newQuantityCommonCore = common_core.items['Currency:MtxPurchased'].quantity;
        const newQuantityProfile0 = profile0.items['Currency:MtxPurchased'].quantity;
        common_core.rvn += 1;
        common_core.commandRevision += 1;
        await Profiles.updateOne(filter, {
            $set: {
                'profiles.common_core': common_core,
                'profiles.profile0.items.Currency:MtxPurchased.quantity': newQuantityProfile0
            }
        });
        if (newQuantityCommonCore < 0 || newQuantityCommonCore >= 1000000) {
            return interaction.editReply({
                content: "amount is out of range, nigga change the amount.",
                ephemeral: true
            });
        }
        const embed = new MessageEmbed()
            .setTitle("removed vbux")
            .setDescription(`removed **${vbucks}** vbux from <@${selectedUserId}>`)
            .setThumbnail("https://i.imgur.com/yLbihQa.png")
            .setColor("GREEN")
            .setFooter({
                text: "Vortyx",
                iconURL: "https://i.imgur.com/VKPcwAJ.png"
            })
            .setTimestamp();
        await interaction.editReply({ embeds: [embed], ephemeral: true });
        return {
            profileRevision: common_core.rvn,
            profileCommandRevision: common_core.commandRevision,
            newQuantityCommonCore,
            newQuantityProfile0
        };
    }
};