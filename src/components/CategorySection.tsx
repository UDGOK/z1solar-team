"use client";

import { useState } from "react";
import ProjectCard, { type CardProject } from "./ProjectCard";

/**
 * One category block on the dashboard. Splits projects into "live" and
 * "not started", showing only the live ones by default — with 20+ dormant
 * projects, showing everything buries the handful that actually need
 * attention. The dormant ones are one click away, never hidden entirely.
 */
export default function CategorySection({
  name,
  color,
  projects,
  canEditIds,
}: {
  name: string;
  color: string;
  projects: CardProject[];
  canEditIds: string[];
}) {
  const [showDormant, setShowDormant] = useState(false);
  const editable = new Set(canEditIds);

  const isDormant = (p: CardProject) => p.completionPct === 0 && p.status === "Planning";
  const live = projects.filter((p) => !isDormant(p));
  const dormant = projects.filter(isDormant);

  return (
    <section className="mb-5">
      <div className="flex items-center gap-2 mb-2.5">
        <span className="w-1.5 h-1.5 rounded-sm shrink-0" style={{ backgroundColor: color }} />
        <h2 className="text-[9.5px] font-semibold tracking-[0.11em] m-0" style={{ color }}>
          {name.toUpperCase()}
        </h2>
        <span className="text-[10px] text-brand-inkFaint">
          {projects.length} project{projects.length === 1 ? "" : "s"}
        </span>
        <span className="flex-1 h-px bg-brand-line" />
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {live.map((p) => (
          <ProjectCard key={p.id} project={p} canEdit={editable.has(p.id)} />
        ))}

        {dormant.length > 0 && !showDormant && (
          <button
            onClick={() => setShowDormant(true)}
            className="bg-[#FCFBF8] border border-dashed border-brand-line rounded-[5px] p-3 text-[10.5px] text-brand-inkFaint hover:text-brand-inkSoft hover:border-brand-inkFaint transition-colors min-h-[92px]"
          >
            + {dormant.length} not started
          </button>
        )}

        {showDormant && dormant.map((p) => (
          <ProjectCard key={p.id} project={p} canEdit={editable.has(p.id)} />
        ))}
      </div>

      {showDormant && dormant.length > 0 && (
        <button
          onClick={() => setShowDormant(false)}
          className="mt-2 text-[10.5px] text-brand-inkFaint hover:text-brand-inkSoft"
        >
          Hide {dormant.length} not started
        </button>
      )}

      {live.length === 0 && dormant.length === 0 && (
        <p className="text-[11px] text-brand-inkFaint">No projects in this category.</p>
      )}
    </section>
  );
}
