import { get } from "@vercel/blob";

/**
 * Streams a private blob's content. The blob store is Private (see
 * next.config.js comment history for why) — files aren't reachable by their
 * raw URL at all, only via this server-side read using the account's
 * BLOB_READ_WRITE_TOKEN. That's the whole point: nobody, including someone
 * who finds a leaked URL, can view a file without going through our app's
 * own permission check first.
 */
export async function readPrivateBlob(pathname: string) {
  return get(pathname, { access: "private" });
}
