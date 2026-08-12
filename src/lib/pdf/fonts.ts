import { Font } from "@react-pdf/renderer";
import path from "path";
import fs from "fs";

/**
 * Font registration for @react-pdf/renderer.
 *
 * Two things make this fragile in production and both are handled here:
 *
 * 1. Module load order — registration used to be a side effect of importing
 *    the document component, so a dynamic import could render before fonts
 *    were registered. This is now explicit and idempotent.
 *
 * 2. Path resolution — on Vercel, process.cwd() is /var/task and the deployed
 *    bundle doesn't mirror the source tree the way local dev does. Rather than
 *    assume one layout, we probe several candidate locations and report every
 *    path we tried if none work.
 */

let registered = false;
let resolvedDir: string | null = null;

const FONT_FILES = [
  "Montserrat-Bold.ttf",
  "Montserrat-ExtraBold.ttf",
  "Poppins-Regular.ttf",
  "Poppins-Italic.ttf",
  "Poppins-Medium.ttf",
  "Poppins-SemiBold.ttf",
  "Poppins-Bold.ttf",
];

function candidateDirs(): string[] {
  const cwd = process.cwd();
  return [
    path.join(cwd, "src/lib/pdf/fonts"),
    path.join(cwd, ".next/server/src/lib/pdf/fonts"),
    path.join(cwd, "public/fonts"),
    // __dirname-relative, for when the bundle keeps files beside the module
    path.join(__dirname, "fonts"),
    path.join(__dirname, "../fonts"),
  ];
}

/** Finds the directory containing the fonts, or null. Exported for diagnostics. */
export function findFontDir(): { dir: string | null; tried: { path: string; exists: boolean; files: string[] }[] } {
  const tried: { path: string; exists: boolean; files: string[] }[] = [];
  for (const dir of candidateDirs()) {
    let exists = false;
    let files: string[] = [];
    try {
      exists = fs.existsSync(dir);
      if (exists) files = fs.readdirSync(dir).filter((f) => f.endsWith(".ttf"));
    } catch {
      /* unreadable path — record and move on */
    }
    tried.push({ path: dir, exists, files });
    if (exists && FONT_FILES.every((f) => files.includes(f))) {
      return { dir, tried };
    }
  }
  return { dir: null, tried };
}

export function registerPdfFonts(): void {
  if (registered) return;

  const { dir, tried } = findFontDir();
  if (!dir) {
    throw new Error(
      "PDF fonts not found in the deployment. Tried:\n" +
        tried.map((t) => `  ${t.path} — ${t.exists ? `exists (${t.files.length} ttf)` : "missing"}`).join("\n") +
        "\nCheck outputFileTracingIncludes in next.config.js."
    );
  }
  resolvedDir = dir;

  Font.register({
    family: "Montserrat",
    fonts: [
      { src: path.join(dir, "Montserrat-Bold.ttf"), fontWeight: 700 },
      { src: path.join(dir, "Montserrat-ExtraBold.ttf"), fontWeight: 800 },
    ],
  });

  Font.register({
    family: "Poppins",
    fonts: [
      { src: path.join(dir, "Poppins-Regular.ttf"), fontWeight: 400 },
      { src: path.join(dir, "Poppins-Italic.ttf"), fontWeight: 400, fontStyle: "italic" },
      { src: path.join(dir, "Poppins-Medium.ttf"), fontWeight: 500 },
      { src: path.join(dir, "Poppins-SemiBold.ttf"), fontWeight: 600 },
      { src: path.join(dir, "Poppins-Bold.ttf"), fontWeight: 700 },
    ],
  });

  registered = true;
}

export function fontDiagnostics() {
  const { dir, tried } = findFontDir();
  return { cwd: process.cwd(), dirname: __dirname, resolvedDir: dir ?? resolvedDir, registered, tried };
}

/** Resolves the logo, which has the same path-resolution problem as the fonts. */
export function findLogoPath(): string | null {
  const cwd = process.cwd();
  for (const p of [
    path.join(cwd, "public/logo.png"),
    path.join(cwd, ".next/server/public/logo.png"),
    path.join(__dirname, "../../../public/logo.png"),
  ]) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      /* ignore */
    }
  }
  return null;
}
