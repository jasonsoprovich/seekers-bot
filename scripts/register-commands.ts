// One-off script: registers ALL_COMMANDS as this application's global
// slash commands. Run after every change to src/commands.ts — Discord does
// not pick up command changes automatically. Global commands can take up to
// an hour to propagate; register to a single guild instead while iterating
// (see README.md) for instant updates.
//
// Usage: DISCORD_APPLICATION_ID=... DISCORD_BOT_TOKEN=... npm run register-commands
//   [-- --guild <guild_id>]   registers to one guild instead of globally

import { ALL_COMMANDS } from "../src/commands";

const applicationId = process.env.DISCORD_APPLICATION_ID;
const botToken = process.env.DISCORD_BOT_TOKEN;
const guildId = process.argv.includes("--guild") ? process.argv[process.argv.indexOf("--guild") + 1] : undefined;

if (!applicationId || !botToken) {
  console.error("Set DISCORD_APPLICATION_ID and DISCORD_BOT_TOKEN (Discord Developer Portal -> Bot tab) in the environment.");
  process.exit(1);
}

const url = guildId
  ? `https://discord.com/api/v10/applications/${applicationId}/guilds/${guildId}/commands`
  : `https://discord.com/api/v10/applications/${applicationId}/commands`;

const response = await fetch(url, {
  method: "PUT",
  headers: {
    Authorization: `Bot ${botToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(ALL_COMMANDS),
});

if (!response.ok) {
  console.error(`Registration failed: ${response.status} ${response.statusText}`);
  console.error(await response.text());
  process.exit(1);
}

const registered = (await response.json()) as Array<{ name: string; id: string }>;
console.log(`Registered ${registered.length} command(s)${guildId ? ` to guild ${guildId}` : " globally"}:`);
for (const cmd of registered) console.log(`  /${cmd.name} (${cmd.id})`);
