require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, EmbedBuilder } = require('discord.js');
const axios = require('axios');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;

if (!TOKEN) {
  console.error("Missing DISCORD_TOKEN. Set it in Replit Secrets.");
  process.exit(1);
}

const commandData = [
  {
    name: "stats",
    description: "Get Overwatch 2 stats for a player",
    options: [
      {
        name: "platform",
        type: 3,
        description: "Platform",
        required: true,
        choices: [
          { name: "PC", value: "pc" },
          { name: "Xbox", value: "xbl" },
          { name: "PlayStation", value: "psn" }
        ]
      },
      {
        name: "battletag",
        type: 3,
        description: "Battletag (Example: Player#1234)",
        required: true
      }
    ]
  }
];

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  await rest.put(Routes.applicationCommands(CLIENT_ID), {
    body: commandData
  });
  console.log("Slash commands registered globally.");
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await registerCommands();
});

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== "stats") return;

  const platform = interaction.options.getString("platform");
  const battletag = interaction.options.getString("battletag").trim();

  // Convert Player#1234 → Player-1234
  const tagForApi = battletag.replace("#", "-");

  await interaction.deferReply();

  try {
    // Main Overfast API URL
    const url = `https://overfast-api.tekrop.fr/players/${encodeURIComponent(tagForApi)}`;

    const res = await axios.get(url, { timeout: 10000 });

    const data = res.data;

    if (!data || data.error) {
      await interaction.editReply(`Could not find profile for **${battletag}**.`);
      return;
    }

    // Build Discord Embed
    const embed = new EmbedBuilder()
      .setTitle(`${data.summary.username} (${platform.toUpperCase()})`)
      .setThumbnail(data.summary.avatar || null)
      .setColor(0xff7f50)
      .setFooter({ text: "Data source: Overfast API" })
      .setTimestamp();

    // Basic info
    embed.addFields(
      { name: "Name", value: data.summary.username, inline: true },
      { name: "Level", value: `${data.summary.account_level}`, inline: true },
      { name: "Endorsement", value: `${data.summary.endorsement.level}`, inline: true }
    );

    // Competitive ranks
    if (data.competitive && data.competitive.pc?.skills) {
      const roles = data.competitive.pc.skills;

      const compText = Object.entries(roles)
        .map(([role, info]) => `${role}: **${info.division} ${info.tier}**`)
        .join("\n");

      embed.addFields({ name: "Competitive Ranks", value: compText });
    }

    // Top Heroes
    if (data.heroes && data.heroes.playtime) {
      const list = Object.entries(data.heroes.playtime)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([hero, hours]) => `${hero}: **${hours.toFixed(1)}h**`)
        .join("\n");

      embed.addFields({ name: "Top Heroes", value: list });
    }

    await interaction.editReply({ embeds: [embed] });

  } catch (err) {
    console.error(err);
    await interaction.editReply("An error occurred while fetching stats.");
  }
});

client.login(TOKEN);
