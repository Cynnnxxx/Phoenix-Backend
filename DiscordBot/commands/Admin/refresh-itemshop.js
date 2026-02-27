const { MessageEmbed } = require('discord.js');
const config = require('../../../Config/config.json');
const autorotate = require('../../../structs/autorotate.js');
module.exports = {
    commandInfo: {
        name: "refresh",
        description: "Refresh the item shop manually.",
        options: [
            {
                name: "itemshop",
                description: "Refresh the item shop",
                type: 3,
                required: true,
                choices: [
                    {
                        name: "itemshop",
                        value: "itemshop"
                    }
                ]
            }
        ]
    },
    execute: async (interaction) => {
        await interaction.deferReply({ ephemeral: true });
        if (!config.moderators.includes(interaction.user.id)) {
            return interaction.editReply({ content: "You do not have moderator permissions.", ephemeral: true });
        }
        const option = interaction.options.getString('itemshop');
        if (option !== 'itemshop') {
            return interaction.editReply({ content: "Invalid option. Please select 'itemshop'.", ephemeral: true });
        }
        try {
            await interaction.editReply({ content: "🔄 Refreshing item shop... This may take a moment.", ephemeral: true });
            console.log(`[Refresh Itemshop] Command executed by ${interaction.user.tag} (${interaction.user.id})`);
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Operation timed out after 30 seconds')), 30000);
            });
            const result = await Promise.race([
                autorotate.manualRefreshShop(),
                timeoutPromise
            ]);
            const embed = new MessageEmbed()
                .setTitle('✅ Item Shop Refreshed')
                .setDescription('The item shop has been successfully refreshed!')
                .addField('Status', 'Success')
                .setColor('#00ff00')
                .setTimestamp();
            await interaction.editReply({ 
                content: null,
                embeds: [embed],
                ephemeral: true 
            });
            console.log(`[Refresh Itemshop] Successfully refreshed shop for ${interaction.user.tag}`);
        } catch (error) {
            console.error('[Refresh Itemshop] Error in refresh itemshop command:', error);
            console.error('[Refresh Itemshop] Error stack:', error.stack);
            try {
                await interaction.editReply({ 
                    content: `❌ An error occurred while refreshing the item shop: ${error.message || 'Unknown error'}\n\nPlease check the server logs for more details.`, 
                    ephemeral: true 
                });
            } catch (replyError) {
                console.error('[Refresh Itemshop] Failed to send error reply:', replyError);
                try {
                    await interaction.followUp({ 
                        content: `❌ An error occurred: ${error.message || 'Unknown error'}`, 
                        ephemeral: true 
                    });
                } catch (followUpError) {
                    console.error('[Refresh Itemshop] Failed to send follow-up:', followUpError);
                }
            }
        }
    }
};