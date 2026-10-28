// Local end-to-end check: starts `wrangler dev` against seekers-tracker's own
// local D1 state (each project's Miniflare state is directory-scoped, so it
// has to be pointed there explicitly), signs fake Discord interactions with a
// throwaway Ed25519 keypair, and prints every reply. Nothing leaves this
// machine and nothing touches remote D1. Raw Discord IDs are redacted in the
// output (seekers-tracker CLAUDE.md: never print them into logs).
//
// Usage: npm run smoke   (needs ../seekers-tracker/.wrangler/state populated)

import { execFileSync, spawn } from "node:child_process";
import { generateKeyPairSync, sign } from "node:crypto";

const PORT = 8799;
const PERSIST = "../seekers-tracker/.wrangler/state";
const GUILD = "1000";
const SEEKER = "2000";
const DENIED = "3000";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
const publicHex = hex(publicKey.export({ format: "der", type: "spki" }).subarray(-32));

// A real local player with standings, so `/priority` (no name) has someone to be.
const sample = JSON.parse(
  execFileSync(
    "npx",
    [
      "wrangler", "d1", "execute", "seekers-of-souls", "--local", "--persist-to", PERSIST, "--json", "--command",
      "SELECT p.discord_id AS d FROM players p JOIN player_epgp_totals t ON t.player_id = p.id WHERE p.status = 'active' AND p.discord_id IS NOT NULL ORDER BY t.priority_rating DESC LIMIT 1",
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  ),
)[0].results[0]?.d as string | undefined;

const dev = spawn(
  "npx",
  [
    "wrangler", "dev", "--local", "--port", String(PORT), "--persist-to", PERSIST,
    "--var", `DISCORD_PUBLIC_KEY:${publicHex}`,
    "--var", `DISCORD_GUILD_ID:${GUILD}`,
    "--var", `SEEKER_ROLE_ID:${SEEKER}`,
    "--var", `DENIED_ROLE_IDS:${DENIED}`,
  ],
  { stdio: ["ignore", "pipe", "pipe"] },
);
let devLog = "";
dev.stdout.on("data", (b) => (devLog += b));
dev.stderr.on("data", (b) => (devLog += b));

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(`http://localhost:${PORT}/`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(`wrangler dev never came up:\n${devLog}`);
}

async function send(body: unknown, opts: { forge?: boolean } = {}) {
  const raw = JSON.stringify(body);
  const timestamp = String(Math.floor(Date.now() / 1000));
  let signature = hex(sign(null, Buffer.from(timestamp + raw), privateKey));
  if (opts.forge) signature = signature.replace(/^./, (c) => (c === "a" ? "b" : "a"));
  const res = await fetch(`http://localhost:${PORT}/`, {
    method: "POST",
    headers: { "X-Signature-Ed25519": signature, "X-Signature-Timestamp": timestamp, "content-type": "application/json" },
    body: raw,
  });
  const text = await res.text();
  return { status: res.status, text };
}

function command(name: string, options: object[] = [], member: object = { roles: [SEEKER], user: { id: "42" } }, guild = GUILD) {
  return { type: 2, guild_id: guild, member, data: { name, options } };
}

function show(label: string, r: { status: number; text: string }) {
  let out = r.text;
  try {
    const parsed = JSON.parse(r.text);
    out = parsed.data?.content ?? JSON.stringify(parsed.data ?? parsed);
    if (parsed.data?.flags !== undefined && parsed.data.flags !== 64) out += "\n!! NOT EPHEMERAL";
  } catch {}
  console.log(`\n=== ${label} [${r.status}]\n${out.replace(/<@\d+>/g, "<@…>").replace(sample ?? "\u0000", "…")}`);
}

try {
  await waitForServer();

  show("PING", await send({ type: 1 }));
  show("forged signature", await send({ type: 1 }, { forge: true }));
  show("wrong guild", await send(command("standings", [], undefined, "9999")));
  show("no Seeker role", await send(command("standings", [], { roles: [], user: { id: "42" } })));
  show("Seeker + Guest", await send(command("standings", [], { roles: [SEEKER, DENIED], user: { id: "42" } })));
  show("DM (no guild/member)", await send({ type: 2, user: { id: "42" }, data: { name: "standings" } }));

  show("autocomplete 'Khr'", await send({ ...command("whois"), type: 4, data: { name: "whois", options: [{ name: "name", type: 3, value: "Khr", focused: true }] } }));
  show("autocomplete denied", await send({ ...command("whois", [], { roles: [] }), type: 4, data: { name: "whois", options: [{ name: "name", type: 3, value: "K", focused: true }] } }));

  show("lookup Khrathak", await send(command("whois", [{ name: "name", type: 3, value: "khrathak" }])));
  show("lookup alt Beguilez", await send(command("whois", [{ name: "name", type: 3, value: "Beguilez" }])));
  show("lookup ambiguous 'ka'", await send(command("whois", [{ name: "name", type: 3, value: "ka" }])));
  show("lookup nonsense + markdown", await send(command("whois", [{ name: "name", type: 3, value: "zz`**@everyone" }])));
  show("lookup NoLooter (hidden)", await send(command("whois", [{ name: "name", type: 3, value: "NoLooter" }])));
  show("lookup SQL-ish input", await send(command("whois", [{ name: "name", type: 3, value: "'; DROP TABLE characters; --" }])));

  show("priority Khrathak", await send(command("priority", [{ name: "name", type: 3, value: "Khrathak" }])));
  show("priority via alt", await send(command("priority", [{ name: "name", type: 3, value: "Beguilez" }])));
  show("priority self (unlinked)", await send(command("priority", [], { roles: [SEEKER], user: { id: "42" } })));
  if (sample) show("priority self (linked)", await send(command("priority", [], { roles: [SEEKER], user: { id: sample } })));

  if (sample) show("whois linked member", await send(command("whois", [{ name: "member", type: 6, value: sample }])));
  show("whois unlinked member", await send(command("whois", [{ name: "member", type: 6, value: "42" }])));
  show("whois neither option", await send(command("whois")));
  show("whois both options", await send(command("whois", [{ name: "name", type: 3, value: "Khrathak" }, { name: "member", type: 6, value: "42" }])));

  show("standings default", await send(command("standings")));
  show("standings Enchanter, all, 5", await send(command("standings", [
    { name: "class", type: 3, value: "Enchanter" },
    { name: "active", type: 3, value: "all" },
    { name: "limit", type: 4, value: 5 },
  ])));
  show("standings max rows (length check)", await send(command("standings", [{ name: "active", type: 3, value: "all" }, { name: "limit", type: 4, value: 25 }])));

  const errors = devLog.split("\n").filter((l) => /\[command\]|\[autocomplete\]|Error/.test(l));
  console.log(`\n=== worker errors logged: ${errors.length}`);
  for (const l of errors) console.log(l);
} finally {
  dev.kill();
}
