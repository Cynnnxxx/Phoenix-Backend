const { MessageEmbed } = require("discord.js");
const Users = require('../../../model/user.js');
const functions = require("../../../structs/functions.js");

module.exports = {
    commandInfo: {
        name: "email-change",
        description: "Allows you to change your email",
        options: [
            {
                name: "email",
                description: "Your desired email.",
                required: true,
                type: 3 // STRING
            }
        ]
    },
    execute: async (interaction) => {
        try {
            // Deferir resposta imediatamente
            await interaction.deferReply({ ephemeral: true });
            
            // Buscar usuário
            const user = await Users.findOne({ discordId: interaction.user.id });
            if (!user) {
                return await interaction.editReply({ 
                    content: "? You are not registered!", 
                    ephemeral: true 
                });
            }
            
            // Obter email
            const plainEmail = interaction.options.getString('email').trim();
            
            // Validar email
            const emailFilter = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailFilter.test(plainEmail)) {
                return await interaction.editReply({ 
                    content: "? You did not provide a valid email address!", 
                    ephemeral: true 
                });
            }
            
            // Verificar se email já está em uso
            const existingUser = await Users.findOne({ 
                email: plainEmail,
                _id: { $ne: user._id }
            });
            
            if (existingUser) {
                return await interaction.editReply({ 
                    content: "? Email is already in use, please choose another one.", 
                    ephemeral: true 
                });
            }
            
            // Atualizar email
            await Users.updateOne(
                { _id: user._id },
                { $set: { email: plainEmail } }
            );
            
            // Limpar tokens se existirem
            if (global.refreshTokens) {
                const refreshTokenIndex = global.refreshTokens.findIndex(i => i.accountId == user.accountId);
                if (refreshTokenIndex !== -1) {
                    global.refreshTokens.splice(refreshTokenIndex, 1);
                }
            }
            
            if (global.accessTokens) {
                const accessTokenIndex = global.accessTokens.findIndex(i => i.accountId == user.accountId);
                if (accessTokenIndex !== -1) {
                    global.accessTokens.splice(accessTokenIndex, 1);
                    
                    // Fechar conexão XMPP se existir
                    if (global.Clients) {
                        const xmppClient = global.Clients.find(client => client.accountId == user.accountId);
                        if (xmppClient && xmppClient.client) {
                            xmppClient.client.close();
                        }
                    }
                }
            }
            
            // Atualizar tokens
            try {
                if (typeof functions.UpdateTokens === 'function') {
                    await functions.UpdateTokens();
                }
            } catch (tokenError) {
                console.error("Erro ao atualizar tokens:", tokenError);
            }
            
            // Criar embed de sucesso
            const embed = new MessageEmbed()
                .setTitle("? Email Changed")
                .setDescription("Your account email has been successfully changed. Please remember it.")
                .setColor("#00FF00")
                .setFooter({
                    text: "Vortyx",
                    iconURL: "https://i.imgur.com/VKPcwAJ.png",
                })
                .setTimestamp();
            
            await interaction.editReply({ embeds: [embed], ephemeral: true });
            
        } catch (error) {
            console.error("? Error in email-change command:", error);
            
            try {
                await interaction.editReply({ 
                    content: "? An error occurred while changing your email. Please try again later.", 
                    ephemeral: true 
                });
            } catch (e) {
                console.error("Erro ao enviar mensagem de erro:", e);
            }
        }
    }
};