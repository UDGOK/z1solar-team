import crypto from "crypto";

/**
 * Verifies a webhook really came from Twilio.
 *
 * Twilio signs every request with an HMAC-SHA1 of the full URL plus the sorted
 * POST body, keyed on your auth token. Without checking this, the webhook URL
 * is effectively a public write endpoint — anyone who discovers it could inject
 * fake messages into the CMS, complete tasks, and file notes against projects.
 *
 * Implemented directly rather than pulling in the Twilio SDK, so the webhook
 * stays dependency-light and we control exactly what runs before auth passes.
 */
export function verifyTwilioSignature(opts: {
  authToken: string;
  signature: string | null;
  url: string;
  params: Record<string, string>;
}): boolean {
  if (!opts.signature || !opts.authToken) return false;

  // Twilio concatenates the URL, then each POST param in alphabetical order
  // as key followed immediately by value.
  const data = Object.keys(opts.params)
    .sort()
    .reduce((acc, key) => acc + key + opts.params[key], opts.url);

  const expected = crypto.createHmac("sha1", opts.authToken).update(Buffer.from(data, "utf-8")).digest("base64");

  // Constant-time compare so a timing side-channel can't be used to forge one.
  const a = Buffer.from(expected);
  const b = Buffer.from(opts.signature);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Normalises a phone number to E.164 so lookups match regardless of how it was
 * typed. "(918) 555-0142", "918-555-0142" and "+19185550142" all become the
 * same string — without this, allowlist checks silently fail and legitimate
 * people get rejected.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, "");
  if (!digits) return null;
  if (digits.startsWith("+")) return digits;
  const bare = digits.replace(/\D/g, "");
  if (bare.length === 10) return `+1${bare}`;           // US without country code
  if (bare.length === 11 && bare.startsWith("1")) return `+${bare}`;
  return `+${bare}`;
}

/** Human-friendly display, e.g. +19185550142 -> (918) 555-0142 */
export function formatPhone(e164: string): string {
  const m = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}
