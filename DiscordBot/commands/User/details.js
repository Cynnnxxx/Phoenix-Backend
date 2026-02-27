const { MessageEmbed } = require("discord.js");
const User = require("../../../model/user.js");
const Profiles = require('../../../model/profiles.js');
const Arena = require('../../../model/arena.js');
const UserStats = require('../../../model/userstats.js');
module.exports = {
    commandInfo: {
        name: "details",
        description: "retrieves your account info including email, password, arena hype, vbucks, level, kills, and wins."
    },
    execute: async (interaction) => {
        await interaction.deferReply({ ephemeral: true });
        const user = await User.findOne({ discordId: interaction.user.id }).lean();
        if (!user) return interaction.editReply({ content: "you do not have a registered account!", ephemeral: true });
        const profile = await Profiles.findOne({ accountId: user.accountId });
        const arena = await Arena.findOne({ accountId: user.accountId }).lean();
        const userStats = await UserStats.findOne({ accountId: user.accountId }).lean();
        const currency = profile?.profiles?.common_core?.items?.["Currency:MtxPurchased"]?.quantity || 0;
        const battlePassLevel = profile?.profiles?.athena?.stats?.attributes?.book_level || 1;
        const arenaHype = arena?.hype || 0;
        let totalKills = 0;
        if (userStats) {
            totalKills = (userStats.solo?.kills || 0) + 
                        (userStats.duo?.kills || 0) + 
                        (userStats.trio?.kills || 0) + 
                        (userStats.squad?.kills || 0) + 
                        (userStats.ltm?.kills || 0);
        }
        let totalWins = 0;
        if (userStats) {
            totalWins = (userStats.solo?.placetop1 || 0) + 
                       (userStats.duo?.placetop1 || 0) + 
                       (userStats.trio?.placetop1 || 0) + 
                       (userStats.squad?.placetop1 || 0) + 
                       (userStats.ltm?.wins || 0);
        }
        let onlineStatus = global.Clients.some(i => i.accountId == user.accountId);
        let embed = new MessageEmbed()
        .setColor("GREEN")
        .setTitle("Account Details")
        .setDescription("Your complete account information")
        .setFields(
            { name: '📧 Email:', value: `${user.email}`, inline: true },
            { name: '🔑 Password:', value: `${user.password}`, inline: true },
            { name: '👤 Username:', value: user.username, inline: true },
            { name: '💎 V-Bucks:', value: `${currency.toLocaleString()}`, inline: true },
            { name: '⭐ Battle Pass Level:', value: `${battlePassLevel}`, inline: true },
            { name: '🔥 Arena Hype:', value: `${arenaHype.toLocaleString()}`, inline: true },
            { name: '🎯 Total Kills:', value: `${totalKills.toLocaleString()}`, inline: true },
            { name: '🏆 Total Wins:', value: `${totalWins.toLocaleString()}`, inline: true },
            { name: '🌐 Online:', value: `${onlineStatus ? "✅ Yes" : "❌ No"}`, inline: true },
            { name: '🚫 Banned:', value: `${user.banned ? "❌ Yes" : "✅ No"}`, inline: true },
            { name: "🆔 Account ID:", value: user.accountId, inline: false })
        .setTimestamp()
        .setThumbnail(interaction.user.avatarURL())
        .setFooter({
            text: "Vortyx",
            iconURL: "https://i.imgur.com/VKPcwAJ.png"
        })
        interaction.editReply({ embeds: [embed], ephemeral: true });
    }
}