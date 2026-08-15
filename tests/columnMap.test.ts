/**
 * Column mapping — the guess, and the reviewer's ability to override it.
 *
 * This exists because auto-guessing was the module's known weak point: it
 * handled the two real files we had, and would have silently mapped a
 * description column onto the company name on a file with unusual headers.
 * The mapping screen is the fix; these assertions are what stop it regressing.
 *
 * The "hostile headers" case below is deliberately built from header names no
 * pattern in the app matches, to prove the guess degrades to "ignore" rather
 * than to a confident wrong answer.
 */
import path from "path";
import fs from "fs";
import { ok, suite } from "./_harness";
import { parseDelimited } from "../src/lib/importers/csv";
import {
  guessColumnMap,
  looksLikeHeaderRow,
  applyColumnMap,
  guessField,
  FIELD_LABELS,
  type FieldKey,
} from "../src/lib/importers/columnMap";

const FIXTURE = path.join(__dirname, "fixtures", "datacloud-usa-2026-companies.csv");

/** Mirrors the wizard's setField: a field can only ever be claimed once. */
function setField(map: FieldKey[], col: number, field: FieldKey): FieldKey[] {
  const out = [...map];
  if (field !== "ignore") {
    for (let i = 0; i < out.length; i++) if (i !== col && out[i] === field) out[i] = "ignore";
  }
  out[col] = field;
  return out;
}

export default async function run() {
  return suite("column mapping", () => {
    // ---- every field key has a label, or the dropdown renders blanks ----
    const keys = Object.keys(FIELD_LABELS) as FieldKey[];
    ok(keys.length >= 12, "field list is populated", String(keys.length));
    ok(
      keys.every((k) => typeof FIELD_LABELS[k] === "string" && FIELD_LABELS[k].length > 0),
      "every field has a human label"
    );
    ok(FIELD_LABELS.ignore === "— ignore —", "ignore is offered explicitly");

    // ---- the real published file still maps correctly ----
    {
      const grid = parseDelimited(fs.readFileSync(FIXTURE, "utf8"));
      const map = guessColumnMap(grid[0]);
      ok(map[0] === "companyName", "real file: company name found", map[0]);
      ok(map.includes("listing"), "real file: listing found");
      ok(map.includes("sponsorTier"), "real file: sponsor tier found");
    }

    // ---- synonyms SHOULD be understood, even unusual ones ----
    {
      // These are how other show portals label the same things. Getting them
      // right is the whole point of pattern-matching rather than exact names.
      const map = guessColumnMap(["Stand Ref", "Zone Code", "Blurb", "Web Address", "Segment"]);
      ok(map[0] === "booth", "'Stand Ref' understood as booth", map[0]);
      ok(map[1] === "hall", "'Zone Code' understood as hall", map[1]);
      ok(map[2] === "description", "'Blurb' understood as description", map[2]);
      ok(map[3] === "websiteUrl", "'Web Address' understood as website", map[3]);
      ok(map[4] === "tagNames", "'Segment' understood as tags", map[4]);
    }

    // ---- headers nothing recognises must NOT be guessed at ----
    {
      // Genuinely opaque: no pattern in the app matches any of these.
      const headers = ["F1", "F2", "F3", "F4"];
      const map = guessColumnMap(headers);
      const named = map.filter((m) => m !== "ignore");
      ok(
        named.length === 1,
        "opaque headers produce exactly one guess, not four confident wrong ones",
        JSON.stringify(map)
      );
      ok(
        map[0] === "companyName",
        "…and it's the first column, which is the documented fallback",
        map[0]
      );
      ok(
        map.slice(1).every((m) => m === "ignore"),
        "everything else is left for a human rather than invented",
        JSON.stringify(map)
      );
    }

    // ---- the override behaves: assigning a field releases its old column ----
    {
      const headers = ["F1", "F2", "F3", "F4"];
      let map = guessColumnMap(headers);
      ok(map[0] === "companyName", "starts on column 0", map[0]);

      map = setField(map, 1, "companyName");
      ok(map[1] === "companyName", "moved to column 1");
      ok(map[0] === "ignore", "…and column 0 was released, not left duplicated", map[0]);
      ok(map.filter((m) => m === "companyName").length === 1, "exactly one company-name column");

      map = setField(map, 3, "booth");
      map = setField(map, 2, "description");
      ok(map.join(",") === "ignore,companyName,description,booth", "full manual mapping holds", map.join(","));

      // And the corrected mapping actually extracts the right values.
      const rows = applyColumnMap(
        [["R-1", "Sungrow Power Supply Co., Ltd.", "Inverters and BESS.", "B1420"]],
        map,
        2
      );
      ok(rows.length === 1, "one row extracted");
      ok(rows[0].companyName === "Sungrow Power Supply Co., Ltd.", "company from the chosen column", rows[0].companyName);
      ok(rows[0].booth === "B1420", "booth from the chosen column", String(rows[0].booth));
      ok(rows[0].description === "Inverters and BESS.", "description from the chosen column", String(rows[0].description));
    }

    // ---- turning everything off leaves nothing importable ----
    {
      const map: FieldKey[] = ["ignore", "ignore", "ignore"];
      const rows = applyColumnMap([["a", "b", "c"]], map, 2);
      ok(rows.length === 0, "no company column means no rows — the wizard blocks this case");
    }

    // ---- the specific trap: profile column must not win the name ----
    {
      ok(guessField("Company Profile") === "description", "'Company Profile' is a description, not a name");
      ok(guessField("Company Name") === "companyName", "'Company Name' is the name");
      ok(guessField("Exhibitor Name") === "companyName", "'Exhibitor Name' is the name");
      const map = guessColumnMap(["Company Profile", "Company Name"]);
      ok(map[0] === "description" && map[1] === "companyName",
         "a profile column before the name column doesn't steal it", JSON.stringify(map));
    }

    // ---- a file with no header row ----
    {
      const rows = [["Sungrow", "B1420"], ["Nextracker", "A-0912"]];
      ok(!looksLikeHeaderRow(rows[0]), "data-looking first row isn't treated as a header");
    }

    // ---- duplicate headers don't silently overwrite each other ----
    {
      const map = guessColumnMap(["Company", "Company", "Booth"]);
      ok(map.filter((m) => m === "companyName").length === 1,
         "two 'Company' columns: only the first is claimed", JSON.stringify(map));
      ok(map[1] === "ignore", "the second is left for a human to assign", map[1]);
    }
  });
}
