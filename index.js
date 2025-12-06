const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require("discord.js");
const axios = require("axios");
require("dotenv").config();

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

// Slash command
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

client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === "owstats") {
        const battletag = interaction.options.getString("battletag");
        const mode = interaction.options.getString("mode") || "quickplay";
        const formatted = battletag.replace("#", "-");

        await interaction.reply("Fetching stats...");

        try {
            // 1️⃣ Get general profile data
            const summary = await axios.get(
                `https://overfast-api.tekrop.fr/players/${formatted}/summary`
            );

            // 2️⃣ Get mode-specific data
            const stats = await axios.get(
                `https://overfast-api.tekrop.fr/players/${formatted}/stats?gamemode=${mode}`
            );

            const profile = summary.data;
            const gamemode = stats.data.modes[mode];

            await interaction.editReply({
                content:
`**Stats for ${battletag} (${mode})**
Level: ${profile.level ?? "Unknown"}
Endorsement: ${profile.endorsement?.level ?? "?"}

**${mode.toUpperCase()}**
Games played: ${gamemode?.games_played ?? "N/A"}
Wins: ${gamemode?.wins ?? "N/A"}
Losses: ${gamemode?.losses ?? "N/A"}

Data from Overfast API`
            });
        } catch (err) {
            console.log("API Error:", err.response?.status, err.response?.data);
            await interaction.editReply(":x: Error: Invalid BattleTag, private profile, or no data for that gamemode.");
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
