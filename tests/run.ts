/**
 * Test runner.  `npm test`
 *
 * Suites are plain modules that export a default async function. Add a file,
 * add a line here. Exits non-zero on any failure so it can gate a deploy.
 */
import vendorsMatch from "./vendors.match.test";
import importers from "./importers.test";
import columnMap from "./columnMap.test";
import importE2E from "./import.e2e.test";
import meetingTask from "./meetingTask.test";

async function main() {
  const suites = [vendorsMatch, importers, columnMap, importE2E, meetingTask];
  let pass = 0;
  let fail = 0;

  console.log("");
  for (const s of suites) {
    const r = await s();
    pass += r.pass;
    fail += r.fail;
  }

  console.log("");
  console.log(`${pass} assertions passed, ${fail} failed`);
  if (fail > 0) {
    console.log("\nTests failed — do not package or deploy this build.");
  }
  process.exit(fail > 0 ? 1 : 0);
}

main();
