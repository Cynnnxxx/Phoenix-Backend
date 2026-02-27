const { MessageEmbed } = require("discord.js");
const User = require("../../../model/user.js")
const functions = require("../../../structs/functions.js");
const crypto = require("crypto");
function generatePassword(length = 16) {
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    let password = "";
    for (let i = 0; i < length; i++) {
        password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return password;
}
function generateEmail(username) {
    const cleanUsername = username.toLowerCase().replace(/[^a-z0-9]/g, "");
    const randomSuffix = crypto.randomBytes(4).toString('hex');
    return `${cleanUsername}${randomSuffix}@pulse.dev`;
}
module.exports = {
    commandInfo: {
        name: "account-create",
        description: "create your account",
        options: [
            {
                name: "username",
                description: "your username",
                required: true,
                type: 3
            }
        ],
    },
    execute: async (interaction) => {
        await interaction.deferReply({ ephemeral: true });
        const { options } = interaction;
        const discordId = interaction.user.id;
        const username = options.get("username").value;
        const plainUsername = username;
        const existingDiscordUser = await User.findOne({ discordId: discordId });
        if (existingDiscordUser) {
            return interaction.editReply({ content: "you already have an account!", ephemeral: true });
        }
        const existingUser = await User.findOne({ username: plainUsername });
        if (existingUser) {
            return interaction.editReply({ content: "username already exists. please choose a different one.", ephemeral: true });
        }
        if (username.length >= 25) {
            return interaction.editReply({ content: "your username must be less than 25 characters long.", ephemeral: true });
        }
        if (username.length < 3) {
            return interaction.editReply({ content: "your username must be at least 3 characters long.", ephemeral: true });
        }
        let email = generateEmail(username);
        let password = generatePassword(16);
        let existingEmail = await User.findOne({ email: email });
        let attempts = 0;
        while (existingEmail && attempts < 10) {
            email = generateEmail(username);
            existingEmail = await User.findOne({ email: email });
            attempts++;
        }
        if (existingEmail) {
            return interaction.editReply({ content: "could not generate a unique email. please try again.", ephemeral: true });
        }
        try {
            const resp = await functions.registerUser(discordId, username, email, password);
            const isError = resp.status >= 400;
            const embed = new MessageEmbed()
                .setColor(isError ? "#ff0000" : "#56ff00")
                .setThumbnail(interaction.user.avatarURL({ format: 'png', dynamic: true, size: 256 }))
                .addFields(
                    {
                        name: "message",
                        value: isError ? "failed to create account." : "successfully created an account.",
                    },
                    {
                        name: "Username",
                        value: isError ? "null" : username,
                    },
                    {
                        name: "Email",
                        value: isError ? "null" : email,
                        inline: true
                    },
                    {
                        name: "Password",
                        value: isError ? "null" : password,
                        inline: true
                    },
                    {
                        name: "Discord Tag",
                        value: isError ? "null" : interaction.user.tag,
                    }
                )
                .setTimestamp()
                .setFooter({
                    text: "Vortyx",
                    iconURL: "https://i.imgur.com/VKPcwAJ.png"
                });
            if (isError) {
                return interaction.editReply({ embeds: [embed], ephemeral: true });
            }
            try {
                await interaction.user.send({ embeds: [embed] });
                await interaction.editReply({ content: "✅ You successfully created an account! Check your DMs for your credentials.", ephemeral: true });
            } catch (dmError) {
                console.error("Failed to send DM:", dmError);
                await interaction.editReply({ 
                    content: "⚠️ Account created successfully, but I couldn't send you a DM with your credentials. Please enable DMs from server members and try again, or contact an administrator.", 
                    ephemeral: true 
                });
            }
        } catch (error) {
            console.error("Error creating account:", error);
            await interaction.editReply({ content: "An error occurred while creating your account. Please try again later.", ephemeral: true });
        }
    }
}