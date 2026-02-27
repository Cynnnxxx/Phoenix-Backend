const User = require("../../../model/user.js");
const Blacklist = require("../../../model/blacklist.js");
const fs = require("fs");
const config = JSON.parse(fs.readFileSync("./Config/config.json").toString());
module.exports = {
    commandInfo: {
        name: "unban",
        description: "Remove a user's ban status from the service",
        options: [
            {
                name: "user",
                description: "The user to unban",
                required: true,
                type: 6
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
        const targetUser = await User.findOne({ discordId: selectedUserId });
        if (!targetUser) return interaction.editReply({ content: "That user does not have an account", ephemeral: true });
        else if (!targetUser.banned) return interaction.editReply({ content: "This user is not currently banned.", ephemeral: true });
        await targetUser.updateOne({ $set: { banned: false } });
        interaction.editReply({ content: `unbanned ${targetUser.username}`, ephemeral: true });
    }
}