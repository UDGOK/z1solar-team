/**
 * Import parsing: CSV, spreadsheet, PDF and free text.
 *
 * The CSV fixture is the REAL published Datacloud USA 2026 company list, not an
 * invented one. Two of these assertions only exist because real data broke the
 * first implementation: a quoted comma inside
 * "Hyspan Precision Products, Inc. / Universal Hose and Braid", and the
 * duplicate Datacloud itself published.
 *
 * The PDF case deliberately feeds in a document that is NOT an exhibitor list
 * (the team handbook). The assertion is not that it parses well — it is that a
 * wrong file degrades into reviewable low-confidence rows instead of throwing
 * or, worse, quietly inventing 129 vendors.
 */
import path from "path";
import fs from "fs";
import ExcelJS from "exceljs";
import { ok, suite } from "./_harness";
import { parseDelimited, sniffDelimiter } from "../src/lib/importers/csv";
import {
  guessColumnMap, looksLikeHeaderRow, applyColumnMap, normaliseUrl,
} from "../src/lib/importers/columnMap";
import { parseExhibitorText } from "../src/lib/importers/textRules";
import {
  readWorkbookBuffer, readDelimitedBuffer, readPdfBuffer, detectKind,
} from "../src/lib/importers/sources";

const FIXTURE = path.join(__dirname, "fixtures", "datacloud-usa-2026-companies.csv");
const HANDBOOK = path.join(__dirname, "fixtures", "sample.pdf");

