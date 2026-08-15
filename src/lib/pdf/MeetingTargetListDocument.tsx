import React from "react";
import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import { findLogoPath } from "./fonts";

/**
 * The meeting target list — the sheet somebody actually carries around a show
 * floor.
 *
 * Design constraints come from that use, not from the screen:
 *  - Sorted by booth, because the sheet is a walking route.
 *  - A tick box per row, because people mark them off with a pen.
 *  - Booth number is the largest thing on the row; it's what you match against
 *    the signage while walking.
 *  - No colour is load-bearing. These print on whatever is in the office.
 *  - Unassigned targets are called out, because "nobody is chasing this" is the
 *    single most useful thing to notice the morning of a show.
 */

const GREEN = "#4CAB3E";
const GREEN_DARK = "#3F9634";
const GREEN_TINT = "#F5F9F3";
const INK = "#1C1C1C";
const INK_SOFT = "#3A3A3A";
const INK_FAINT = "#8A8A85";
const LINE = "#D8D8D2";
const WHITE = "#FFFFFF";
const RED = "#C0392B";

const s = StyleSheet.create({
  page: { padding: 28, fontFamily: "Poppins", fontSize: 8, color: INK },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  logo: { width: 80, height: 29 },
  kickerRight: {
    fontFamily: "Poppins", fontWeight: 700, fontSize: 7,
    color: GREEN_DARK, letterSpacing: 1, textAlign: "right",
  },
  metaRight: { fontSize: 6.5, color: INK_FAINT, textAlign: "right", marginTop: 2 },
  hr: { borderBottomWidth: 2, borderBottomColor: GREEN, marginTop: 6, marginBottom: 12 },
  title: { fontFamily: "Montserrat", fontWeight: 800, fontSize: 17, color: INK },
  meta: { fontSize: 7.5, color: INK_FAINT, marginTop: 3, marginBottom: 10 },

  sumRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  sumBox: { flex: 1, borderWidth: 1, borderColor: LINE, borderRadius: 3, padding: 6 },
  sumLabel: { fontFamily: "Poppins", fontWeight: 700, fontSize: 6, color: GREEN_DARK, letterSpacing: 0.5 },
  sumValue: { fontFamily: "Montserrat", fontWeight: 800, fontSize: 11, color: INK, marginTop: 1 },

  th: { backgroundColor: INK, paddingVertical: 4, paddingHorizontal: 3, flexDirection: "row" },
  thText: { fontFamily: "Poppins", fontWeight: 700, fontSize: 6, color: WHITE, letterSpacing: 0.4 },

  tr: {
    flexDirection: "row", paddingVertical: 5, paddingHorizontal: 3,
    borderBottomWidth: 1, borderBottomColor: LINE,
  },
  trAlt: { backgroundColor: GREEN_TINT },

  tick: { width: 9, height: 9, borderWidth: 1, borderColor: INK_FAINT, borderRadius: 1.5 },
  booth: { fontFamily: "Montserrat", fontWeight: 800, fontSize: 9, color: INK },
  hall: { fontSize: 6, color: INK_FAINT, marginTop: 1 },
  company: { fontFamily: "Montserrat", fontWeight: 700, fontSize: 8, color: INK },
  sub: { fontSize: 6.5, color: INK_FAINT, marginTop: 1 },
  does: { fontSize: 7, color: INK_SOFT },
  want: { fontSize: 7, color: INK, fontFamily: "Poppins", fontWeight: 500, marginTop: 1.5 },
  td: { fontSize: 7, color: INK_SOFT },
  tdRed: { fontSize: 7, color: RED, fontFamily: "Poppins", fontWeight: 700 },

  notesLine: { borderBottomWidth: 1, borderBottomColor: LINE, height: 11, marginTop: 4 },

  sectionHead: {
    fontFamily: "Montserrat", fontWeight: 800, fontSize: 9, color: INK,
    marginTop: 14, marginBottom: 5,
  },
  empty: { fontSize: 8, color: INK_FAINT, fontStyle: "italic", marginTop: 10 },

  footer: {
    position: "absolute", bottom: 18, left: 28, right: 28,
    borderTopWidth: 1, borderTopColor: LINE, paddingTop: 6,
    flexDirection: "row", justifyContent: "space-between",
  },
  footerText: { fontSize: 6.5, color: INK_FAINT, letterSpacing: 0.4 },
});

// Column widths must sum to 100.
const W = { tick: 4, booth: 10, company: 26, what: 34, project: 16, who: 10 };

export type TargetRow = {
  booth: string | null;
  hall: string | null;
  company: string;
  description: string | null;
  listing: string;
  sponsorTier: string | null;
  want: string | null;
  projects: string[];
  owners: string[];
  meetingStatus: string;
  reputationScore: number | null;
  riskVerified: boolean;
};

export type TargetListProps = {
  showName: string;
  showWhen: string;
  showWhere: string;
  ourBooth: string | null;
  generatedOn: string;
  rows: TargetRow[];
};

/** Booth codes sort as a walking route: A9 before A10, blanks last. */
function boothSort(a: TargetRow, b: TargetRow): number {
  const pa = (a.booth ?? "").match(/^([A-Za-z]*)[-\s]?(\d*)(.*)$/) ?? [];
  const pb = (b.booth ?? "").match(/^([A-Za-z]*)[-\s]?(\d*)(.*)$/) ?? [];
  if (!a.booth && b.booth) return 1;
  if (a.booth && !b.booth) return -1;
  const alpha = (pa[1] ?? "").localeCompare(pb[1] ?? "");
  if (alpha !== 0) return alpha;
  const na = pa[2] ? parseInt(pa[2], 10) : Number.MAX_SAFE_INTEGER;
  const nb = pb[2] ? parseInt(pb[2], 10) : Number.MAX_SAFE_INTEGER;
  if (na !== nb) return na - nb;
  return a.company.localeCompare(b.company);
}

