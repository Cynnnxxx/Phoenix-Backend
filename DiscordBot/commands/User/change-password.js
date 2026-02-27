const { MessageEmbed } = require("discord.js");
const Users = require("../../../model/user.js");
const bcrypt = require("bcrypt");
const functions = require("../../../structs/functions.js");

module.exports = {
    commandInfo: {
        name: "pass-change",
        description: "Change your password.",
        options: [
            {
                name: "password",
                description: "Your new password.",
                required: true,
                type: 3 // STRING
            }
        ]
    },
    execute: async (interaction) => {
        try {
            await interaction.deferReply({ ephemeral: true });
            
            // Buscar usuário
            const user = await Users.findOne({ discordId: interaction.user.id });
            if (!user) {
                return await interaction.editReply({ 
                    content: "? You do not have a registered account!", 
                    ephemeral: true 
                });
            }
            
            // Obter senha
            const plainPassword = interaction.options.getString('password');
            
            // Validações
            if (plainPassword.length >= 128) {
                return await interaction.editReply({ 
                    content: "? Your password must be less than 128 characters long.", 
                    ephemeral: true 
                });
            }
            
            if (plainPassword.length < 4) {
                return await interaction.editReply({ 
                    content: "? Your password must be at least 4 characters long.", 
                    ephemeral: true 
                });
            }
            
            // Hash da senha (usando 8 rounds para ser mais rápido)
            const hashedPassword = await bcrypt.hash(plainPassword, 8);
            
            // Atualizar senha
            await Users.updateOne(
                { _id: user._id },
                { $set: { password: hashedPassword } }
            );
            
            // Limpar tokens
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
                .setTitle("? Password Changed")
                .setDescription("Your account password has been successfully changed.")
                .setColor("#00FF00")
                .setFooter({
                    text: "Vortyx",
                    iconURL: "https://i.imgur.com/VKPcwAJ.png",
                })
                .setTimestamp();
            
            await interaction.editReply({ embeds: [embed], ephemeral: true });
            
        } catch (error) {
            console.error("? Error in pass-change command:", error);
            
            try {
                await interaction.editReply({ 
                    content: "? An error occurred while changing your password. Please try again later.", 
                    ephemeral: true 
                });
            } catch (e) {
                console.error("Erro ao enviar mensagem de erro:", e);
            }
        }
    }
};