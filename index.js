/**
 * index.js
 *
 * - Slash command: /stats platform battletag
 * - Uses ow-api community endpoints:
 *   Profile: https://ow-api.com/v1/stats/{platform}/{battletag}/profile
 *   Full stats: https://ow-api.com/v1/stats/{platform}/{battletag}/complete
 *
 * Replace/distribute token via environment variable DISCORD_TOKEN.
 */

require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, EmbedBuilder } = require('discord.js');
const axios = require('axios');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID || ''; // optional, but recommended to set in Railway env.
if (!TOKEN) {
  console.error('Missing DISCORD_TOKEN environment variable. Set it in Railway Variables or .env for local testing.');
  process.exit(1);
}

const commandData = [
  {
    name: 'stats',
    description: 'Get Overwatch stats for a player (avg kills/deaths, ranked stats, best heroes)',
    options: [
      {
        name: 'platform',
        type: 3, // STRING
        description: 'Platform (pc, xbox, psn)',
        required: true,
        choices: [
          { name: 'PC', value: 'pc' },
          { name: 'Xbox', value: 'xbl' },
          { name: 'PlayStation', value: 'psn' }
        ]
      },
      {
        name: 'battletag',
        type: 3, // STRING
        description: 'Battletag (example: Player#1234 or Player-1234)',
        required: true
      }
    ]
  }
];

async function registerCommands() {
  try {
    if (!CLIENT_ID) {
      console.warn('DISCORD_CLIENT_ID not set; attempting to register commands with application ID from token (may fail for some setups).');
    }

    const rest = new REST({ version: '10' }).setToken(TOKEN);
    const applicationId = CLIENT_ID || (await getApplicationIdFromToken());

    await rest.put(Routes.applicationCommands(applicationId), { body: commandData });
    console.log('Slash commands registered globally.');
  } catch (err) {
    console.error('Failed to register commands:', err);
  }
}

