"use client";

/**
 * Free map embed — OpenStreetMap's public iframe. No API key, no billing
 * account, no usage caps to worry about. Google/Bing both require a key and
 * a card on file, so this is the only genuinely free option that works
 * out of the box.
 */
export default function ProjectMap({
  latitude,
  longitude,
  address,
  height = 260,
}: {
  latitude: number | null;
  longitude: number | null;
  address?: string | null;
  height?: number;
}) {
  if (latitude == null || longitude == null) {
    return (
      <div
        className="rounded-md border border-dashed border-brand-line bg-brand-greenTint flex items-center justify-center text-center px-4"
        style={{ height }}
      >
        <div>
          <p className="text-sm text-brand-inkSoft font-semibold">No location set</p>
          <p className="text-xs text-brand-inkFaint mt-1">
            Add an address and click &ldquo;Find coordinates&rdquo; when editing this project.
          </p>
        </div>
      </div>
    );
  }

  // Small bounding box around the point so the embed zooms in sensibly.
  const d = 0.006;
  const bbox = [longitude - d, latitude - d / 2, longitude + d, latitude + d / 2].join("%2C");
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${latitude}%2C${longitude}`;

  return (
    <div>
      <div className="rounded-md overflow-hidden border border-brand-line">
        <iframe
          title="Project location"
          src={src}
          width="100%"
          height={height}
          style={{ border: 0 }}
          loading="lazy"
        />
      </div>
      <div className="flex flex-wrap items-center gap-3 mt-2 text-xs">
        <span className="font-mono text-brand-inkFaint">
          {latitude.toFixed(5)}, {longitude.toFixed(5)}
        </span>
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`}
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-brand-greenDark hover:underline"
        >
          Google Maps →
        </a>
        <a
          href={`https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=17/${latitude}/${longitude}`}
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-brand-greenDark hover:underline"
        >
          OpenStreetMap →
        </a>
        {address && (
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-brand-greenDark hover:underline"
          >
            Directions →
          </a>
        )}
      </div>
    </div>
  );
}
