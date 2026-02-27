const { MessageEmbed } = require("discord.js");
const Users = require('../../../model/user.js');
const Profiles = require('../../../model/profiles.js');
const fs = require('fs');
const path = require('path');
const destr = require('destr');
const log = require("../../../structs/log.js");
const config = require('../../../Config/config.json');
module.exports = {
    commandInfo: {
        name: "removeitem",
        description: "allows you to remove a cosmetic (skin, pickaxe, glider, etc.) from a user",
        options: [
            {
                name: "user",
                description: "the user you want to remove the cosmetic from",
                required: true,
                type: 6
            },
            {
                name: "cosmeticname",
                description: "the name of the cosmetic you want to remove",
                required: true,
                type: 3
            }
        ]
    },
    execute: async (interaction) => {
        if (!config.moderators.includes(interaction.user.id)) {
            return interaction.reply({ content: "you do not have moderator permissions.", ephemeral: true });
        }
        await interaction.deferReply({ ephemeral: true });
        const selectedUser = interaction.options.getUser('user');
        const selectedUserId = selectedUser?.id;
        const user = await Users.findOne({ discordId: selectedUserId });
        if (!user) {
            return interaction.editReply({ content: "that nigga does not own an account" });
        }
        const profile = await Profiles.findOne({ accountId: user.accountId });
        if (!profile) {
            return interaction.editReply({ content: "that nigga does not own an account" });
        }
        const cosmeticname = interaction.options.getString('cosmeticname');
        try {
            const response = await fetch(`https://fortnite-api.com/v2/cosmetics/br/search?name=${cosmeticname}`);
            const json = await response.json();
            const cosmeticFromAPI = json.data;
            if (!cosmeticFromAPI) {
                return interaction.editReply({ content: "could not find the cosmetic" });
            }
            const cosmeticimage = cosmeticFromAPI.images.icon;
            const regex = /^(?:[A-Z][a-z]*\b\s*)+$/;
            if (!regex.test(cosmeticname)) {
                return interaction.editReply({ content: "please check for correct casing. e.g 'renegade raider' is wrong, but 'Renegade Raider' is correct." });
            }
            const file = fs.readFileSync(path.join(__dirname, "../../../Config/DefaultProfiles/allathena.json"));
            const jsonFile = destr(file.toString());
            const items = jsonFile.items;
            let foundcosmeticname = "";
            let found = false;
            for (const key of Object.keys(items)) {
                const [type, id] = key.split(":");
                if (id === cosmeticFromAPI.id) {
                    foundcosmeticname = key;
                    if (!profile.profiles.athena.items[key]) {
                        return interaction.editReply({ content: "that nigga does not have that cosmetic" });
                    }
                    found = true;
                    break;
                }
            }
            if (!found) {
                return interaction.editReply({ content: `could not find the cosmetic ${cosmeticname} in user's profile` });
            }
            const update = { $unset: {} };
            update.$unset[`profiles.athena.items.${foundcosmeticname}`] = "";
            await Profiles.findOneAndUpdate(
                { accountId: user.accountId },
                update,
                { new: true }
            ).catch(async (err) => {
                return interaction.editReply({ content: "an error occurred while removing the cosmetic" });
            });
            const embed = new MessageEmbed()
                .setTitle("removed cosmetic")
                .setDescription(`successfully removed the cosmetic **` + cosmeticname + `** for ${selectedUser}`)
                .setThumbnail(cosmeticimage)
                .setColor("GREEN")
                .setFooter({
                    text: "Vortyx",
                    iconURL: "https://i.imgur.com/VKPcwAJ.png"
                })
                .setTimestamp();
            await interaction.editReply({ embeds: [embed] });
        } catch (err) {
            log.error("an error occurred:", err);
            interaction.editReply({ content: "an error occurred. Please try again later." });
        }
    }
};