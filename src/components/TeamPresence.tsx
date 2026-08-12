import { presenceFrom, PRESENCE_COLOR } from "@/lib/presence";

/** Small coloured dot + label, used in the team directory and presence panel. */
export function PresenceDot({ lastSeenAt, showLabel = true }: { lastSeenAt: Date | null; showLabel?: boolean }) {
  const { state, label } = presenceFrom(lastSeenAt);
  const color = PRESENCE_COLOR[state];

  return (
    <span className="inline-flex items-center gap-1.5" title={label}>
      <span
        className={`inline-block w-2 h-2 rounded-full shrink-0 ${state === "online" ? "ring-2 ring-brand-green/30" : ""}`}
        style={{ backgroundColor: color }}
      />
      {showLabel && (
        <span className={`text-[11px] ${state === "online" ? "text-brand-greenDark font-semibold" : "text-brand-inkFaint"}`}>
          {label}
        </span>
      )}
    </span>
  );
}

export default async function TeamPresence({
  members,
}: {
  members: { id: string; name: string; title: string | null; role: string; lastSeenAt: Date | null }[];
}) {
  const withState = members.map((m) => ({ ...m, ...presenceFrom(m.lastSeenAt) }));

  const order: Record<string, number> = { online: 0, recent: 1, away: 2, never: 3 };
  withState.sort((a, b) => {
    const d = order[a.state] - order[b.state];
    if (d !== 0) return d;
    const at = a.lastSeenAt?.getTime() ?? 0;
    const bt = b.lastSeenAt?.getTime() ?? 0;
    return bt - at;
  });

  const online = withState.filter((m) => m.state === "online").length;
  const never = withState.filter((m) => m.state === "never").length;

  return (
    <div className="card p-5 bg-white">
      <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
        <p className="kicker">Team Activity</p>
        <span className="text-xs text-brand-inkSoft">
          <span className="font-bold text-brand-greenDark">{online}</span> online now
          {never > 0 && <span className="text-brand-inkFaint"> · {never} never signed in</span>}
        </span>
      </div>
      <p className="text-xs text-brand-inkFaint mb-3">
        Based on when someone last loaded a page. Somebody idle with the tab open will show as away.
      </p>

      <div className="space-y-0">
        {withState.map((m) => (
          <div key={m.id} className="flex items-center justify-between gap-3 py-2 border-b border-brand-line last:border-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <PresenceDot lastSeenAt={m.lastSeenAt} showLabel={false} />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-brand-ink truncate">
                  {m.name}
                  {m.role === "ADMIN" && (
                    <span className="ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold text-white bg-brand-amber">
                      ADMIN
                    </span>
                  )}
                </p>
                {m.title && <p className="text-[11px] text-brand-inkFaint truncate">{m.title}</p>}
              </div>
            </div>
            <span
              className={`text-xs shrink-0 ${
                m.state === "online"
                  ? "text-brand-greenDark font-semibold"
                  : m.state === "never"
                  ? "text-brand-inkFaint italic"
                  : "text-brand-inkFaint"
              }`}
            >
              {m.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
