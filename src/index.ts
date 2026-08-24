import { InteractionResponseType, InteractionType, verifyKey } from "discord-interactions";

import { lookupCharacters } from "./lookup";

// Discord Interactions Endpoint (PLAN.md §8/§11 Phase 9 task 9.1). Runs as a
// plain fetch handler rather than a gateway bot on purpose — Workers can't
// hold a persistent WebSocket, so this only ever responds to a POST Discord
// makes to this Worker's URL, never listens passively. See PLAN.md §8's
// caveat about passive channel reading (main/alt registration) needing a
// different, persistently-hosted service if that's ever required.
export default {
  async fetch(request: Request, env: CloudflareEnv): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("This endpoint only accepts Discord interaction POSTs.", { status: 405 });
    }

    const signature = request.headers.get("X-Signature-Ed25519");
    const timestamp = request.headers.get("X-Signature-Timestamp");
    const body = await request.text();

    if (!signature || !timestamp) {
      return new Response("Missing signature headers.", { status: 401 });
    }

    const isValid = await verifyKey(body, signature, timestamp, env.DISCORD_PUBLIC_KEY);
    if (!isValid) {
      return new Response("Bad request signature.", { status: 401 });
    }

    const interaction = JSON.parse(body);

    if (interaction.type === InteractionType.PING) {
      return json({ type: InteractionResponseType.PONG });
    }

    if (interaction.type === InteractionType.APPLICATION_COMMAND) {
      if (interaction.data?.name === "lookup_characters") {
        return handleLookupCharacters(interaction, env);
      }
      return json(ephemeralMessage(`Unknown command: ${interaction.data?.name}`));
    }

    return new Response("Unhandled interaction type.", { status: 400 });
  },
} satisfies ExportedHandler<CloudflareEnv>;

async function handleLookupCharacters(interaction: any, env: CloudflareEnv): Promise<Response> {
  const nameOption = interaction.data?.options?.find((o: { name: string }) => o.name === "name");
  const query = typeof nameOption?.value === "string" ? nameOption.value : "";

  const result = await lookupCharacters(env.DATABASE, query);

  if (result.kind === "not_found") {
    return json(ephemeralMessage(`No character found matching "${query}".`));
  }

  if (result.kind === "ambiguous") {
    return json(ephemeralMessage(`Multiple characters match "${query}": ${result.matches.join(", ")}. Try a more specific name.`));
  }

  const lines = result.characters.map((c) => {
    const tag = c.charType === "main" ? "**main**" : c.charType;
    const flags = c.status !== "active" ? ` _(${c.status})_` : "";
    return `- **${c.name}** — level ${c.level} ${tag}${flags}`;
  });

  const header = result.displayName ? `Characters for **${result.displayName}**:` : "Character:";
  return json(ephemeralMessage(`${header}\n${lines.join("\n")}`));
}

function ephemeralMessage(content: string) {
  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content, flags: 64 /* EPHEMERAL */ },
  };
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
}
