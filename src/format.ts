// Message formatting. Lists render as monospace tables inside a code block,
// the same look the old SOS-Bot used, so columns line up on desktop and
// mobile. Discord caps a message at 2000 characters; every builder here
// stays under it (standings is capped at 25 rows, ~48 chars each, and
// uses class abbreviations so a row doesn't wrap on a phone).

import type { CharacterRow, StandingRow, Totals } from "./queries";

// seekers-tracker src/lib/eq/enums.ts CHAR_CLASSES (0-based Quarm class id;
// 99 = unknown). Keep in sync if that list ever changes.
const CLASSES: Record<number, { name: string; abbr: string }> = {
  0: { name: "Warrior", abbr: "WAR" },
  1: { name: "Cleric", abbr: "CLR" },
  2: { name: "Paladin", abbr: "PAL" },
  3: { name: "Ranger", abbr: "RNG" },
  4: { name: "Shadow Knight", abbr: "SHD" },
  5: { name: "Druid", abbr: "DRU" },
  6: { name: "Monk", abbr: "MNK" },
  7: { name: "Bard", abbr: "BRD" },
  8: { name: "Rogue", abbr: "ROG" },
  9: { name: "Shaman", abbr: "SHM" },
  10: { name: "Necromancer", abbr: "NEC" },
  11: { name: "Wizard", abbr: "WIZ" },
  12: { name: "Magician", abbr: "MAG" },
  13: { name: "Enchanter", abbr: "ENC" },
  14: { name: "Beastlord", abbr: "BST" },
};

export function className(id: number): string {
  return CLASSES[id]?.name ?? "Unknown";
}

function classAbbr(id: number): string {
  return CLASSES[id]?.abbr ?? "UNK";
}

export function classIdFromName(name: string): number | undefined {
  const entry = Object.entries(CLASSES).find(([, c]) => c.name.toLowerCase() === name.toLowerCase());
  return entry ? Number(entry[0]) : undefined;
}

export const SITE_URL = "https://seekersofsouls.com";

// Anything a user typed that we echo back: no backticks (would break out of
// a code span), no markdown, bounded length.
export function clean(s: string): string {
  return s.replace(/[`*_~|>\\]/g, "").slice(0, 40);
}

export function characterTable(chars: CharacterRow[]): string {
  const header = pad("Name", 16) + pad("Lvl", 5) + pad("Class", 15) + "Type";
  const lines = chars.map(
    (c) =>
      pad(c.name, 16) +
      pad(c.level > 1 ? String(c.level) : "?", 5) +
      pad(className(c.classId), 15) +
      capitalize(c.charType),
  );
  return codeBlock([header, "-".repeat(header.length), ...lines]);
}

export function totalsBlock(t: Totals): string {
  return codeBlock([`EP        ${fmtPoints(t.ep)}`, `GP        ${fmtPoints(t.gp)}`, `Priority  ${t.pr.toFixed(4)}`]);
}

export function standingsTable(rows: StandingRow[]): string {
  const header = pad("#", 4) + pad("Main", 15) + pad("Cls", 4) + padLeft("EP", 9) + padLeft("GP", 8) + padLeft("PR", 8);
  const lines = rows.map(
    (r, i) =>
      pad(String(i + 1), 4) +
      pad(r.name, 15) +
      pad(classAbbr(r.classId), 4) +
      padLeft(fmtPoints(r.ep), 9) +
      padLeft(fmtPoints(r.gp), 8) +
      padLeft(r.pr.toFixed(4), 8),
  );
  return codeBlock([header, "-".repeat(header.length), ...lines]);
}

// Ledger sums are floats (decay rows are fractional), so round before
// deciding whether to show a decimal — 12315.0000001 reads as 12315.
function fmtPoints(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function codeBlock(lines: string[]): string {
  return "```\n" + lines.map((l) => l.replace(/`/g, "")).join("\n") + "\n```";
}

function pad(s: string, width: number): string {
  return s.length >= width ? s.slice(0, width - 1) + " " : s + " ".repeat(width - s.length);
}

function padLeft(s: string, width: number): string {
  return s.length >= width ? s : " ".repeat(width - s.length) + s;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
