const Users = require('../../../model/user.js');
const Profiles = require('../../../model/profiles.js');
const config = require('../../../Config/config.json');
const functions = require('../../../structs/functions.js');
const uuid = require("uuid");
const { MessageEmbed } = require("discord.js");
module.exports = {
    commandInfo: {
        name: "hype-remove",
        description: "lets you deduct hype (arena points) from a player",
        options: [
            {
                name: "nigga",
                description: "the user you want to change the hype of",
                required: true,
                type: 6
            },
            {
                name: "hype",
                description: "the amount of hype you want to deduct",
                required: true,
                type: 4
            }
        ]
    },
    execute: async (interaction) => {
        await interaction.deferReply({ ephemeral: true });
        if (!config.moderators.includes(interaction.user.id)) 
            return interaction.editReply({ content: "you do not have moderator permissions.", ephemeral: true });
        const selectedUser = interaction.options.getUser('nigga');
        const selectedUserId = selectedUser?.id;
        const user = await Users.findOne({ discordId: selectedUserId });
        if (!user) 
            return interaction.editReply({ content: "that nigga does not own an account", ephemeral: true });
        const hype = parseInt(interaction.options.getInteger('hype'));
        if (isNaN(hype) || hype === 0) 
            return interaction.editReply({ content: "invalid hype amount specified.", ephemeral: true });
        for (let i = 0; i < hype; i++) 
            await functions.deductHypePoints(user);
        const totalPoints = await functions.calculateTotalHypePoints(user);
        if (isNaN(totalPoints)) 
            return interaction.editReply({ content: "error calculating updated hype points.", ephemeral: true });
        const embed = new MessageEmbed()
            .setTitle("deducted points")
            .setDescription(`deducted **${hype}** points from <@${selectedUserId}>, updated points: ${totalPoints}`)
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