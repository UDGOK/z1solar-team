/**
 * Vendor name normalisation and duplicate detection.
 *
 * Every "must not match" pair below is two DIFFERENT companies that really
 * appear on the Datacloud USA 2026 list. They are the regression guard: a
 * change that makes matching more eager will merge two real vendors, and their
 * accumulated notes and contacts, with no visible error.
 */
import path from "path";
import fs from "fs";
import { ok, suite } from "./_harness";
import {
  findVendorMatch, findInternalDuplicates, matchKey,
  tidyDisplayName, cleanCompanyName, tokenize,
} from "../src/lib/vendors/match";

const FIXTURE = path.join(__dirname, "fixtures", "datacloud-usa-2026-companies.csv");

export default async function run() {
  return suite("vendors/match", () => {
    const cand = (name: string, id = name) => ({ id, name, matchKey: matchKey(name) });

    // ---------- 1. The headline case: SUNGROW across two shows ----------
    {
      const existing = [cand("Sungrow Power Supply Co., Ltd.")];
      const r = findVendorMatch("SUNGROW", existing);
      ok(r.kind === "fuzzy", "SUNGROW ↔ Sungrow Power Supply Co., Ltd. is suggested", `got ${r.kind}`);
      ok(r.confidence === "medium", "…and hedged as medium confidence", `got ${r.confidence}`);
    }

    // ---------- 2. Must NOT match: different companies on the same real list ----------
    const mustNotMatch: [string, string][] = [
      ["Vast Networks", "Vast.ai, inc"],
      ["Power Electronics", "Power Innovations International (A Liteon Company)"],
      ["NATIONAL POWER", "New Era Energy & Digital Inc"],
      ["Simple Power", "Sapphire Gas Solutions LLC"],
      ["Edged US", "EKINOPS"],
      ["Constellation Energy", "Energy Vault, Inc."],
      ["SMART COOLING", "Smart Power Systems"],
      ["MISSION CRITICAL GROUP", "Critical Systems Realty"],
      ["DIGITAL REALTY TRUST, L.P", "DigitalBridge Credit"],
      ["Light Source Communications", "LIGHTHOUSE TECHNOLOGIES"],
      ["Hanwha Data Centers", "DATACENTERHAWK"],
      ["GRIDBEYOND", "Gridserve"],
    ];
    for (const [a, b] of mustNotMatch) {
      const r = findVendorMatch(a, [cand(b)]);
      ok(r.kind === "none", `"${a}" is NOT merged into "${b}"`, `got ${r.kind}: ${r.reason ?? ""}`);
    }

    // ---------- 3. Must match: same company written differently ----------
    const mustMatch: [string, string, string][] = [
      ["Fractal EMS Inc.", "Fractal EMS", "normalised"],
      ["ACTIVE POWER INC", "Active Power, Inc.", "normalised"],
      ["BRUNS-PAK WORLDWIDE, INC.", "Bruns-Pak", "normalised"],
      ["Cirion (Data Center)", "Cirion", "normalised"],
      ["OKLO INC.", "Oklo", "normalised"],
      ["Ascenty Data Centers e Telecomunicações S.A.", "Ascenty Data Centers e Telecomunicacoes SA", "normalised"],
      ["LANGLEY HOLDINGS PLC", "Langley", "normalised"],
      ["TRENCH GROUP", "Trench", "normalised"],
      ["R&M USA Inc", "R&M", "normalised"],
      ["Pure Plastics & Metals", "Pure Plastics and Metals", "normalised"],
      ["ZutaCore", "zutacore", "exact"],
      ["SUNGROW", "Sungrow Power Supply", "fuzzy"],
      ["Nextracker", "Nextracker Inc.", "normalised"],
    ];
    for (const [a, b, want] of mustMatch) {
      const r = findVendorMatch(a, [cand(b)]);
      ok(r.kind === want, `"${a}" ↔ "${b}" is ${want}`, `got ${r.kind}`);
    }

    // ---------- 4. Real internal duplicate in Datacloud's own published list ----------
    {
      const csv = fs.readFileSync(FIXTURE, "utf8");
      const names = csv.split("\n").slice(1).filter(Boolean).map((l) => {
        const m = l.match(/^("([^"]*)"|[^,]*)/);
        return (m?.[2] ?? m?.[1] ?? "").trim();
      });
      ok(names.length === 143, "fixture has 143 companies", `got ${names.length}`);
      const dupes = findInternalDuplicates(names);
      ok(dupes.size === 1, "exactly one internal duplicate found in the real list", `got ${dupes.size}`);
      const dupName = names[[...dupes.keys()][0]];
      ok(dupName === "Pure Plastics & Metals", "…and it is Pure Plastics & Metals", `got "${dupName}"`);

      // Nothing else in 143 real companies should collide with anything else.
      let crossMatches = 0;
      const seen: { id: string; name: string; matchKey: string }[] = [];
      const wrong: string[] = [];
      names.forEach((n, i) => {
        if (dupes.has(i)) return;
        const r = findVendorMatch(n, seen);
        if (r.kind !== "none") { crossMatches++; wrong.push(`${n} → ${r.vendor?.name} (${r.kind})`); }
        seen.push(cand(n, String(i)));
      });
      ok(crossMatches === 1, "only the known Emerson pair is flagged across 143 real companies",
         `got ${crossMatches}: ${wrong.join(" | ")}`);
    }

    // ---------- 5. Display names ----------
    const display: [string, string][] = [
      ["ACTIVE POWER INC", "Active Power Inc"],
      ["NANO NUCLEAR ENERGY INC.", "Nano Nuclear Energy Inc."],
      ["autoLOTO", "autoLOTO"],
      ["ZutaCore", "ZutaCore"],
      ["MaxCell", "MaxCell"],
      ["Vast.ai, inc", "Vast.ai, inc"],
      ["DHD", "DHD"],
      ["ASG", "ASG"],
      ["PwC", "PwC"],
      ["WB ENGINEERS + CONSULTANTS", "WB Engineers + Consultants"],
      ["THERMO BOND BUILDINGS LLC", "Thermo Bond Buildings LLC"],
      ["LANGLEY HOLDINGS PLC", "Langley Holdings PLC"],
      ["1547 Critical Systems Realty", "1547 Critical Systems Realty"],
      ["SIEYUAN ELECTRIC CO LTD", "Sieyuan Electric Co Ltd"],
    ];
    for (const [raw, want] of display) {
      const got = tidyDisplayName(raw);
      ok(got === want, `tidy "${raw}"`, `got "${got}" want "${want}"`);
    }

    // ---------- 6. Junk in, no crash out ----------
    for (const junk of ["", "   ", ",,,", "\"\"", "—", "Inc.", "The", "123", "&"]) {
      const r = findVendorMatch(junk, [cand("Sungrow")]);
      ok(r.kind === "none" || r.vendor !== null, `junk input "${junk}" handled`, JSON.stringify(r.kind));
    }
    ok(cleanCompanyName('  "Sungrow" —  ') === "Sungrow", "quotes and trailing dashes stripped",
       `got "${cleanCompanyName('  "Sungrow" —  ')}"`);
    ok(tokenize("Vast.ai, inc").join("|") === "vast|ai", "Vast.ai tokenises to vast|ai",
       tokenize("Vast.ai, inc").join("|"));

  });
}
