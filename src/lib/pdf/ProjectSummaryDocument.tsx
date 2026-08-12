import React from "react";
import { Document, Page, View, Text, Image, Font, StyleSheet, Svg, Circle } from "@react-pdf/renderer";
import path from "path";

// ---------- fonts ----------
const FONT_DIR = path.join(process.cwd(), "src/lib/pdf/fonts");

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

// ---------- brand ----------
const GREEN = "#4CAB3E";
const GREEN_DARK = "#3F9634";
const GREEN_TINT = "#F5F9F3";
const INK = "#1C1C1C";
const INK_SOFT = "#3A3A3A";
const INK_FAINT = "#8A8A85";
const LINE = "#D8D8D2";
const WHITE = "#FFFFFF";

const STATUS_COLOR: Record<string, string> = {
  Planning: "#8A8A85",
  "On Track": GREEN,
  "At Risk": "#E8743B",
  Delayed: "#C0392B",
  Complete: GREEN_DARK,
};

const LOGO_PATH = path.join(process.cwd(), "public/logo.png");

const s = StyleSheet.create({
  page: { padding: 36, fontFamily: "Poppins", fontSize: 9.5, color: INK },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  logo: { width: 90, height: 33 },
  kickerRight: { fontFamily: "Poppins", fontWeight: 700, fontSize: 8, color: GREEN_DARK, letterSpacing: 1 },
  hr: { borderBottomWidth: 2, borderBottomColor: GREEN, marginBottom: 18, marginTop: 8 },

  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 4 },
  category: { fontFamily: "Poppins", fontWeight: 700, fontSize: 8, color: GREEN_DARK, letterSpacing: 1 },
  title: { fontFamily: "Montserrat", fontWeight: 800, fontSize: 24, color: INK, marginTop: 2 },
  meta: { fontSize: 8.5, color: INK_FAINT, marginTop: 10 },

  topGrid: { flexDirection: "row", gap: 16, marginTop: 18, marginBottom: 18 },
  ringBox: {
    width: 150,
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 6,
    padding: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  statusBadge: {
    marginTop: 8,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 3,
    fontFamily: "Poppins",
    fontWeight: 700,
    fontSize: 8,
    color: WHITE,
    letterSpacing: 1,
  },
  teamBox: { flex: 1, borderWidth: 1, borderColor: LINE, borderRadius: 6, padding: 14 },

  kicker: { fontFamily: "Poppins", fontWeight: 700, fontSize: 8, color: GREEN_DARK, letterSpacing: 1, marginBottom: 6 },

  teamHeaderRow: { flexDirection: "row", backgroundColor: INK, paddingVertical: 5, paddingHorizontal: 6, borderRadius: 2 },
  teamHeaderCell: { fontFamily: "Poppins", fontWeight: 700, fontSize: 7, color: WHITE, letterSpacing: 0.5 },
  teamRow: { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: LINE },
  teamRowLead: { backgroundColor: GREEN_TINT },
  teamCell: { fontSize: 8.5, color: INK_SOFT },
  teamCellBold: { fontSize: 8.5, color: INK, fontFamily: "Poppins", fontWeight: 700 },

  section: { marginBottom: 16 },
  bulletRow: { flexDirection: "row", marginBottom: 3 },
  bulletDot: { width: 10, fontSize: 9, color: GREEN_DARK },
  bulletText: { flex: 1, fontSize: 9, color: INK_SOFT, lineHeight: 1.4 },

  twoCol: { flexDirection: "row", gap: 16 },
  colHalf: { flex: 1 },

  dateRow: { flexDirection: "row", paddingVertical: 3, borderBottomWidth: 1, borderBottomColor: LINE },
  dateCell: { width: 60, fontSize: 7.5, fontFamily: "Poppins", fontWeight: 700, color: INK_FAINT },
  milestoneCell: { flex: 1, fontSize: 8.5, color: INK_SOFT },

  todoRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 4 },
  checkbox: { width: 9, height: 9, borderWidth: 1, borderColor: GREEN_DARK, borderRadius: 2, marginRight: 6, marginTop: 1 },
  checkboxDone: { backgroundColor: GREEN },
  todoText: { flex: 1, fontSize: 8.5, color: INK_SOFT, lineHeight: 1.3 },
  todoDone: { textDecoration: "line-through", color: INK_FAINT },

  finBox: { backgroundColor: GREEN_TINT, borderRadius: 6, padding: 14, marginTop: 4 },
  finGrid: { flexDirection: "row", flexWrap: "wrap" },
  finItem: { width: "25%", marginBottom: 10 },
  finLabel: { fontFamily: "Poppins", fontWeight: 700, fontSize: 7, color: GREEN_DARK, letterSpacing: 0.5, marginBottom: 2 },
  finValue: { fontFamily: "Poppins", fontWeight: 700, fontSize: 11, color: INK },

  footer: {
    position: "absolute",
    bottom: 24,
    left: 36,
    right: 36,
    borderTopWidth: 1,
    borderTopColor: LINE,
    paddingTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: { fontSize: 7, color: INK_FAINT, letterSpacing: 0.5 },
});

