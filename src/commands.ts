// Command definitions, shared by the runtime handler (src/index.ts) and the
// one-off registration script (scripts/register-commands.ts) so the two
// can't drift out of sync.
//
// Every command is registered guild-scoped (see the register script), which
// is what keeps them out of DMs and other servers — guild commands only exist
// inside that one guild. index.ts re-checks guild_id + roles on every
// request anyway; registration is not the security boundary.

const STRING = 3;
const INTEGER = 4;
const USER = 6;

const CLASS_CHOICES = [
  "Bard",
  "Beastlord",
  "Cleric",
  "Druid",
  "Enchanter",
  "Magician",
  "Monk",
  "Necromancer",
  "Paladin",
  "Ranger",
  "Rogue",
  "Shadow Knight",
  "Shaman",
  "Warrior",
  "Wizard",
].map((name) => ({ name, value: name }));

export const LOOKUP_CHARACTERS_COMMAND = {
  name: "lookup_characters",
  description: "List a member's main, alts and mules from any one of their character names",
  type: 1, // CHAT_INPUT
  options: [
    {
      name: "name",
      description: "A character name (main, alt, or mule)",
      type: STRING,
      required: true,
      autocomplete: true,
    },
  ],
} as const;

export const WHOIS_COMMAND = {
  name: "whois",
  description: "List the characters linked to a Discord member",
  type: 1,
  options: [
    {
      name: "member",
      description: "The Discord member to look up",
      type: USER,
      required: true,
    },
  ],
} as const;

export const PRIORITY_COMMAND = {
  name: "priority",
  description: "Show EP, GP and loot priority — yours, or another member's",
  type: 1,
  options: [
    {
      name: "name",
      description: "Any character name (leave empty for your own)",
      type: STRING,
      required: false,
      autocomplete: true,
    },
  ],
} as const;

export const STANDINGS_WINDOWS = [
  { name: "Raided in the last 7 days", value: "7" },
  { name: "Raided in the last 30 days", value: "30" },
  { name: "Raided in the last 90 days", value: "90" },
  { name: "Everyone", value: "all" },
] as const;

export const STANDINGS_COMMAND = {
  name: "standings",
  description: "Loot priority standings, highest first",
  type: 1,
  options: [
    {
      name: "class",
      description: "Only show one class",
      type: STRING,
      required: false,
      choices: CLASS_CHOICES,
    },
    {
      name: "active",
      description: "Who to include (default: raided in the last 30 days)",
      type: STRING,
      required: false,
      choices: STANDINGS_WINDOWS,
    },
    {
      name: "limit",
      description: "How many rows (default 20, max 25)",
      type: INTEGER,
      required: false,
      min_value: 1,
      max_value: 25,
    },
  ],
} as const;

export const ALL_COMMANDS = [LOOKUP_CHARACTERS_COMMAND, WHOIS_COMMAND, PRIORITY_COMMAND, STANDINGS_COMMAND];
