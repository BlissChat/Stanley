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

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

// --------------------------------------
// Slash Command Setup
// --------------------------------------
const commands = [
    new SlashCommandBuilder()
        .setName("owstats")
        .setDescription("Get detailed Overwatch stats for a player.")
        .addStringOption(option =>
            option.setName("battletag")
                .setDescription("Example: ilostmyself#11827")
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName("mode")
                .setDescription("Choose gamemode")
                .addChoices(
                    { name: "Quickplay", value: "quickplay" },
                    { name: "Competitive", value: "competitive" }
                )
                .setRequired(true)
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
        console.error("Command registration failed:", err);
    }
})();

// --------------------------------------
// Command Handler
// --------------------------------------
client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "owstats") return;

    const battletag = interaction.options.getString("battletag");
    const mode = interaction.options.getString("mode"); // required
    const clean = battletag.replace("#", "-");

    const summaryURL = `https://overfast-api.tekrop.fr/players/${clean}/summary`;
    const statsURL = `https://overfast-api.tekrop.fr/players/${clean}/stats?gamemode=${mode}`;

    await interaction.reply("Fetching detailed stats...");

    try {
        // ------------------------
        // Fetch summary + stats
        // ------------------------
        const summary = await axios.get(summaryURL);
        const stats = await axios.get(statsURL);

        const s = summary.data;
        const heroes = stats.data?.heroes ?? {};

        // ------------------------
        // Sort & select top 5 heroes
        // ------------------------
        const sortedHeroes = Object.entries(heroes)
            .sort((a, b) => (b[1].time_played ?? 0) - (a[1].time_played ?? 0))
            .slice(0, 5);

        // ------------------------
        // Build Embed
        // ------------------------
        const embed = new EmbedBuilder()
            .setColor("#ff9f00")
            .setTitle(`${s.username} — ${mode.toUpperCase()} STATS`)
            .setThumbnail(s.avatar)
            .addFields(
                { name: "Level", value: `${s.player_level ?? "Unknown"}`, inline: true },
                { name: "Endorsement", value: `${s.endorsement?.level ?? "?"}`, inline: true },
                { name: "Platform", value: `${s.platform ?? "PC"}`, inline: true }
            )
            .setFooter({ text: "Data from Overfast API" });

        // ------------------------
        // If competitive, show rank icon + division
        // ------------------------
        if (mode === "competitive" && s.competitive?.pc?.open) {
            const rank = s.competitive.pc.open;

            embed.addFields({
                name: "Competitive Rank",
                value: `${rank.division.toUpperCase()} ${rank.tier}`,
                inline: false
            });

            if (rank.rank_icon) embed.setImage(rank.rank_icon);
        }

        // ------------------------
        // Add hero stats
        // ------------------------
        for (const [heroName, h] of sortedHeroes) {
            embed.addFields({
                name: `🟦 ${heroName}`,
                value:
                    `**Time Played:** ${h.time_played ?? 0} hours\n` +
                    `**Winrate:** ${h.winrate ?? "?"}%\n` +
                    `**Damage:** ${h.damage_done ?? 0}\n` +
                    `**Eliminations:** ${h.eliminations ?? 0}\n` +
                    `**Deaths:** ${h.deaths ?? 0}\n` +
                    `**Assists:** ${h.assists ?? 0}`,
                inline: false
            });
        }

        await interaction.editReply({ embeds: [embed] });

    } catch (err) {
        console.log("API Error:", err.response?.status, err.response?.data);
        await interaction.editReply(
            ":x: Could not load stats. BattleTag may be invalid, private, or this mode has no data."
        );
    }
});

client.login(process.env.DISCORD_TOKEN);
