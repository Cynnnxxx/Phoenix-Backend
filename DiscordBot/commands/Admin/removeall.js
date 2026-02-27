const { MessageEmbed } = require("discord.js");
const path = require("path");
const fs = require("fs");
const Users = require('../../../model/user.js');
const Profiles = require('../../../model/profiles.js');
const log = require("../../../structs/log.js");
const destr = require("destr");
const config = require('../../../Config/config.json')
module.exports = {
    commandInfo: {
        name: "removeall",
        description: "allows you to remove all cosmetics from a nigga.",
        options: [
            {
                name: "nigga",
                description: "the nigga you want to remove all cosmetics from",
                required: true,
                type: 6
            }
        ]
    },
    execute: async (interaction) => {
        if (!config.moderators.includes(interaction.user.id)) 
            return interaction.reply({ content: "you do not have moderator permissions.", ephemeral: true });
        await interaction.deferReply({ ephemeral: true });
        const selectedUser = interaction.options.getUser('nigga');
        const selectedUserId = selectedUser?.id;
        try {
            const targetUser = await Users.findOne({ discordId: selectedUserId });
            if (!targetUser) 
                return interaction.editReply({ content: "that nigga does not own an account" });
            const profile = await Profiles.findOne({ accountId: targetUser.accountId });
            if (!profile) 
                return interaction.editReply({ content: "that nigga does not have a profile" });
            const allItems = destr(fs.readFileSync(path.join(__dirname, "../../../Config/DefaultProfiles/athena.json"), 'utf8'));
            if (!allItems) 
                return interaction.editReply({ content: "failed to parse athena.json" });
            Profiles.findOneAndUpdate({ accountId: targetUser.accountId }, { $set: { "profiles.athena.items": allItems.items } }, { new: true }, (err, doc) => {
                if (err) 
                    return interaction.editReply({ content: "there was an error updating the profile." });
            });
            const embed = new MessageEmbed()
                .setTitle("locker removed")
                .setDescription("removed all skins from the selected account")
                .setColor("GREEN")
                .setFooter({
                    text: "Vortyx",
                    iconURL: "https://i.imgur.com/VKPcwAJ.png"
                })
                .setTimestamp();
            await interaction.editReply({ embeds: [embed], ephemeral: true });
        } catch (error) {
            log.error("an error occurred:", error);
            interaction.editReply({ content: "an error occurred while processing the request." });
        }
    }
};