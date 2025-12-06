const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");
const axios = require("axios");
require("dotenv").config();

// Create bot client
const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

// Slash command definition
const commands = [
    new SlashCommandBuilder()
        .setName("owstats")
        .setDescription("Show Overwatch stats for a player")
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

// Register slash commands
const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log("Registering /owstats...");
        await rest.put(
            Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
            { body: commands }
        );
        console.log("Slash commands ready!");
    } catch (err) {
        console.error("Slash command error:", err);
    }
})();

// Handle slash commands
client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === "owstats") {
        const battletag = interaction.options.getString("battletag");
        const mode = interaction.options.getString("mode") || "quickplay";

        const clean = battletag.replace("#", "-");

        const url = `https://overfast-api.tekrop.fr/players/${clean}/stats?gamemode=${mode}`;

        await interaction.reply("📊 Fetching your stats...");

        try {
            const { data } = await axios.get(url);

            // summary + hero stats
            const summary = data.summary || {};
            const heroes = data?.stats?.top_heroes || [];

            // Create embed
            const embed = new EmbedBuilder()
                .setColor("#f7a500")
                .setTitle(`${summary.username || battletag} — ${mode.toUpperCase()} STATS`)
                .setThumbnail(summary.avatar || null)
                .addFields(
                    { name: "Level", value: `${summary.level || "Unknown"}`, inline: true },
                    { name: "Endorsement", value: `${summary.endorsement?.level || "?"}`, inline: true },
                    { name: "Platform", value: "PC", inline: true }
                )
                .setFooter({ text: "Data from Overfast API" });

            // Sort heroes by time played
            const sortedHeroes = heroes.sort(
                (a, b) => (b.time_played_seconds ?? 0) - (a.time_played_seconds ?? 0)
            ).slice(0, 5);

            // Format hero stats fields
            for (const hero of sortedHeroes) {
                embed.addFields({
                    name: `🟦 ${hero.hero_name}`,
                    value:
                        `**Time Played:** ${hero.time_played || "0h"}\n` +
                        `**Winrate:** ${hero.winrate || "0"}%\n` +
                        `**Elims:** ${hero.eliminations || 0}\n` +
                        `**Assists:** ${hero.assists || 0}\n` +
                        `**Deaths:** ${hero.deaths || 0}\n` +
                        `**Damage:** ${hero.damage || 0}`,
                    inline: false
                });
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (err) {
            console.error("API Error:", err.response?.status, err.response?.data);
            await interaction.editReply(
                "❌ Error: Invalid or private BattleTag, or no data for this gamemode."
            );
        }
    }
});

// Login bot
client.login(process.env.DISCORD_TOKEN);

