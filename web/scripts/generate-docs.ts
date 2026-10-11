import fs from "node:fs";
import path from "node:path";
import { generateRiskScoreDoc, generateTriageTableDoc } from "@/lib/docs/generate";
import { loadRiskPointsFromDir } from "@/lib/risk/points";
import { findRulesDir, loadRulesFromDir } from "@/lib/triage/loadFiles";

/**
 * Writes docs/triage-table.md and docs/risk-score.md from the JSON in rules/.
 *   npm run docs:generate   write the files
 *   npm run docs:check      exit 1 when a committed file differs (used by CI)
 */
const rulesDir = findRulesDir();
const docsDir = path.resolve(rulesDir, "..", "docs");
const rules = loadRulesFromDir(rulesDir);

const outputs: Array<[string, string]> = [
  ["triage-table.md", generateTriageTableDoc(rules.table, rules.lexicon)],
  ["risk-score.md", generateRiskScoreDoc(loadRiskPointsFromDir(rulesDir))],
];

const check = process.argv.includes("--check");
let stale = 0;
for (const [name, content] of outputs) {
  const file = path.join(docsDir, name);
  const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
  if (check) {
    if (current !== content) {
      stale++;
      console.error(`docs/${name} is out of date; run: cd web; npm run docs:generate`);
    }
  } else {
    fs.mkdirSync(docsDir, { recursive: true });
    fs.writeFileSync(file, content, "utf8");
    console.log(`wrote docs/${name}`);
  }
}
if (check) {
  if (stale > 0) process.exit(1);
  console.log("docs are up to date");
}
