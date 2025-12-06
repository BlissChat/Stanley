const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require("discord.js");
const axios = require("axios");
require("dotenv").config();

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

// Slash command setup
const commands = [
    new SlashCommandBuilder()
        .setName("owstats")
        .setDescription("Get Overwatch stats.")
        .addStringOption(option =>
            option.setName("battletag")
                .setDescription("Your BattleTag (ex: name#1234)")
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName("mode")
                .setDescription("Choose gamemode")
                .addChoices(
                    { name: "Quick Play", value: "quickplay" },
                    { name: "Competitive", value: "competitive" }
                )
                .setRequired(false)
        )
        .toJSON()
];

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log("Registering slash commands...");
        await rest.put(
            Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
            { body: commands }
        );
        console.log("Commands registered.");
    } catch (err) {
        console.error(err);
    }
})();

// Handle commands
client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === "owstats") {
        const battletag = interaction.options.getString("battletag");
        const mode = interaction.options.getString("mode") || "quickplay"; // default

        const formatted = battletag.replace("#", "-");

        const url = `https://overfast-api.tekrop.fr/players/${formatted}/stats?gamemode=${mode}`;

        await interaction.reply("Fetching stats...");

        try {
            const { data } = await axios.get(url);

            await interaction.editReply({
                content: `**Stats for ${battletag} (${mode})**\n` +
                         `Level: ${data.summary.level || "Unknown"}\n` +
                         `Endorsement: ${data.summary.endorsement?.level || "?"}\n` +
                         `Data loaded from Overfast API`
            });

        } catch (err) {
            console.log("API Error:", err.response?.status, err.response?.data);
            await interaction.editReply(":x: Error: The BattleTag is invalid or private, or this gamemode has no data.");
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