export function MeetingTargetListDocument(props: TargetListProps) {
  const { showName, showWhen, showWhere, ourBooth, generatedOn, rows } = props;

  const sorted = [...rows].sort(boothSort);
  const unassigned = rows.filter((r) => r.owners.length === 0).length;
  const met = rows.filter((r) => r.meetingStatus === "Met").length;
  const noBooth = sorted.filter((r) => !r.booth).length;
  const logo = findLogoPath();

  return (
    <Document title={`${showName} — meeting target list`}>
      <Page size="A4" style={s.page} wrap>
        <View style={s.headerRow} fixed>
          <View>
            {logo ? <Image src={logo} style={s.logo} /> : <Text style={s.title}>Z1POWER</Text>}
            <Text style={[s.kickerRight, { textAlign: "left", marginTop: 4 }]}>
              MEETING TARGET LIST
            </Text>
          </View>
          <View>
            <Text style={s.kickerRight}>{rows.length} TARGETS</Text>
            <Text style={s.metaRight}>Sorted by booth</Text>
            <Text style={s.metaRight}>Generated {generatedOn}</Text>
          </View>
        </View>
        <View style={s.hr} fixed />

        <Text style={s.title}>{showName}</Text>
        <Text style={s.meta}>
          {showWhen}
          {showWhere ? ` · ${showWhere}` : ""}
          {ourBooth ? ` · our booth ${ourBooth}` : ""}
        </Text>

        <View style={s.sumRow}>
          <View style={s.sumBox}>
            <Text style={s.sumLabel}>TARGETS</Text>
            <Text style={s.sumValue}>{rows.length}</Text>
          </View>
          <View style={s.sumBox}>
            <Text style={s.sumLabel}>MET</Text>
            <Text style={s.sumValue}>{met}</Text>
          </View>
          <View style={s.sumBox}>
            <Text style={s.sumLabel}>UNASSIGNED</Text>
            <Text style={[s.sumValue, unassigned > 0 ? { color: RED } : {}]}>{unassigned}</Text>
          </View>
          <View style={s.sumBox}>
            <Text style={s.sumLabel}>NO BOOTH YET</Text>
            <Text style={s.sumValue}>{noBooth}</Text>
          </View>
        </View>

        {sorted.length === 0 ? (
          <Text style={s.empty}>
            Nothing is flagged for a meeting at this show yet.
          </Text>
        ) : (
          <>
            <View style={s.th} fixed>
              <Text style={[s.thText, { width: `${W.tick}%` }]} />
              <Text style={[s.thText, { width: `${W.booth}%` }]}>BOOTH</Text>
              <Text style={[s.thText, { width: `${W.company}%` }]}>COMPANY</Text>
              <Text style={[s.thText, { width: `${W.what}%` }]}>WHAT THEY DO / WHAT WE WANT</Text>
              <Text style={[s.thText, { width: `${W.project}%` }]}>PROJECT</Text>
              <Text style={[s.thText, { width: `${W.who}%` }]}>WHO</Text>
            </View>

            {sorted.map((r, i) => (
              <View key={i} style={[s.tr, i % 2 === 1 ? s.trAlt : {}]} wrap={false}>
                <View style={{ width: `${W.tick}%`, paddingTop: 1 }}>
                  <View style={s.tick} />
                </View>

                <View style={{ width: `${W.booth}%` }}>
                  <Text style={s.booth}>{r.booth || "—"}</Text>
                  {r.hall ? <Text style={s.hall}>{r.hall}</Text> : null}
                </View>

                <View style={{ width: `${W.company}%`, paddingRight: 4 }}>
                  <Text style={s.company}>{r.company}</Text>
                  <Text style={s.sub}>
                    {r.listing !== "Exhibitor" ? (r.sponsorTier || r.listing) : ""}
                    {r.reputationScore !== null
                      ? `${r.listing !== "Exhibitor" ? " · " : ""}score ${r.reputationScore}${r.riskVerified ? "" : "?"}`
                      : ""}
                  </Text>
                </View>

                <View style={{ width: `${W.what}%`, paddingRight: 4 }}>
                  {r.description ? <Text style={s.does}>{r.description}</Text> : null}
                  {r.want ? <Text style={s.want}>{r.want}</Text> : null}
                  {!r.description && !r.want ? <Text style={s.does}>—</Text> : null}
                </View>

                <Text style={[s.td, { width: `${W.project}%`, paddingRight: 3 }]}>
                  {r.projects.join(", ") || "—"}
                </Text>

                <Text
                  style={[
                    r.owners.length === 0 ? s.tdRed : s.td,
                    { width: `${W.who}%` },
                  ]}
                >
                  {r.owners.length > 0 ? r.owners.join(", ") : "UNASSIGNED"}
                </Text>
              </View>
            ))}
          </>
        )}

        {sorted.length > 0 && (
          <>
            <Text style={s.sectionHead}>Notes</Text>
            {Array.from({ length: 6 }).map((_, i) => (
              <View key={i} style={s.notesLine} />
            ))}
          </>
        )}

        <View style={s.footer} fixed>
          <Text style={s.footerText}>Z1POWER TEAM HUB · szhholdings.com</Text>
          <Text
            style={s.footerText}
            render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}