function money(n: number): string {
  if (!n) return "$0";
  return "$" + Math.round(n).toLocaleString("en-US");
}

function fmtDate(d: Date | string | null): string {
  if (!d) return "TBD";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
}

function CompletionRingPdf({ pct, status }: { pct: number; status: string }) {
  const size = 84;
  const stroke = 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  // react-pdf's <Circle> doesn't support strokeDashoffset (only strokeDasharray),
  // so the progress arc has to be expressed as the dash length itself — draw
  // `clamped%` of the circumference as the dash, then a gap covering the rest.
  const progressLength = (clamped / 100) * c;
  const color = STATUS_COLOR[status] || GREEN;

  return (
    <View style={{ alignItems: "center" }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="#EEEEE9" strokeWidth={stroke} fill="none" />
        {clamped > 0 && (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={`${progressLength} ${c}`}
            strokeLinecap="round"
            transform={`rotate(-90, ${size / 2}, ${size / 2})`}
          />
        )}
      </Svg>
      <Text style={{ position: "absolute", top: 30, fontFamily: "Montserrat", fontWeight: 800, fontSize: 17, color: INK }}>
        {clamped}%
      </Text>
      <View style={[s.statusBadge, { backgroundColor: color }]}>
        <Text>{status.toUpperCase()}</Text>
      </View>
    </View>
  );
}

export type PdfProject = {
  title: string;
  category: string;
  status: string;
  completionPct: number;
  lead: { name: string; title: string | null } | null;
  members: { member: { name: string; title: string | null }; role: string | null; tasks: string | null }[];
  talkingPoints: { text: string }[];
  keyDates: { milestone: string; date: Date | string | null }[];
  todos: { text: string; done: boolean }[];
  estBudget: number;
  committed: number;
  actualSpend: number;
  q3Proj: number;
  q4Proj: number;
  q1Proj: number;
  q2Proj: number;
  notes: string | null;
};

export function ProjectSummaryDocument({ project, generatedAt }: { project: PdfProject; generatedAt: Date }) {
  const remaining = project.estBudget - project.actualSpend;
  const totalProjected = project.q3Proj + project.q4Proj + project.q1Proj + project.q2Proj;
  const openTodos = project.todos.filter((t) => !t.done).length;

  return (
    <Document title={`${project.title} — Z1Power Project Summary`}>
      <Page size="LETTER" style={s.page}>
        {/* Header */}
        <View style={s.headerRow}>
          <Image src={LOGO_PATH} style={s.logo} />
          <Text style={s.kickerRight}>PROJECT SUMMARY</Text>
        </View>
        <View style={s.hr} />

        {/* Title */}
        <View style={s.titleRow}>
          <View>
            <Text style={s.category}>{project.category.toUpperCase()}</Text>
            <Text style={s.title}>{project.title}</Text>
          </View>
        </View>
        <Text style={s.meta}>Generated {generatedAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</Text>

        {/* Progress ring + Team */}
        <View style={s.topGrid}>
          <View style={s.ringBox}>
            <CompletionRingPdf pct={project.completionPct} status={project.status} />
          </View>
          <View style={s.teamBox}>
            <Text style={s.kicker}>TEAM</Text>
            <View style={s.teamHeaderRow}>
              <View style={{ width: 90 }}><Text style={s.teamHeaderCell}>NAME</Text></View>
              <View style={{ width: 85 }}><Text style={s.teamHeaderCell}>TITLE</Text></View>
              <View style={{ width: 78 }}><Text style={s.teamHeaderCell}>ROLE</Text></View>
              <View style={{ width: 89 }}><Text style={s.teamHeaderCell}>TASK(S)</Text></View>
            </View>
            <View style={[s.teamRow, s.teamRowLead]}>
              <View style={{ width: 90 }}><Text style={s.teamCellBold}>{project.lead?.name || "—"}</Text></View>
              <View style={{ width: 85 }}><Text style={s.teamCell}>{project.lead?.title || "—"}</Text></View>
              <View style={{ width: 78 }}><Text style={s.teamCell}>Project Lead</Text></View>
              <View style={{ width: 89 }}><Text style={s.teamCell}>—</Text></View>
            </View>
            {project.members.slice(0, 4).map((m, i) => (
              <View key={i} style={s.teamRow}>
                <View style={{ width: 90 }}><Text style={s.teamCellBold}>{m.member.name}</Text></View>
                <View style={{ width: 85 }}><Text style={s.teamCell}>{m.member.title || "—"}</Text></View>
                <View style={{ width: 78 }}><Text style={s.teamCell}>{m.role || "—"}</Text></View>
                <View style={{ width: 89 }}><Text style={s.teamCell}>{m.tasks || "—"}</Text></View>
              </View>
            ))}
          </View>
        </View>

        {/* Talking points */}
        {project.talkingPoints.length > 0 && (
          <View style={s.section}>
            <Text style={s.kicker}>TALKING POINTS</Text>
            {project.talkingPoints.map((t, i) => (
              <View key={i} style={s.bulletRow}>
                <Text style={s.bulletDot}>•</Text>
                <Text style={s.bulletText}>{t.text}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Key Dates + To-Do */}
        <View style={[s.twoCol, s.section]}>
          <View style={s.colHalf}>
            <Text style={s.kicker}>KEY DATES</Text>
            {project.keyDates.length === 0 && <Text style={s.bulletText}>No key dates set.</Text>}
            {project.keyDates.map((k, i) => (
              <View key={i} style={s.dateRow}>
                <Text style={s.dateCell}>{fmtDate(k.date)}</Text>
                <Text style={s.milestoneCell}>{k.milestone}</Text>
              </View>
            ))}
          </View>
          <View style={s.colHalf}>
            <Text style={s.kicker}>
              TO-DO {openTodos > 0 ? `(${openTodos} OPEN)` : project.todos.length > 0 ? "(ALL COMPLETE)" : ""}
            </Text>
            {project.todos.length === 0 && <Text style={s.bulletText}>No action items.</Text>}
            {project.todos.map((t, i) => (
              <View key={i} style={s.todoRow}>
                <View style={[s.checkbox, t.done ? s.checkboxDone : {}]} />
                <Text style={[s.todoText, t.done ? s.todoDone : {}]}>{t.text}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Financials */}
        <View style={s.section}>
          <Text style={s.kicker}>FINANCIALS & PROJECTIONS</Text>
          <View style={s.finBox}>
            <View style={s.finGrid}>
              <View style={s.finItem}>
                <Text style={s.finLabel}>EST. BUDGET</Text>
                <Text style={s.finValue}>{money(project.estBudget)}</Text>
              </View>
              <View style={s.finItem}>
                <Text style={s.finLabel}>COMMITTED</Text>
                <Text style={s.finValue}>{money(project.committed)}</Text>
              </View>
              <View style={s.finItem}>
                <Text style={s.finLabel}>SPENT TO DATE</Text>
                <Text style={s.finValue}>{money(project.actualSpend)}</Text>
              </View>
              <View style={s.finItem}>
                <Text style={s.finLabel}>REMAINING</Text>
                <Text style={s.finValue}>{money(remaining)}</Text>
              </View>
              <View style={s.finItem}>
                <Text style={s.finLabel}>Q3 2026 PROJ.</Text>
                <Text style={s.finValue}>{money(project.q3Proj)}</Text>
              </View>
              <View style={s.finItem}>
                <Text style={s.finLabel}>Q4 2026 PROJ.</Text>
                <Text style={s.finValue}>{money(project.q4Proj)}</Text>
              </View>
              <View style={s.finItem}>
                <Text style={s.finLabel}>Q1 2027 PROJ.</Text>
                <Text style={s.finValue}>{money(project.q1Proj)}</Text>
              </View>
              <View style={s.finItem}>
                <Text style={s.finLabel}>TOTAL PROJECTED</Text>
                <Text style={s.finValue}>{money(totalProjected)}</Text>
              </View>
            </View>
          </View>
        </View>

        {project.notes && (
          <View style={s.section}>
            <Text style={s.kicker}>NOTES</Text>
            <Text style={[s.bulletText, { fontStyle: "italic" }]}>{project.notes}</Text>
          </View>
        )}

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>CONFIDENTIAL — Z1POWER INTERNAL</Text>
          <Text style={s.footerText} render={({ pageNumber, totalPages }) => `PAGE ${pageNumber} OF ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
