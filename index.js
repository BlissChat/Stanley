require("dotenv").config();
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const axios = require("axios");

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

// ------- REGISTER SLASH COMMAND --------
const commands = [
    new SlashCommandBuilder()
        .setName("stats")
        .setDescription("Show Overwatch stats for a player")
        .addStringOption(option =>
            option.setName("battletag")
                .setDescription("Example: ilostmyself#11827")
                .setRequired(true)
        )
].map(cmd => cmd.toJSON());

client.once("ready", async () => {
    console.log(`Logged in as ${client.user.tag}`);

    // Register slash commands globally
    const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

    try {
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );
        console.log("Slash commands registered.");
    } catch (err) {
        console.error("Error registering commands:", err);
    }
});

// ---------- SLASH COMMAND HANDLER ----------
client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === "stats") {
        const battletag = interaction.options.getString("battletag");
        const clean = battletag.replace("#", "-"); // Overfast uses dash

        await interaction.deferReply();

        try {
            // Fetch summary
            const summaryRes = await axios.get(
                `https://overfast-api.tekrop.fr/players/${clean}/summary`
            );

            // Fetch stats
            const statsRes = await axios.get(
                `https://overfast-api.tekrop.fr/players/${clean}/stats`
            );

            const summary = summaryRes.data;
            const heroes = statsRes.data?.quickplay?.heroes || {};

            // Sort heroes by time played (descending) & take top 5
            const topHeroes = Object.entries(heroes)
                .sort((a, b) => (b[1].time_played ?? 0) - (a[1].time_played ?? 0))
                .slice(0, 5);

            const embed = new EmbedBuilder()
                .setColor("#f7a500")
                .setTitle(`${summary.username} — Top 5 Heroes`)
                .setThumbnail(summary.avatar)
                .addFields(
                    { name: "Level", value: `${summary.player_level ?? "?"}`, inline: true },
                    { name: "Endorsement", value: `${summary.endorsement?.level ?? "?"}`, inline: true }
                )
                .setFooter({ text: "Data from Overfast API" });

            for (const [hero, data] of topHeroes) {
                embed.addFields({
                    name: `🟦 ${hero}`,
                    value:
                        `**Time Played:** ${data.time_played ?? 0} hrs\n` +
                        `**Win Rate:** ${data.winrate ?? "?"}%\n` +
                        `**Damage:** ${data.damage_done ?? 0}\n` +
                        `**Eliminations:** ${data.eliminations ?? 0}\n` +
                        `**Deaths:** ${data.deaths ?? 0}\n` +
                        `**Assists:** ${data.assists ?? 0}`,
                    inline: false
                });
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (err) {
            console.error(err);
            await interaction.editReply("❌ Error: BattleTag is invalid or private.");
        }
    }
});

client.login(process.env.DISCORD_TOKEN);

