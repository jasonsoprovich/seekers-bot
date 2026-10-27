// Who may use the bot — the same rule as the website's access gate
// (seekers-tracker src/lib/discord-verify.ts `isDeniedRole`), plus the
// Seeker role every guild member carries:
//   - the interaction must come from the guild (no DMs, no other servers)
//   - the member must hold the Seeker role
//   - and must not hold any denied role (Orc Pawn / Guest)
// Role IDs are guild-specific snowflakes, so they come from env, not code.
// A missing setting fails closed: nobody gets in until it's configured.

export type AccessResult = { ok: true } | { ok: false; reason: string };

type InteractionLike = {
  guild_id?: string;
  member?: { roles?: string[] };
};

export function checkAccess(interaction: InteractionLike, env: CloudflareEnv): AccessResult {
  if (!env.DISCORD_GUILD_ID || !env.SEEKER_ROLE_ID) {
    return { ok: false, reason: "The bot isn't fully configured yet. Please let an officer know." };
  }
  if (interaction.guild_id !== env.DISCORD_GUILD_ID || !interaction.member) {
    return { ok: false, reason: "This bot only works inside the Seekers of Souls Discord server." };
  }

  const roles = new Set(interaction.member.roles ?? []);
  const denied = (env.DENIED_ROLE_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (!roles.has(env.SEEKER_ROLE_ID) || denied.some((id) => roles.has(id))) {
    return { ok: false, reason: "You need the Seeker role to use this bot." };
  }
  return { ok: true };
}
