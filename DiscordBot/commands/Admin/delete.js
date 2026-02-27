const { MessageEmbed } = require("discord.js");
const fs = require("fs");
const path = require("path");
const Users = require('../../../model/user.js');
const Profiles = require('../../../model/profiles.js');
const Friends = require('../../../model/friends.js');
const log = require("../../../structs/log.js");
const config = require('../../../Config/config.json');
module.exports = {
    commandInfo: {
        name: "delete",
        description: "deletes a user's account",
        options: [
           {
                name: "user",
                description: "This command is used if you want to PERMANETLY delete your account",
                required: true,
                type: 6
            },
        ]
    },
    execute: async (interaction) => {
        await interaction.deferReply({ ephemeral: true });
        if (!config.moderators.includes(interaction.user.id)) 
            return interaction.editReply({ content: "you do not have moderator permissions.", ephemeral: true });
        const selectedUser = interaction.options.getUser('user');
        const selectedUserId = selectedUser?.id;
        const deleteAccount = await Users.findOne({ discordId: selectedUserId });
        if (!deleteAccount) 
            return interaction.editReply({ content: "that user does not own an account", ephemeral: true });
        const accountId = deleteAccount.accountId;
        const username = deleteAccount.username;
        let somethingDeleted = false;
        await Users.deleteOne({ accountId: accountId }).then(() => {
            somethingDeleted = true;
        }).catch(error => {
            log.error('error deleting from users:', error);
        });
        await Profiles.deleteOne({ accountId: accountId }).then(() => {
            somethingDeleted = true;
        }).catch(error => {
            log.error('error deleting from profiles:', error);
        });
        await Friends.deleteOne({ accountId: accountId }).then(() => {
            somethingDeleted = true;
        }).catch(error => {
            log.error('error deleting from friends:', error);
        });
        const clientSettingsPath = path.join(__dirname, '../../../ClientSettings', accountId);
        if (fs.existsSync(clientSettingsPath)) {
            fs.rmSync(clientSettingsPath, { recursive: true, force: true });
            somethingDeleted = true;
        }
        if (!somethingDeleted) {
            await interaction.editReply({ content: `no data found to delete for **${username}**.`, ephemeral: true });
            return;
        }
        const embed = new MessageEmbed()
            .setTitle("account deleted")
            .setDescription(`**deleted** **${username}**'s account`)
            .setColor("GREEN")
            .setFooter({
                text: "Vortyx",
                iconURL: "https://i.imgur.com/VKPcwAJ.png"
            })
            .setTimestamp();
        await interaction.editReply({ embeds: [embed], ephemeral: true });
        try {
            const user = await interaction.client.users.fetch(deleteAccount.discordId);
            if (user) {
                await user.send({ content: `your account has been deleted by <@${interaction.user.id}>, appeal by direct messaging the owner (@nurofenmax)` });
            }
        } catch (error) {
            log.error('could not send DM:', error);
        }
    }
};