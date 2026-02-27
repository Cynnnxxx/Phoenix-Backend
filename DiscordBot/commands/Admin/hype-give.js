const Users = require('../../../model/user');
const Profiles = require('../../../model/profiles');
const config = require('../../../Config/config.json');
const functions = require('../../../structs/functions.js');
const uuid = require("uuid");
const { MessageEmbed } = require("discord.js");
module.exports = {
    commandInfo: {
        name: "hype-give",
        description: "Awards Hype (Arena Points) to a specified user. Requires moderator permissions.",
        options: [
            {
                name: "user",
                description: "The target user to receive Hype points",
                required: true,
                type: 6
            },
            {
                name: "hype",
                description: "Amount of Hype points to award (1 unit = 20 points)",
                required: true,
                type: 4
            }
        ]
    },
    execute: async (interaction) => {
        await interaction.deferReply({ ephemeral: true });
        if (!config.moderators.includes(interaction.user.id)) {
            return interaction.editReply({ content: "you do not have moderator permissions.", ephemeral: true });
        }
        const selectedUser = interaction.options.getUser('user');
        const selectedUserId = selectedUser?.id;
        const user = await Users.findOne({ discordId: selectedUserId });
        if (!user) {
            return interaction.editReply({ content: "That user does not own an account", ephemeral: true });
        }
        const hype = parseInt(interaction.options.getInteger('hype'));
        if (isNaN(hype) || hype === 0) {
            return interaction.editReply({ content: "invalid hype amount specified.", ephemeral: true });
        }
        for (let i = 0; i < hype; i++)
            await functions.addEliminationHypePoints(user);
        const totalPoints = await functions.calculateTotalHypePoints(user);
        if (isNaN(totalPoints))
            return interaction.editReply({ content: "error calculating updated hype points.", ephemeral: true });
        const embed = new MessageEmbed()
            .setTitle("added points")
            .setDescription(`added **${hype}** points to <@${selectedUserId}>, updated points: ${totalPoints}`)
            .setThumbnail("https://i.imgur.com/zBvLCRx.png")
            .setColor("GREEN")
            .setFooter({
                text: "Vortyx",
                iconURL: "https://imgur.com/nVt67YD"
            })
            .setTimestamp();
        await interaction.editReply({ embeds: [embed], ephemeral: true });
    }
};