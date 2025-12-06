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

// -------------------------------------------------
// Register Command
// -------------------------------------------------
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

// -------------------------------------------------
// Command Handler
// -------------------------------------------------
client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "owstats") return;

    const battletag = interaction.options.getString("battletag");
    const mode = interaction.options.getString("mode");

    const clean = battletag.replace("#", "-");

    const summaryURL = `https://overfast-api.tekrop.fr/players/${clean}/summary`;
    const statsURL = `https://overfast-api.tekrop.fr/players/${clean}/stats?gamemode=${mode}`;

    await interaction.reply("Fetching detailed stats...");

    try {
        // -----------------------------
        // Fetch Data
        // -----------------------------
        const summaryRes = await axios.get(summaryURL);
        const statsRes = await axios.get(statsURL);

        const s = summaryRes.data;
        const heroes = statsRes.data || {};

        // -----------------------------
        // Extract hero names
        // -----------------------------
        const heroList = Object.keys(heroes);
        if (heroList.length === 0) {
            return interaction.editReply("No stats available for this mode.");
        }

        // -----------------------------
        // Determine top 3 most played
        // -----------------------------
        const heroPlayTimes = heroList.map(name => {
            const heroStats = heroes[name];

            const gameCategory = heroStats.find(c => c.category === "game");
            const timePlayedStat = gameCategory?.stats.find(s => s.key === "time_played");

            return {
                name,
                time: timePlayedStat ? timePlayedStat.value : 0
            };
        });

        const top3 = heroPlayTimes
            .sort((a, b) => b.time - a.time)
            .slice(0, 3)
            .map(h => h.name);

        // -----------------------------
        // Build Embed
        // -----------------------------
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

        // -----------------------------
        // Competitive Rank
        // -----------------------------
        const rank = s?.competitive?.pc?.open;
        if (mode === "competitive" && rank) {
            embed.addFields({
                name: "Competitive Rank",
                value: `${rank.division.toUpperCase()} ${rank.tier}`,
                inline: false
            });

            if (rank.rank_icon) embed.setImage(rank.rank_icon);
        }

        // -----------------------------
        // Add ALL HERO NAMES
        // -----------------------------
        embed.addFields({
            name: "Heroes Played",
            value: heroList.join(", "),
            inline: false
        });

        // -----------------------------
        // DETAILED STATS FOR TOP 3
        // -----------------------------
        for (const heroName of top3) {
            const heroStats = heroes[heroName];

            const combat = heroStats.find(c => c.category === "combat");
            const game = heroStats.find(c => c.category === "game");
            const avg = heroStats.find(c => c.category === "average");

            const damage = combat?.stats.find(s => s.key === "damage_done")?.value ?? 0;
            const elim = combat?.stats.find(s => s.key === "eliminations")?.value ?? 0;
            const deaths = combat?.stats.find(s => s.key === "deaths")?.value ?? 0;
            const timePlayed = game?.stats.find(s => s.key === "time_played")?.value ?? 0;

            embed.addFields({
                name: `⭐ ${heroName} — Detailed Stats`,
                value:
                    `**Time Played:** ${timePlayed}s\n` +
                    `**Damage:** ${damage}\n` +
                    `**Eliminations:** ${elim}\n` +
                    `**Deaths:** ${deaths}\n`,
                inline: false
            });
        }

        await interaction.editReply({ embeds: [embed] });

    } catch (err) {
        console.error("API ERROR:", err.response?.status, err.response?.data);
        await interaction.editReply("❌ Could not fetch stats. Battletag may be invalid or private.");
    }
});

client.login(process.env.DISCORD_TOKEN);