async function getApplicationIdFromToken() {
  // This is a fallback to fetch application info via the bot token.
  // discord.js does not expose a direct util for this without a client login, so we create a temporary client.
  const tmp = new (require('discord.js').Client)({ intents: [] });
  await tmp.login(TOKEN);
  const id = tmp.application?.id;
  await tmp.destroy();
  return id;
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await registerCommands();
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== 'stats') return;

  const platform = interaction.options.getString('platform'); // pc / xbl / psn
  const battletagRaw = interaction.options.getString('battletag').trim();
  const battletagForApi = battletagRaw.replace('#', '-');

  await interaction.deferReply(); // in case fetching takes a moment

  try {
    const profileUrl = `https://ow-api.com/v1/stats/${platform}/${encodeURIComponent(battletagForApi)}/profile`;
    const completeUrl = `https://ow-api.com/v1/stats/${platform}/${encodeURIComponent(battletagForApi)}/complete`;

    const [profileResp, completeResp] = await Promise.allSettled([
      axios.get(profileUrl, { timeout: 10000 }),
      axios.get(completeUrl, { timeout: 10000 })
    ]);

    if (profileResp.status !== 'fulfilled' || profileResp.value.data?.error) {
      // Profile missing or private
      await interaction.editReply({
        content: `Could not fetch profile for \`${battletagRaw}\` on ${platform.toUpperCase()}. The profile may be private or the battletag is invalid.`
      });
      return;
    }

    const profile = profileResp.value.data;
    const complete = completeResp.status === 'fulfilled' ? completeResp.value.data : null;

    // Build embed
    const embed = new EmbedBuilder()
      .setTitle(`${profile.name ?? battletagRaw} • ${platform.toUpperCase()}`)
      .setThumbnail(profile.icon || null)
      .setColor(0xff7f50)
      .setFooter({ text: `Data source: community ow-api.com` })
      .setTimestamp();

    // Basic profile fields
    if (profile.level !== undefined) embed.addFields({ name: 'Level', value: `${profile.level}`, inline: true });
    if (profile.rating !== undefined && profile.rating !== null) embed.addFields({ name: 'Competitive Rating', value: `${profile.rating}`, inline: true });
    if (profile.endorsement !== undefined) embed.addFields({ name: 'Endorsement', value: `${profile.endorsement}`, inline: true });

    // Compute competitive summary if available in complete or profile
    let compGames = null, compWins = null;
    // Common places where wins/games might be:
    // complete?.competitiveStats?.games?.matchesPlayed OR complete?.games?.competitive?.gamesPlayed
    try {
      // multiple fallbacks to try to find counts
      compGames = lookupNumber(complete, [
        ['competitiveStats', 'games', 'played'],
        ['competitiveStats', 'games', 'matches'],
        ['games', 'competitive', 'gamesPlayed'],
        ['games', 'competitive', 'won'], // unfortunate name variance
        ['games', 'competitive', 'played']
      ]);
      compWins = lookupNumber(complete, [
        ['competitiveStats', 'games', 'won'],
        ['games', 'competitive', 'won'],
        ['competitiveStats', 'games', 'wins']
      ]);
    } catch (e) {
      // ignore
    }

    if (compGames !== null) {
      const wins = compWins ?? 0;
      const winRate = compGames > 0 ? ((wins / compGames) * 100).toFixed(1) + '%' : 'N/A';
      embed.addFields({
        name: 'Competitive',
        value: `Games: **${compGames}** • Wins: **${wins}** • Win rate: **${winRate}**`,
        inline: false
      });
    }

    // Try to compute averages from common stat keys
    // We'll search for total eliminations / deaths / damage and divide by games count (if available)
    const totalElims = lookupNumber(complete, [['competitiveStats', 'career_stats', 'all', 'combat', 'eliminations'], ['competitiveStats', 'career_stats', 'all', 'eliminations'], ['stats', 'all', 'eliminations']]);
    const totalDeaths = lookupNumber(complete, [['competitiveStats', 'career_stats', 'all', 'deaths'], ['competitiveStats', 'career_stats', 'all', 'combat', 'deaths'], ['stats', 'all', 'deaths']]);
    const totalDamage = lookupNumber(complete, [['competitiveStats', 'career_stats', 'all', 'average', 'damageDoneAvg'], ['competitiveStats', 'career_stats', 'all', 'damageDone'], ['stats', 'all', 'damageDone']]);

    // Prefer compGames for per-game division, fallback to profile?.games?.competitive?.gamesPlayed
    const gamesForAverages = compGames ?? lookupNumber(complete, [['games', 'competitive', 'gamesPlayed'], ['games', 'competitive', 'played']]) ?? lookupNumber(profile, [['gamesPlayed'], ['games', 'total']]) ?? 0;

    const avgElims = (totalElims !== null && gamesForAverages > 0) ? (totalElims / gamesForAverages).toFixed(2) : null;
    const avgDeaths = (totalDeaths !== null && gamesForAverages > 0) ? (totalDeaths / gamesForAverages).toFixed(2) : null;
    const avgDamage = (totalDamage !== null && gamesForAverages > 0) ? (totalDamage / gamesForAverages).toFixed(0) : null;

    if (avgElims || avgDeaths || avgDamage) {
      let val = '';
      if (avgElims) val += `Avg Eliminations/game: **${avgElims}**\n`;
      if (avgDeaths) val += `Avg Deaths/game: **${avgDeaths}**\n`;
      if (avgDamage) val += `Avg Damage/game: **${avgDamage}**`;
      embed.addFields({ name: 'Averages (Competitive)', value: val.trim(), inline: false });
    }

    // Best-character per role (damage / tank / support) attempt:
    // Many APIs give a 'topHeroes' object listing heroes sorted by playtime or rating.
    // We'll try common locations.
    const topHeroes = findDeep(complete, 'topHeroes') || findDeep(complete, 'heroes') || null;

    const bestPerRole = { damage: null, tank: null, support: null };

    if (topHeroes && typeof topHeroes === 'object') {
      // topHeroes may be structure { damage: [{hero, timePlayed, ...}], tank: [...], support: [...] }
      for (const role of ['damage', 'tank', 'support', 'dps', 'offense', 'defense']) {
        const arr = topHeroes[role];
        if (Array.isArray(arr) && arr.length > 0) {
          // pick first element
          const heroName = arr[0].hero || arr[0].name || arr[0].key || JSON.stringify(arr[0]);
          if (role.includes('tank')) bestPerRole.tank = heroName;
          else if (role.includes('support') || role === 'healer') bestPerRole.support = heroName;
          else bestPerRole.damage = heroName;
        }
      }

      // Some APIs give a flat array sorted by playtime. We'll infer role by hero name mapping (basic).
      if (!bestPerRole.damage || !bestPerRole.tank || !bestPerRole.support) {
        // If we have a flat list, try to pick first hero per known role keywords.
        const flat = Array.isArray(topHeroes) ? topHeroes : null;
        if (flat) {
          // simple role mapping — you can expand this mapping if needed
          const roleMap = {
            tank: ['rham', 'reinhardt', 'winston', 'sigma', 'zarya', 'dva', 'doomfist'],
            support: ['ana', 'mercy', 'moira', 'baptiste', 'lucio', 'brigitte', 'zenyatta'],
            damage: ['tracer', 'soldier', 'mccree', 'reaper', 'genji', 'pharah', 'ashe']
          };
          for (const item of flat) {
            const name = (item.hero || item.name || '').toLowerCase();
            if (!bestPerRole.tank && roleMap.tank.some(k => name.includes(k))) bestPerRole.tank = item.hero || item.name;
            if (!bestPerRole.support && roleMap.support.some(k => name.includes(k))) bestPerRole.support = item.hero || item.name;
            if (!bestPerRole.damage && roleMap.damage.some(k => name.includes(k))) bestPerRole.damage = item.hero || item.name;
          }
        }
      }
    }

    // Add fields for best heroes when found
    const heroLines = [];
    if (bestPerRole.damage) heroLines.push(`Damage: **${capitalize(bestPerRole.damage)}**`);
    if (bestPerRole.tank) heroLines.push(`Tank: **${capitalize(bestPerRole.tank)}**`);
    if (bestPerRole.support) heroLines.push(`Support: **${capitalize(bestPerRole.support)}**`);
    if (heroLines.length > 0) embed.addFields({ name: 'Top Heroes (by role)', value: heroLines.join('\n'), inline: false });

    // If nothing else available, show a helpful note
    if (!embed.data.fields || embed.data.fields.length === 0) {
      embed.setDescription('No detailed stats available. The profile might be private or the community API did not return expanded stats.');
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error('Error processing command:', err);
    await interaction.editReply({ content: 'An error occurred while fetching stats. The API might be rate-limited or temporarily down.' });
  }
});

function lookupNumber(obj, paths) {
  if (!obj) return null;
  for (const path of paths) {
    try {
      let cur = obj;
      for (const p of path) {
        if (cur == null) { cur = null; break; }
        cur = cur[p];
      }
      if (cur !== undefined && cur !== null && !isNaN(Number(cur))) return Number(cur);
    } catch (e) { /* ignore */ }
  }
  return null;
}

function findDeep(obj, keyName) {
  if (!obj || typeof obj !== 'object') return null;
  if (obj.hasOwnProperty && obj.hasOwnProperty(keyName)) return obj[keyName];
  for (const k of Object.keys(obj)) {
    try {
      const val = obj[k];
      if (k === keyName) return val;
      if (val && typeof val === 'object') {
        const found = findDeep(val, keyName);
        if (found) return found;
      }
    } catch (e) { /* ignore */ }
  }
  return null;
}

function capitalize(s) {
  if (!s || typeof s !== 'string') return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

client.login(TOKEN);
