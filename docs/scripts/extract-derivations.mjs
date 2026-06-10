#!/usr/bin/env node
// ===========================================================================
// extract-derivations.mjs
//
// Walks chapter .js sources for `// <doc id="..."> ... // </doc>` sentinel-
// bounded comment blocks, strips the `//` prefix and decorative rule lines,
// and emits a Markdown partial per id under docs/.generated/. A small
// transform pass converts the ASCII pseudo-math in the comments to KaTeX
// (so the docs typeset properly) and turns named-rule callouts
// (`RULE (name): ...`, `TRAPEZOIDAL RULE.`, etc.) into linked blockquote
// callouts so readers can jump to a reference. The source comments stay
// untouched.
// ===========================================================================
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const outDir = resolve(here, "..", ".generated");

const SOURCES = [
  "01-the-math/tempo-map.js",
  "01-the-math/warp-marker.js",
  "04-meter/meter.js",
  "05-messy-data/robust.js",
  "06-repair/repair.js",
  "07-ppqn-grid/ppqn.js",
  "08-grid-follows-file/conform.js",
];

const SENTINEL = /^\s*\/\/\s*<doc\s+id="([\w-]+)">\s*$([\s\S]*?)^\s*\/\/\s*<\/doc>\s*$/gm;

// ---------------------------------------------------------------------------
// Rule -> external reference map. Keys are lowercased rule names as they
// appear in the chapter comments. Adding a new rule here makes the extractor
// link any mention of that rule automatically.
// ---------------------------------------------------------------------------
const RULE_LINKS = {
  "constant rule":
    "https://en.wikipedia.org/wiki/Lists_of_integrals#Integrals_of_simple_functions",
  "integral of 1/(linear)":
    "https://en.wikipedia.org/wiki/Lists_of_integrals#Rational_functions",
  "trapezoidal rule": "https://en.wikipedia.org/wiki/Trapezoidal_rule",
  bisection: "https://en.wikipedia.org/wiki/Bisection_method",
  "riemann sum": "https://en.wikipedia.org/wiki/Riemann_sum",
  "fundamental theorem of calculus":
    "https://en.wikipedia.org/wiki/Fundamental_theorem_of_calculus",
  "chain rule": "https://en.wikipedia.org/wiki/Chain_rule",
  "tick anchor": "https://en.wikipedia.org/wiki/Pulses_per_quarter_note",
  "warp rate":
    "https://en.wikipedia.org/wiki/Audio_time_stretching_and_pitch_scaling",
  "grid conformity": "https://en.wikipedia.org/wiki/Tempo_map",
};

// Rules that appear as ALL-CAPS standalone markers (no `RULE (...)` wrapper).
// Detected as a SOL anchor + the rule name + ".". When matched, the line is
// prefixed with a small linked callout instead of being styled as a
// blockquote (so the surrounding paragraph stays intact).
const STANDALONE_RULES = ["TRAPEZOIDAL RULE", "BISECTION"];

// ---------------------------------------------------------------------------
// Step 1: convert `RULE (name): expr` paragraphs to blockquote + link.
//
// The regex uses a non-greedy capture for the rule name so names that
// themselves contain parens (e.g. "integral of 1/(linear)") are accepted.
// The body capture pulls the formula line plus any subsequent indented
// continuation lines.
// ---------------------------------------------------------------------------
function transformExplicitRules(text) {
  return text.replace(
    /^[ \t]*RULE\s*\((.+?)\):\s*(.+(?:\n(?![ \t]*$)[ \t]+.+)*)/gm,
    (_, name, body) => {
      const key = name.trim().toLowerCase();
      const url = RULE_LINKS[key];
      const link = url ? ` &nbsp;[learn more ↗](${url})` : "";
      const formula = asciiToKatex(body.replace(/\s+/g, " ").trim());
      return `> **${name.trim()}**${link}\n>\n> $${formula}$`;
    }
  );
}

// ---------------------------------------------------------------------------
// Step 2: link standalone rule mentions like "TRAPEZOIDAL RULE." or
// "BISECTION." -- replace `NAME.` with `**NAME** [↗](url).` so the rule name
// renders bold with an inline link to the reference.
// ---------------------------------------------------------------------------
function transformStandaloneRules(text) {
  for (const name of STANDALONE_RULES) {
    const key = name.toLowerCase();
    const url = RULE_LINKS[key];
    if (!url) continue;
    const pattern = new RegExp(`\\b${name}\\b(?=[.,:])`, "g");
    text = text.replace(pattern, `**${name}** [↗](${url})`);
  }
  return text;
}

