import { Font } from "@react-pdf/renderer";
import {
  Montserrat_Bold,
  Montserrat_ExtraBold,
  Poppins_Regular,
  Poppins_Italic,
  Poppins_Medium,
  Poppins_SemiBold,
  Poppins_Bold,
  LOGO_DATA_URI,
} from "./fontData";

/**
 * Font registration for @react-pdf/renderer.
 *
 * Fonts are embedded as base64 data URIs (see fontData.ts) rather than read
 * from disk. Reading .ttf files worked locally but failed in the serverless
 * deployment — process.cwd() differs, and file-tracing config is easy to get
 * silently wrong. Embedding makes the fonts part of the compiled JavaScript,
 * so they cannot go missing regardless of how the app is bundled or deployed.
 *
 * Registration is explicit and idempotent, so it never depends on module
 * evaluation order either.
 */

let registered = false;

export function registerPdfFonts(): void {
  if (registered) return;

  Font.register({
    family: "Montserrat",
    fonts: [
      { src: Montserrat_Bold, fontWeight: 700 },
      { src: Montserrat_ExtraBold, fontWeight: 800 },
    ],
  });

  Font.register({
    family: "Poppins",
    fonts: [
      { src: Poppins_Regular, fontWeight: 400 },
      { src: Poppins_Italic, fontWeight: 400, fontStyle: "italic" },
      { src: Poppins_Medium, fontWeight: 500 },
      { src: Poppins_SemiBold, fontWeight: 600 },
      { src: Poppins_Bold, fontWeight: 700 },
    ],
  });

  registered = true;
}

/** Logo as a data URI — same reasoning as the fonts. Never null. */
export function findLogoPath(): string {
  return LOGO_DATA_URI;
}

/** Kept for the /api/pdf-debug endpoint. */
export function fontDiagnostics() {
  return {
    strategy: "embedded base64 data URIs (no filesystem dependency)",
    registered,
    fontsEmbedded: 7,
    logoEmbedded: true,
    cwd: process.cwd(),
  };
}
