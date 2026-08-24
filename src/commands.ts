// Command definitions, shared by the runtime handler (src/index.ts) and the
// one-off registration script (scripts/register-commands.ts) so the two
// can't drift out of sync.

export const LOOKUP_CHARACTERS_COMMAND = {
  name: "lookup_characters",
  description: "Find a player's characters by any one character's name",
  type: 1, // CHAT_INPUT
  options: [
    {
      name: "name",
      description: "A character name (main, alt, or mule)",
      type: 3, // STRING
      required: true,
    },
  ],
} as const;

export const ALL_COMMANDS = [LOOKUP_CHARACTERS_COMMAND];
