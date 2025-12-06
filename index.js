const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require("discord.js");
const axios = require("axios");
require("dotenv").config();

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

// ███ SLASH COMMAND SETUP ███

const commands = [
    new SlashCommandBuilder()
        .setName("owstats")
        .setDescription("Get Overwatch stats.")
        .addStringOption(option =>
            option.setName("battletag")
                .setDescription("Your BattleTag (example: name#1234)")
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

// Register slash commands
(async () => {
    try {
        console.log("Registering slash commands...");
        await rest.put(
            Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
            { body: commands }
        );
        console.log("Commands registered.");
    } catch (err) {
        console.error("COMMAND REGISTRATION ERROR:", err);
    }
})();


// ███ COMMAND HANDLER ███

client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === "owstats") {
        const battletag = interaction.options.getString("battletag");
        const mode = interaction.options.getString("mode") || "quickplay";
        const formatted = battletag.replace("#", "-");

        const url = `https://overfast-api.tekrop.fr/players/${formatted}/summary`;

        await interaction.reply("Fetching stats...");

        try {
            const { data } = await axios.get(url);

            // Summary data always exists — stats API is what requires gamemode
            const summary = data;

            await interaction.editReply({
                content:
                    `**Stats for ${battletag}**\n` +
                    `Mode Requested: **${mode}**\n\n` +
                    `Level: ${summary?.level || "Unknown"}\n` +
                    `Endorsement: ${summary?.endorsement?.level || "?"}\n` +
                    `Platform: PC\n\n` +
                    `*(Gamemode-specific stats will be added soon!)*`
            });

        } catch (err) {
            console.log("API ERROR:", err.response?.status, err.response?.data);

            await interaction.editReply(
                ":x: Error: Invalid or private BattleTag, or Overfast is not returning stats."
            );
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
