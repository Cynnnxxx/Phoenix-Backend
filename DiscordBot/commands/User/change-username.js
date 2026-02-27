const { MessageEmbed } = require("discord.js");
const User = require("../../../model/user.js");
const Badwords = require("bad-words");
const functions = require("../../../structs/functions.js");
const badwords = new Badwords();
module.exports = {
    commandInfo: {
        name: "change-username",
        description: "change your username.",
        options: [
            {
                name: "username",
                description: "your new username.",
                required: true,
                type: 3
            }
        ]
    },
    execute: async (interaction) => {
        await interaction.deferReply({ ephemeral: true });
        const user = await User.findOne({ discordId: interaction.user.id });
        if (!user)
            return interaction.editReply({ content: "you are not registered!", ephemeral: true });
        const username = interaction.options.getString('username');
        if (badwords.isProfane(username)) {
            return interaction.editReply({ content: "invalid username. username must not contain inappropriate language." });
        }
        const existingUser = await User.findOne({ username: username });
        if (existingUser) {
            return interaction.editReply({ content: "username already exists. please choose a different one.", ephemeral: true });
        }
        if (username.length >= 25) {
            return interaction.editReply({ content: "your username must be less than 25 characters long.", ephemeral: true });
        }
        if (username.length < 3) {
            return interaction.editReply({ content: "your username must be at least 3 characters long.", ephemeral: true });
        }
        await user.updateOne({ $set: { username: username, username_lower: username.toLowerCase() } });
        const refreshTokenIndex = global.refreshTokens.findIndex(i => i.accountId == user.accountId);
        if (refreshTokenIndex != -1) global.refreshTokens.splice(refreshTokenIndex, 1);
        const accessTokenIndex = global.accessTokens.findIndex(i => i.accountId == user.accountId);
        if (accessTokenIndex != -1) {
            global.accessTokens.splice(accessTokenIndex, 1);
            const xmppClient = global.Clients.find(client => client.accountId == user.accountId);
            if (xmppClient) xmppClient.client.close();
        }
        if (accessTokenIndex != -1 || refreshTokenIndex != -1) {
            await functions.UpdateTokens();
        }
        console.log(`username changed: Discord User ${interaction.user.tag} (ID: ${interaction.user.id}) changed their username to "${username}"`);
        const embed = new MessageEmbed()
            .setTitle("changed username")
            .setDescription(`your account username has been changed to **${username}**.`)
            .setColor("GREEN")
            .setFooter({
                text: "Vortyx",
                iconURL: "https://i.imgur.com/VKPcwAJ.png",
            })
            .setTimestamp();
        await interaction.editReply({ embeds: [embed], ephemeral: true });
    }
};