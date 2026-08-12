// Regenerates src/lib/pdf/fontData.ts from the .ttf files in src/lib/pdf/fonts.
// Run after adding or changing a font: node scripts/build-fonts.js
const fs = require("fs");
const path = require("path");

const dir = path.join(process.cwd(), "src/lib/pdf/fonts");
const files = [
  "Montserrat-Bold.ttf", "Montserrat-ExtraBold.ttf",
  "Poppins-Regular.ttf", "Poppins-Italic.ttf", "Poppins-Medium.ttf",
  "Poppins-SemiBold.ttf", "Poppins-Bold.ttf",
];

let out = "// AUTO-GENERATED — do not edit by hand.\n";
out += "// Regenerate with: node scripts/build-fonts.js\n\n";
for (const f of files) {
  const b64 = fs.readFileSync(path.join(dir, f)).toString("base64");
  out += `export const ${f.replace(".ttf", "").replace("-", "_")} = "data:font/ttf;base64,${b64}";\n\n`;
}
fs.writeFileSync(path.join(process.cwd(), "src/lib/pdf/fontData.ts"), out);
console.log("Wrote src/lib/pdf/fontData.ts");