export default async function run() {
  return suite("importers", async () => {
    // ===== CSV against the REAL Datacloud file =====
    const csvText = fs.readFileSync(FIXTURE,"utf8");
    ok(sniffDelimiter(csvText)===",", "delimiter sniffed as comma");
    const grid = parseDelimited(csvText);
    ok(grid.length===144, "144 lines parsed (143 + header)", `got ${grid.length}`);
    ok(looksLikeHeaderRow(grid[0]), "header row detected");

    const map = guessColumnMap(grid[0]);
    ok(map[0]==="companyName", "col 0 → companyName", map[0]);
    ok(map[1]==="listing", "col 1 'Type' → listing", map[1]);
    ok(map[2]==="sponsorTier", "col 2 'Tier' → sponsorTier", map[2]);
    ok(map[3]==="booth", "col 3 → booth", map[3]);
    ok(map[4]==="websiteUrl", "col 4 → websiteUrl", map[4]);
    ok(map[5]==="description", "col 5 'Profile' → description", map[5]);

    const rows = applyColumnMap(grid.slice(1), map, 2);
    ok(rows.length===143, "143 exhibitor rows", `got ${rows.length}`);
    // The quoted-comma case — the whole reason for a real parser.
    const hys = rows.find(r=>r.companyName.startsWith("Hyspan"));
    ok(!!hys && hys.companyName==="Hyspan Precision Products, Inc. / Universal Hose and Braid",
       "quoted comma inside a company name survives", hys?.companyName);
    ok(rows.filter(r=>r.listing==="Sponsor").length===83, "83 sponsors",
       String(rows.filter(r=>r.listing==="Sponsor").length));
    ok(rows.find(r=>r.companyName==="OKLO INC.")?.sponsorTier==="Nuclear Summit Lead Partner",
       "Oklo keeps its odd tier");

    // ===== messy CSV: embedded newline, doubled quotes, BOM, CRLF, semicolons =====
    {
      const messy = '﻿Company;Booth;Profile\r\n"Acme ""Solar"" Ltd";B12;"Line one\nline two"\r\nBare Co;;\r\n';
      const g = parseDelimited(messy);
      ok(g.length===3, "messy: 3 rows", String(g.length));
      ok(g[1][0]==='Acme "Solar" Ltd', "messy: doubled quotes unescaped", g[1][0]);
      ok(g[1][2]==="Line one\nline two", "messy: embedded newline kept", JSON.stringify(g[1][2]));
      ok(!g[0][0].startsWith("﻿"), "messy: BOM stripped", JSON.stringify(g[0][0]));
    }

    // ===== URL normalising =====
    ok(normaliseUrl("nextracker.com")==="https://nextracker.com","bare host gets scheme",String(normaliseUrl("nextracker.com")));
    ok(normaliseUrl("http://en.sungrowpower.com/")==="http://en.sungrowpower.com","trailing slash trimmed",String(normaliseUrl("http://en.sungrowpower.com/")));
    ok(normaliseUrl("N/A")===undefined,"N/A → undefined");
    ok(normaliseUrl("")===undefined,"empty → undefined");
    ok(normaliseUrl("not a url")===undefined,"garbage → undefined",String(normaliseUrl("not a url")));

    // ===== text rules on a realistic pasted directory =====
    {
      const pasted = `
    EXHIBITOR LIST
    Page 3 of 12

    Hall B — Storage Pavilion

    Sungrow Power Supply Co., Ltd.  Booth B1420
    Utility-scale PCS, string inverters and integrated BESS containers.
    Nextracker | A-0912 | nextracker.com
    Fluence Energy   B2201
    Shoals Technologies Group
    Vertiv  D1107  vertiv.com

    GOLD SPONSORS
    Energy Vault, Inc.
    FLEXGEN
    `;
      const { rows: tr, skipped } = parseExhibitorText(pasted);
      const names = tr.map(r=>r.companyName);
      ok(names.includes("Sungrow Power Supply Co., Ltd."), "pasted: Sungrow found", names.join(" / "));
      ok(tr.find(r=>r.companyName.startsWith("Sungrow"))?.booth==="B1420","pasted: booth B1420", String(tr.find(r=>r.companyName.startsWith("Sungrow"))?.booth));
      ok(!!tr.find(r=>r.companyName.startsWith("Sungrow"))?.description?.startsWith("Utility-scale"),"pasted: profile line folded in as description");
      ok(tr.find(r=>r.companyName==="Nextracker")?.booth==="A-0912","pasted: pipe-delimited booth", String(tr.find(r=>r.companyName==="Nextracker")?.booth));
      ok(tr.find(r=>r.companyName==="Nextracker")?.websiteUrl==="https://nextracker.com","pasted: url pulled out");
      ok(!names.some(n=>/^Hall B/.test(n)),"pasted: 'Hall B — Storage Pavilion' heading rejected", names.join(" / "));
      ok(!names.includes("EXHIBITOR LIST"),"pasted: title rejected");
      ok(!names.some(n=>/^Page 3/.test(n)),"pasted: page number rejected");
      ok(tr.find(r=>r.companyName==="Energy Vault, Inc.")?.sponsorTier?.toLowerCase()==="gold","pasted: gold tier carried down", String(tr.find(r=>r.companyName==="Energy Vault, Inc.")?.sponsorTier));
      ok(tr.find(r=>r.companyName==="Shoals Technologies Group")?.confidence==="low","pasted: bare name is low confidence");
      ok(tr.find(r=>r.companyName.startsWith("Sungrow"))?.confidence==="high","pasted: booth line is high confidence");
      ok(skipped>=4, "pasted: noise lines counted as skipped", String(skipped));
    }

    ok(detectKind("list.CSV")==="csv","detect csv");
    ok(detectKind("RE_2026.xlsx")==="xlsx","detect xlsx");
    ok(detectKind("guide.pdf")==="pdf","detect pdf");
    ok(detectKind("old.xls")==="unknown","legacy .xls rejected rather than half-read", detectKind("old.xls"));

    // ---- build a REAL xlsx from the real Datacloud data, with nasty cell types ----
    {
      const csv = fs.readFileSync(FIXTURE,"utf8");
      const lines = csv.split("\n").filter(Boolean);
      const wb = new ExcelJS.Workbook();
      wb.addWorksheet("Cover").addRow(["Datacloud USA 2026 — do not edit"]);
      const ws = wb.addWorksheet("Exhibitor List");
      ws.addRow(["Exhibitor Name","Record Type","Sponsorship Level","Booth #","Website","Company Profile"]);
      ws.addRow(["Sungrow Power Supply Co., Ltd.","Exhibitor",null,1220,
        { text:"sungrowpower.com", hyperlink:"https://en.sungrowpower.com" },
        { richText:[{text:"Utility PCS, "},{text:"inverters"},{text:" and BESS."}] }]);
      ws.addRow(["Nextracker","Exhibitor",null,"A-0912","nextracker.com","Trackers."]);
      ws.addRow([{ formula:"CONCATENATE(\"Fluence\",\" Energy\")", result:"Fluence Energy" },"Exhibitor",null,"B2201",null,null]);
      ws.addRow([null,null,null,null,null,null]);
      for (const l of lines.slice(1,20)) {
        const name=(l.match(/^("([^"]*)"|[^,]*)/)?.[2] ?? l.split(",")[0]);
        ws.addRow([name,"Exhibitor",null,null,null,null]);
      }
      const buf = await wb.xlsx.writeBuffer();
      fs.writeFileSync(path.join(__dirname,"fixtures","generated-test.xlsx"), Buffer.from(buf));

      const grid = await readWorkbookBuffer(Buffer.from(buf));
      ok(grid.sheetName==="Exhibitor List","picks the exhibitor sheet, not the cover tab", String(grid.sheetName));
      ok((grid.otherSheets||[]).includes("Cover"),"reports the other sheet so a wrong pick is recoverable");
      ok(looksLikeHeaderRow(grid.rows[0]),"xlsx header detected");
      const map = guessColumnMap(grid.rows[0]);
      ok(map[0]==="companyName","'Exhibitor Name' → companyName",map[0]);
      ok(map[3]==="booth","'Booth #' → booth",map[3]);
      ok(map[5]==="description","'Company Profile' → description",map[5]);
      const rows = applyColumnMap(grid.rows.slice(1),map,2);
      ok(rows[0].booth==="1220","numeric booth cell became a string",String(rows[0].booth));
      ok(rows[0].websiteUrl==="https://en.sungrowpower.com" || rows[0].websiteUrl==="https://sungrowpower.com",
         "hyperlink cell resolved",String(rows[0].websiteUrl));
      ok(rows[0].description==="Utility PCS, inverters and BESS.","rich text concatenated",String(rows[0].description));
      ok(rows[2].companyName==="Fluence Energy","formula cell used its computed result",String(rows[2].companyName));
      ok(!rows.some(r=>!r.companyName.trim()),"fully blank row dropped");
    }

    // ---- REAL PDF: the Z1Power handbook, then the parser over its text ----
    {
      const pdf = fs.readFileSync(HANDBOOK);
      const { text, pages } = await readPdfBuffer(pdf);
      ok(pages===13,"real PDF reports 13 pages",String(pages));
      ok(text.length>15000,"text layer extracted",String(text.length));
      const { rows, skipped } = parseExhibitorText(text);
      // The handbook is NOT an exhibitor list. The point is that it degrades into
      // a reviewable pile of low-confidence rows instead of crashing.
      ok(rows.every(r=>typeof r.companyName==="string" && r.companyName.length>0),"no empty names from prose PDF");
      const lowPct = rows.filter(r=>r.confidence==="low").length/Math.max(rows.length,1);
      ok(lowPct>0.6,"most rows from a non-exhibitor PDF are flagged low confidence",`${Math.round(lowPct*100)}%`);
      console.log(`   (handbook PDF → ${rows.length} candidate rows, ${skipped} lines skipped, ${Math.round(lowPct*100)}% low confidence)`);
    }

    // ---- empty / corrupt inputs ----
    {
      ok(readDelimitedBuffer(Buffer.from("")).rows.length===0,"empty csv → no rows");
      ok(readDelimitedBuffer(Buffer.from("\n\n\n")).rows.length===0,"blank lines → no rows");
      let threw=false;
      try { await readPdfBuffer(Buffer.from("this is not a pdf")); } catch { threw=true; }
      ok(threw,"a non-PDF buffer throws so the action can report it cleanly");
    }
  });
}