// ---------------------------------------------------------------------------
// Step 3: ASCII pseudo-math -> LaTeX commands.
//
// Conservative, idempotent. Replaces well-known patterns from THIS repo's
// comments with their LaTeX equivalents. Does NOT add $...$ wrapping --
// later steps handle that based on whether the line is a math block or
// inline-in-prose.
// ---------------------------------------------------------------------------
function asciiToKatex(s) {
  let out = s
    .replace(/\bbeta\b/g, "\\beta")
    .replace(/\bDelta\b/g, "\\Delta")
    .replace(/\bb0\b/g, "b_0")
    .replace(/\bb1\b/g, "b_1")
    // ln(...) -> \ln(...)
    .replace(/\bln\b/g, "\\ln")
    // "integral 0..beta of EXPR db" -> "\int_0^\beta EXPR \, db"
    .replace(
      /integral\s+([0-9.]+)\.\.([A-Za-z\\]+)\s+of\s+(.+?)\s+db\b/g,
      "\\int_{$1}^{$2} $3 \\, db"
    )
    // "integral from X to Y of EXPR db" (warp-marker comments use this form)
    .replace(
      /integral\s+from\s+([0-9.]+)\s+to\s+(\\?[A-Za-z]+)\s+of\s+(.+?)\s+db\b/g,
      "\\int_{$1}^{$2} $3 \\, db"
    )
    // "integral of EXPR dX" -> "\int EXPR \, dX"
    .replace(/\bintegral\s+of\s+(.+?)\s+d([a-zA-Z])\b/g, "\\int $1 \\, d$2")
    // bare "integral" -> "\int" (catches the trapezoidal formula and similar)
    .replace(/\bintegral\b/g, "\\int")
    // "approx" / "approximately" -> "\approx"
    .replace(/\bapprox(?:imately)?\b/g, "\\approx")
    // x^k -> x^{k}
    .replace(/\^([A-Za-z0-9]+)/g, "^{$1}");

  // Multiplication: any "A*B" between token-ish chars becomes "A \cdot B".
  // Right-hand class includes `[` so `(...)  * [...]` is caught too. Two
  // passes handle chains like "60*K*beta" (the regex consumes one neighbor
  // per match).
  for (let i = 0; i < 2; i++) {
    out = out.replace(
      /([A-Za-z0-9_)\]}])\s*\*\s*([A-Za-z0-9_(\[\\])/g,
      "$1 \\cdot $2"
    );
  }

  // BPM as a text label inside math.
  out = out.replace(/\bBPM\b/g, "\\text{BPM}");
  return out;
}

// ---------------------------------------------------------------------------
// Group consecutive ASCII math-y lines into $$ display-math blocks. The
// detection runs on the ORIGINAL ASCII (before asciiToKatex) so we can decide
// "this line is math" or "this line is prose" early -- lines that fail the
// math test are sent through prose substitutions instead and don't pick up
// stray \cdot / \ln / \beta tokens.
// ---------------------------------------------------------------------------
const MATH_TOKENS_FOR_HEURISTIC = new Set([
  "beta", "Delta", "BPM", "integral", "ln", "sum", "approx",
  "beats", "seconds",
]);

function isMathLineRaw(line) {
  if (!line.trim()) return false;
  if (line.trimStart().startsWith(">")) return false;
  if (!/^\s+\S/.test(line)) return false; // must be indented
  // Continuation line (starts with "=").
  if (/^[ \t]+=/.test(line)) return true;
  // Heuristic: line mentions a math identifier OR uses `*` between identifiers OR contains "^"
  const hasMath =
    /\b(beta|Delta|BPM|integral|ln)\b/.test(line) ||
    /[A-Za-z0-9_)\]}]\s*\*\s*[A-Za-z0-9_(\[\\]/.test(line) ||
    /\^/.test(line);
  if (!hasMath) return false;
  // Must be MOSTLY math: more than two English words (3+ letters that
  // aren't math tokens) means the line is prose that happens to mention
  // some math, not an equation.
  const englishWords = (line.match(/\b[A-Za-z]{3,}\b/g) || []).filter(
    (w) => !MATH_TOKENS_FOR_HEURISTIC.has(w)
  );
  if (englishWords.length > 2) return false;
  return true;
}

// Split "<math>  where <rest>" so prose annotations attached to an
// equation line don't end up inside the $$ block.
function splitOnWhere(line) {
  const m = line.match(/^(\s*\S.*?)\s{2,}where\s+(.+)$/);
  if (!m) return { math: line, trailer: null };
  return { math: m[1], trailer: `where ${m[2]}` };
}

function wrapMathBlocks(text) {
  const lines = text.split("\n");
  const out = [];
  let block = []; // raw ASCII lines awaiting flush

  const flush = () => {
    if (block.length === 0) return;
    const lastTrailers = [];
    const transformed = block.map((l) => {
      const { math, trailer } = splitOnWhere(l);
      if (trailer) lastTrailers.push(trailer);
      return asciiToKatex(math.trim());
    });
    out.push("$$");
    out.push(transformed.join(" \\\\ "));
    out.push("$$");
    for (const t of lastTrailers) {
      // "where <expr>" -> "where $<expr-as-katex>$"
      out.push(
        t.replace(/^where\s+(.+)$/, (_, expr) => `where $${asciiToKatex(expr)}$`)
      );
    }
    block = [];
  };

  for (const line of lines) {
    if (line.trimStart().startsWith(">")) {
      flush();
      out.push(line);
      continue;
    }
    if (isMathLineRaw(line)) {
      block.push(line);
      continue;
    }
    flush();
    out.push(line);
  }
  flush();
  return out.join("\n");
}

// ---------------------------------------------------------------------------
// Step 5: wrap remaining loose LaTeX tokens in inline $...$.
//
// At this point, math blocks are wrapped in $$...$$ and RULE callouts in
// blockquotes. What's left are prose lines that mention \beta, \Delta,
// \text{BPM}(...), b_0, b_1 etc. inline. We wrap each occurrence in $...$
// so it renders in math font, being careful NOT to double-wrap anything
// already inside $...$.
// ---------------------------------------------------------------------------
function wrapInlineTokens(text) {
  return text
    .split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g)
    .map((chunk, i) => {
      if (i % 2 === 1) return chunk; // already-math segments
      let c = chunk;
      // Order matters: text{BPM}(arg) first so \text isn't grabbed alone.
      c = c.replace(/\\text\{BPM\}\(([^)]+)\)/g, "$\\text{BPM}($1)$");
      c = c.replace(/\\text\{BPM\}/g, "$\\text{BPM}$");
      c = c.replace(/\\beta/g, "$\\beta$");
      c = c.replace(/\\Delta/g, "$\\Delta$");
      c = c.replace(/\bb_0\b/g, "$b_0$");
      c = c.replace(/\bb_1\b/g, "$b_1$");
      return c;
    })
    .join("");
}

