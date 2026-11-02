// Validates tgcloud/lib/words.js: 4096 unique, human-friendly words for
// three-word human aliases (see tgcloud/lib/ids.js makeIndicator).
//
// The list was hand-curated for positive/natural-only aliases (no medical,
// anatomical, violent, negative, sexual, or demeaning terms — e.g. no
// abdomen/deafness-type words), validated against open vocabularies for
// spelling/familiarity during curation. This script re-validates the
// committed list offline (no network): exact count, uniqueness, format,
// and a core banned-word safety net. Run: node tools/gen-words.mjs
import { readFileSync } from "node:fs";

const TARGET = 4096;
const WORD_RE = /^[a-z]{3,12}$/;

// Core safety net (critical only; full curation blocklist was larger).
// Any alias "you are X" must never embarrass, medicalize, threaten, or demean.
const BANNED = new Set(
  "abdomen deaf deafness abortion tumor cancer kill murder rape porn shit fuck aids virus abuse acne alcohol ache areola ape arrow aphid anther absinthe abyss abysmal anatomy artery brain heart lung liver kidney stomach intestine rectum penis vagina breast nipple butt anus feces urine vomit pus wart ulcer sepsis murder torture weapon assault terror cocaine heroin shot gun bomb prison war shark snake spider rat mouse pig cow chicken rock stone about accent parrot pigeon zodiac zoo blind albino blond strangler gunboat handgun influenza dwarf mute demon loot dirge peeping peep peeps knob tart upstart conquest hydra ecstasy poon spoon".split(" "),
);

const BANNED_SUBSTRINGS = [
  "tumor", "cancer", "murder", "tortur", "weapon", "assault", "terror",
  "porn", "cocaine", "heroin", "fecal", "plague", "poison", "venom", "toxin",
  // Compound-proofing: exact rules miss gunboat/handgun-style compounds.
  // "tart" is deliberately exact-only above: substring would kill redstart.
  "gun", "strangl", "influenza", "dwarf", "mute", "demon", "loot", "dirge",
  "peep", "knob", "conquest", "hydra", "ecstas", "poon",
];

const wordsUrl = new URL("../tgcloud/lib/words.js", import.meta.url);
const text = readFileSync(wordsUrl, "utf8");
const match = text.match(/export const WORDS = (\[.*\]);?\s*$/s);
if (!match) throw new Error("WORDS export not found");
const WORDS = JSON.parse(match[1]);

if (WORDS.length !== TARGET) throw new Error(`need ${TARGET} words, found ${WORDS.length}`);
if (new Set(WORDS).size !== TARGET) throw new Error("duplicate words");
for (const w of WORDS) {
  if (!WORD_RE.test(w)) throw new Error(`bad format: ${w}`);
  if (BANNED.has(w)) throw new Error(`banned word: ${w}`);
  for (const sub of BANNED_SUBSTRINGS) {
    if (sub && w.includes(sub)) throw new Error(`banned substring ${sub} in ${w}`);
  }
}
console.log(`words ok: ${WORDS.length} unique, positive/natural, human-friendly`);
console.log(`sample: ${WORDS.slice(0, 8).join(", ")}`);
