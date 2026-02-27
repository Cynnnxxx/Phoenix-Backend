const { MessageEmbed } = require("discord.js");
const User = require("../../../model/user.js");
const Bans = require("../../../model/bans.js");
const config = require("../../../Config/config.json");

module.exports = {
    commandInfo: {
        name: "matchmake-ban",
        description: "Ban a player from matchmaking for a specified duration",
        options: [
            {
                name: "username",
                description: "The username of the player to ban",
                required: true,
                type: 3 // STRING
            },
            {
                name: "duration",
                description: "Ban duration (e.g., 1h, 24h, 7d, 30d, permanent)",
                required: true,
                type: 3 // STRING
            },
            {
                name: "reason",
                description: "Reason for the ban",
                required: false,
                type: 3 // STRING
            }
        ]
    },
    execute: async (interaction) => {
        await interaction.deferReply({ ephemeral: true });

        // Check if user has moderator permissions
        if (!config.moderators.includes(interaction.user.id)) {
            const errorEmbed = new MessageEmbed()
                .setTitle("Permission Denied")
                .setDescription("You don't have permission to use this command.")
                .setColor("#FF0000")
                .setTimestamp();

            return await interaction.editReply({ embeds: [errorEmbed] });
        }

        const username = interaction.options.getString("username");
        const duration = interaction.options.getString("duration");
        const reason = interaction.options.getString("reason") || "Matchmaking violation";

        try {
            // Find user
            const user = await User.findOne({ username_lower: username.toLowerCase() });

            if (!user) {
                const errorEmbed = new MessageEmbed()
                    .setTitle("User Not Found")
                    .setDescription(`No user found with username: **${username}**`)
                    .setColor("#FF0000")
                    .setTimestamp();

                return await interaction.editReply({ embeds: [errorEmbed] });
            }

            // Check if already banned
            const existingBan = await Bans.findOne({
                accountId: user.accountId,
                banType: "matchmaking",
                isActive: true,
                $or: [
                    { expiresAt: null },
                    { expiresAt: { $gt: new Date() } }
                ]
            });

            if (existingBan) {
                const errorEmbed = new MessageEmbed()
                    .setTitle("Already Banned")
                    .setDescription(`**${username}** is already banned from matchmaking.`)
                    .addField("Expires", existingBan.expiresAt ? existingBan.expiresAt.toISOString() : "Permanent", true)
                    .addField("Reason", existingBan.reason, true)
                    .setColor("#FFA500")
                    .setTimestamp();

                return await interaction.editReply({ embeds: [errorEmbed] });
            }

            // Parse duration
            let expiresAt = null;
            let durationText = "Permanent";

            if (duration.toLowerCase() !== "permanent") {
                const match = duration.match(/^(\d+)(h|d|w|m)$/i);
                
                if (!match) {
                    const errorEmbed = new MessageEmbed()
                        .setTitle("Invalid Duration")
                        .setDescription("Duration format: `1h`, `24h`, `7d`, `30d`, or `permanent`")
                        .setColor("#FF0000")
                        .setTimestamp();

                    return await interaction.editReply({ embeds: [errorEmbed] });
                }

                const value = parseInt(match[1]);
                const unit = match[2].toLowerCase();

                let milliseconds = 0;
                switch (unit) {
                    case 'h':
                        milliseconds = value * 60 * 60 * 1000;
                        durationText = `${value} hour${value > 1 ? 's' : ''}`;
                        break;
                    case 'd':
                        milliseconds = value * 24 * 60 * 60 * 1000;
                        durationText = `${value} day${value > 1 ? 's' : ''}`;
                        break;
                    case 'w':
                        milliseconds = value * 7 * 24 * 60 * 60 * 1000;
                        durationText = `${value} week${value > 1 ? 's' : ''}`;
                        break;
                    case 'm':
                        milliseconds = value * 30 * 24 * 60 * 60 * 1000;
                        durationText = `${value} month${value > 1 ? 's' : ''}`;
                        break;
                }

                expiresAt = new Date(Date.now() + milliseconds);
            }

            // Create ban
            await Bans.create({
                accountId: user.accountId,
                username: user.username,
                banType: "matchmaking",
                reason: reason,
                bannedBy: interaction.user.tag,
                bannedAt: new Date(),
                expiresAt: expiresAt,
                isActive: true,
                metadata: {
                    discordUserId: interaction.user.id,
                    automatic: false
                }
            });

            // Kick player from game if online
            if (global.Clients && Array.isArray(global.Clients)) {
                const xmppClient = global.Clients.find(client => client.accountId === user.accountId);
                if (xmppClient && xmppClient.client) {
                    xmppClient.client.close();
                }
            }

            // Remove tokens
            if (global.accessTokens) {
                const tokenIndex = global.accessTokens.findIndex(t => t.accountId === user.accountId);
                if (tokenIndex !== -1) {
                    global.accessTokens.splice(tokenIndex, 1);
                }
            }

            const successEmbed = new MessageEmbed()
                .setTitle("✅ Matchmaking Ban Applied")
                .setDescription(`**${user.username}** has been banned from matchmaking.`)
                .addField("Duration", durationText, true)
                .addField("Expires", expiresAt ? expiresAt.toISOString() : "Never", true)
                .addField("Reason", reason, false)
                .addField("Banned By", interaction.user.tag, true)
                .setColor("#00FF00")
                .setTimestamp();

            await interaction.editReply({ embeds: [successEmbed] });

        } catch (error) {
            console.error("Error in matchmake-ban command:", error);

            const errorEmbed = new MessageEmbed()
                .setTitle("Error")
                .setDescription("An error occurred while processing the ban.")
                .setColor("#FF0000")
                .setTimestamp();

            await interaction.editReply({ embeds: [errorEmbed] });
        }
    }
};