// Prose-safe substitutions: Unicode glyphs that render in any font, no math
// mode needed. Applied to non-indented (prose) lines so the body text reads
// naturally while keeping the mathematical identifiers visible.
function proseSubstitutions(line) {
  return line
    .replace(/\bbeta\b/g, "β")
    .replace(/\bDelta\b/g, "Δ")
    // t(beta) -> $t(\beta)$ as an inline math fragment, since beta has now
    // become β; we re-LaTeX-ify it inside the $...$.
    .replace(/\bt\(β\)/g, "$t(\\beta)$")
    .replace(/\bBPM\(([^)]+)\)/g, "$\\text{BPM}($1)$")
    // Subscripted constants
    .replace(/\bb0\b/g, "$b_0$")
    .replace(/\bb1\b/g, "$b_1$");
}

// ---------------------------------------------------------------------------
// Pipeline.
//
// Important ordering: wrapMathBlocks runs the math detection on RAW ASCII
// and applies asciiToKatex only to lines it KEEPS as math. Then we sweep
// the result and apply proseSubstitutions to anything outside `$$...$$` /
// `$...$` / blockquote -- so prose mentions of beta/BPM get the lightweight
// Unicode treatment without picking up stray \cdot / \ln tokens.
// ---------------------------------------------------------------------------
function applyProseSubstitutionsOutsideMath(text) {
  return text
    .split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g)
    .map((chunk, i) => {
      if (i % 2 === 1) return chunk; // odd indices are math segments
      return chunk
        .split("\n")
        .map((line) => (line.trimStart().startsWith(">") ? line : proseSubstitutions(line)))
        .join("\n");
    })
    .join("");
}

function transformMath(text) {
  let out = text;
  out = transformExplicitRules(out);
  out = wrapMathBlocks(out);
  out = transformStandaloneRules(out);
  out = applyProseSubstitutionsOutsideMath(out);
  return out;
}

// ---------------------------------------------------------------------------
// Strip the comment prefix `// ` from each line, drop horizontal-rule
// decoration lines that are entirely `=` or `-`.
// ---------------------------------------------------------------------------
function stripCommentPrefix(body) {
  const lines = body.split(/\r?\n/);
  const out = [];
  for (const line of lines) {
    const m = line.match(/^\s*\/\/ ?(.*)$/);
    if (!m) {
      if (/^\s*$/.test(line)) out.push("");
      continue;
    }
    const stripped = m[1];
    if (/^[ \t]*[=-]{3,}[ \t]*$/.test(stripped)) continue;
    out.push(stripped);
  }
  while (out.length && out[0] === "") out.shift();
  while (out.length && out[out.length - 1] === "") out.pop();
  return out.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Run.
// ---------------------------------------------------------------------------
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

let total = 0;
const summary = [];
for (const rel of SOURCES) {
  const full = join(repoRoot, rel);
  const src = readFileSync(full, "utf8");
  let count = 0;
  for (const match of src.matchAll(SENTINEL)) {
    const id = match[1];
    const body = match[2];
    const markdown = transformMath(stripCommentPrefix(body));
    const outPath = join(outDir, `${id}.md`);
    const header =
      `<!-- extracted from ${rel} by docs/scripts/extract-derivations.mjs -->\n` +
      `<!-- DO NOT EDIT this file directly; edit the comment in the source instead. -->\n\n`;
    writeFileSync(outPath, header + markdown, "utf8");
    count++;
  }
  total += count;
  summary.push(`  ${rel}: ${count} block${count === 1 ? "" : "s"}`);
}

console.log(`extracted ${total} derivation block(s):`);
for (const line of summary) console.log(line);
console.log(`wrote partials to ${outDir}`);
