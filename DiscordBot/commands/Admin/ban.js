const User = require("../../../model/user.js");
const Blacklist = require("../../../model/blacklist.js");
const functions = require("../../../structs/functions.js");
const anticheatSystem = require("../../../structs/anticheat.js");
const fs = require("fs");
const config = JSON.parse(fs.readFileSync("./Config/config.json").toString());
module.exports = {
    commandInfo: {
        name: "ban",
        description: "Ban a user from the service using their Discord account",
        options: [
             {
                name: "user",
                description: "The user to ban from the service",
                required: true,
                type: 6
            }
        ]
    },
    execute: async (interaction) => {
        await interaction.deferReply({ ephemeral: true });
        if (!config.moderators.includes(interaction.user.id)) return interaction.editReply({ content: "You do not have moderator permissions.", ephemeral: true });
        const selectedUser = interaction.options.getUser("user");
        const selectedUserId = selectedUser?.id;
        const targetUser = await User.findOne({ discordId: selectedUserId });
        if (!targetUser) return interaction.editReply({ content: "That user does not have an account", ephemeral: true });
        else if (targetUser.banned) return interaction.editReply({ content: "This user is already banned", ephemeral: true });
        await targetUser.updateOne({ $set: { banned: true } });
        await Blacklist.findOneAndUpdate(
            { discordId: selectedUserId },
            { $set: { reason: "Banned (cheater)", addedBy: interaction.user.tag, addedAt: new Date() } },
            { upsert: true }
        );
        let refreshToken = global.refreshTokens.findIndex(i => i.accountId == targetUser.accountId);
        if (refreshToken != -1) global.refreshTokens.splice(refreshToken, 1);
        let accessToken = global.accessTokens.findIndex(i => i.accountId == targetUser.accountId);
        if (accessToken != -1) {
            global.accessTokens.splice(accessToken, 1);
            let xmppClient = global.Clients.find(client => client.accountId == targetUser.accountId);
            if (xmppClient) xmppClient.client.close();
        }
        if (accessToken != -1 || refreshToken != -1) functions.UpdateTokens();
        anticheatSystem.sendBanAlert(
            targetUser.username,
            targetUser.accountId,
            "Banned via /ban (cheater)",
            interaction.user.tag,
            "permanent"
        );
        interaction.editReply({ content: `successfully banned **${targetUser.username}**. Discord ID added to blacklist (cannot create new account).`, ephemeral: true });
    }
}