const { Client, Intents, Collection, MessageEmbed } = require("discord.js");
const client = new Client({ 
    intents: [
        Intents.FLAGS.GUILDS, 
        Intents.FLAGS.GUILD_MESSAGES, 
        Intents.FLAGS.GUILD_MEMBERS, 
        Intents.FLAGS.GUILD_BANS
    ] 
});

const fs = require("fs");
const path = require("path");
const config = JSON.parse(fs.readFileSync("./Config/config.json").toString());
const log = require("../structs/log.js");
const Users = require("../model/user.js");
const functions = require("../structs/functions.js");

// Cole??o para comandos
client.commands = new Collection();

client.once("ready", async () => {
    console.log(`? Logado como ${client.user.tag}!`);
    log.bot("Bot is up and running!");
    
    // Status do bot
    if (config.discord.bEnableInGamePlayerCount) {
        function updateBotStatus() {
            if (global.Clients && Array.isArray(global.Clients)) {
                client.user.setActivity(`${global.Clients.length} player`, { type: "WATCHING" });
            } else {
                client.user.setActivity("Project Axys", { type: "PLAYING" });
            }
        }
        updateBotStatus();
        setInterval(updateBotStatus, 10000);
    }
    
    // Carregar comandos
    const loadCommands = (dir) => {
        const commandFiles = fs.readdirSync(dir).filter(file => file.endsWith(".js"));
        
        for (const file of commandFiles) {
            try {
                const commandPath = path.join(dir, file);
                const command = require(commandPath);
                
                if (command.commandInfo && command.execute) {
                    client.commands.set(command.commandInfo.name, command);
                    console.log(`? Comando carregado: ${command.commandInfo.name}`);
                }
            } catch (error) {
                console.error(`? Erro ao carregar comando ${file}:`, error.message);
            }
        }
        
        // Carregar subdiret?rios
        const subdirectories = fs.readdirSync(dir).filter(subdir => {
            try {
                return fs.statSync(path.join(dir, subdir)).isDirectory();
            } catch {
                return false;
            }
        });
        
        for (const subdir of subdirectories) {
            loadCommands(path.join(dir, subdir));
        }
    };
    
    // Carregar comandos da pasta commands
    const commandsPath = path.join(__dirname, "commands");
    if (fs.existsSync(commandsPath)) {
        loadCommands(commandsPath);
    } else {
        console.log("? Pasta de comandos n?o encontrada!");
    }
    
    // Registrar comandos no Discord
    try {
        const commandsArray = Array.from(client.commands.values()).map(cmd => ({
            name: cmd.commandInfo.name,
            description: cmd.commandInfo.description || "No description",
            options: cmd.commandInfo.options || []
        }));
        
        // Registrar comandos globalmente
        await client.application.commands.set(commandsArray);
        console.log(`? ${commandsArray.length} comandos registrados no Discord!`);
    } catch (error) {
        console.error("? Erro ao registrar comandos:", error);
    }
});

client.on("interactionCreate", async interaction => {
    if (!interaction.isCommand()) return;
    
    console.log(`Comando recebido: ${interaction.commandName} de ${interaction.user.tag}`);
    
    const command = client.commands.get(interaction.commandName);
    
    if (!command) {
        return interaction.reply({ 
            content: "? Comando n?o encontrado!", 
            ephemeral: true 
        });
    }
    
    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(`? Erro executando comando ${interaction.commandName}:`, error);
        
        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ 
                    content: "? Ocorreu um erro ao executar este comando!",
                    ephemeral: true 
                });
            } else {
                await interaction.reply({ 
                    content: "? Ocorreu um erro ao executar este comando!",
                    ephemeral: true 
                });
            }
        } catch (e) {
            console.error("Erro ao enviar mensagem de erro:", e);
        }
    }
});

// Eventos de ban
client.on("guildBanAdd", async (ban) => {
    if (!config.bEnableCrossBans) return;
    
    try {
        const memberBan = await ban.fetch();
        if (memberBan.user.bot) return;
        
        const userData = await Users.findOne({ discordId: memberBan.user.id });
        if (userData && userData.banned !== true) {
            await Users.updateOne({ _id: userData._id }, { $set: { banned: true } });
            
            // Remover tokens
            const refreshTokenIndex = global.refreshTokens?.findIndex(i => i.accountId == userData.accountId);
            if (refreshTokenIndex !== undefined && refreshTokenIndex !== -1) {
                global.refreshTokens.splice(refreshTokenIndex, 1);
            }
            
            const accessTokenIndex = global.accessTokens?.findIndex(i => i.accountId == userData.accountId);
            if (accessTokenIndex !== undefined && accessTokenIndex !== -1) {
                global.accessTokens.splice(accessTokenIndex, 1);
                const xmppClient = global.Clients?.find(client => client.accountId == userData.accountId);
                if (xmppClient) xmppClient.client.close();
            }
            
            if ((accessTokenIndex !== undefined && accessTokenIndex !== -1) || 
                (refreshTokenIndex !== undefined && refreshTokenIndex !== -1)) {
                await functions.UpdateTokens();
            }
            
            log.debug(`User ${memberBan.user.username} was banned on Discord and in-game.`);
        }
    } catch (error) {
        console.error("Erro no evento guildBanAdd:", error);
    }
});

client.on("guildBanRemove", async (ban) => {
    if (!config.bEnableCrossBans) return;
    
    try {
        if (ban.user.bot) return;
        
        const userData = await Users.findOne({ discordId: ban.user.id });
        if (userData && userData.banned === true) {
            await Users.updateOne({ _id: userData._id }, { $set: { banned: false } });
            log.debug(`User ${ban.user.username} is now unbanned.`);
        }
    } catch (error) {
        console.error("Erro no evento guildBanRemove:", error);
    }
});

// Tratamento de erros
client.on("error", (err) => {
    console.error("Discord API Error:", err);
});

client.on("warn", (warning) => {
    console.warn("Discord Warning:", warning);
});

process.on("unhandledRejection", (reason, promise) => {
    console.error("Unhandled Promise Rejection:", reason);
});

process.on("uncaughtException", (err) => {
    console.error("Uncaught Exception:", err);
});

// Login
client.login(config.discord.bot_token).catch(error => {
    console.error("Erro ao fazer login:", error);
    process.exit(1);
});