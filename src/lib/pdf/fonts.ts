import { Font } from "@react-pdf/renderer";
import path from "path";
import fs from "fs";

/**
 * Font registration for @react-pdf/renderer.
 *
 * Previously this ran as a side effect of importing the document component,
 * which meant it depended on module evaluation order. With dynamic imports
 * (and Next 15's bundling) renderToBuffer could run before registration
 * happened, throwing "Font family not registered: Poppins" — which the
 * browser then downloaded as a .txt error page.
 *
 * Calling this explicitly before every render removes that ordering
 * dependency entirely. It's idempotent, so repeat calls are free.
 */

let registered = false;

const FONT_DIR = path.join(process.cwd(), "src/lib/pdf/fonts");

export function registerPdfFonts(): void {
  if (registered) return;

  const need = [
    "Montserrat-Bold.ttf",
    "Montserrat-ExtraBold.ttf",
    "Poppins-Regular.ttf",
    "Poppins-Italic.ttf",
    "Poppins-Medium.ttf",
    "Poppins-SemiBold.ttf",
    "Poppins-Bold.ttf",
  ];
  const missing = need.filter((f) => !fs.existsSync(path.join(FONT_DIR, f)));
  if (missing.length) {
    // Fail loudly and specifically — a bundling problem should say so, not
    // surface as a cryptic "Font family not registered" further downstream.
    throw new Error(
      `PDF fonts missing from the deployment: ${missing.join(", ")}. ` +
        `Check outputFileTracingIncludes in next.config.js (it must be top-level, not under "experimental").`
    );
  }

  Font.register({
    family: "Montserrat",
    fonts: [
      { src: path.join(FONT_DIR, "Montserrat-Bold.ttf"), fontWeight: 700 },
      { src: path.join(FONT_DIR, "Montserrat-ExtraBold.ttf"), fontWeight: 800 },
    ],
  });

  Font.register({
    family: "Poppins",
    fonts: [
      { src: path.join(FONT_DIR, "Poppins-Regular.ttf"), fontWeight: 400 },
      { src: path.join(FONT_DIR, "Poppins-Italic.ttf"), fontWeight: 400, fontStyle: "italic" },
      { src: path.join(FONT_DIR, "Poppins-Medium.ttf"), fontWeight: 500 },
      { src: path.join(FONT_DIR, "Poppins-SemiBold.ttf"), fontWeight: 600 },
      { src: path.join(FONT_DIR, "Poppins-Bold.ttf"), fontWeight: 700 },
    ],
  });

  registered = true;
}
