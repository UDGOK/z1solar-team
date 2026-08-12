import React from "react";
import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import path from "path";

const GREEN = "#4CAB3E";
const GREEN_DARK = "#3F9634";
const GREEN_TINT = "#F5F9F3";
const INK = "#1C1C1C";
const INK_SOFT = "#3A3A3A";
const INK_FAINT = "#8A8A85";
const LINE = "#D8D8D2";
const WHITE = "#FFFFFF";
const RED = "#C0392B";

// Resolved at render time via the same multi-path probe as the fonts —
// process.cwd() alone is unreliable inside a Vercel serverless bundle.
import { findLogoPath } from "./fonts";

const s = StyleSheet.create({
  page: { padding: 28, fontFamily: "Poppins", fontSize: 8, color: INK },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  logo: { width: 80, height: 29 },
  kickerRight: { fontFamily: "Poppins", fontWeight: 700, fontSize: 7, color: GREEN_DARK, letterSpacing: 1 },
  hr: { borderBottomWidth: 2, borderBottomColor: GREEN, marginTop: 6, marginBottom: 14 },
  title: { fontFamily: "Montserrat", fontWeight: 800, fontSize: 18, color: INK },
  meta: { fontSize: 7.5, color: INK_FAINT, marginTop: 3, marginBottom: 12 },

  sumRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  sumBox: { flex: 1, borderWidth: 1, borderColor: LINE, borderRadius: 3, padding: 6 },
  sumLabel: { fontFamily: "Poppins", fontWeight: 700, fontSize: 6, color: GREEN_DARK, letterSpacing: 0.5 },
  sumValue: { fontFamily: "Montserrat", fontWeight: 800, fontSize: 10, color: INK, marginTop: 1 },

  th: { backgroundColor: INK, paddingVertical: 4, paddingHorizontal: 3, flexDirection: "row" },
  thText: { fontFamily: "Poppins", fontWeight: 700, fontSize: 6, color: WHITE, letterSpacing: 0.4 },
  tr: { flexDirection: "row", paddingVertical: 3.5, paddingHorizontal: 3, borderBottomWidth: 1, borderBottomColor: LINE },
  trAlt: { backgroundColor: GREEN_TINT },
  td: { fontSize: 7, color: INK_SOFT },
  tdBold: { fontSize: 7, fontFamily: "Poppins", fontWeight: 700, color: INK },
  tfoot: { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 3, backgroundColor: INK },
  tfText: { fontFamily: "Poppins", fontWeight: 700, fontSize: 7.5, color: WHITE },

  footer: {
    position: "absolute", bottom: 18, left: 28, right: 28,
    borderTopWidth: 1, borderTopColor: LINE, paddingTop: 6,
    flexDirection: "row", justifyContent: "space-between",
  },
  footerText: { fontSize: 6.5, color: INK_FAINT, letterSpacing: 0.4 },
});

// Column widths must sum to 100.
const W = { cat: 11, desc: 24, vendor: 12, qty: 5, unit: 10, budget: 11, actual: 11, variance: 9, status: 7 };

function money(n: number): string {
  const v = Math.round(n * 100) / 100;
  return "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export type LedgerLine = {
  category: string;
  description: string;
  vendor: string | null;
  qty: number;
  unitCost: number;
  budgetAmount: number;
  actualAmount: number;
  status: string;
  invoiceRef: string | null;
};

export function FinancialLedgerDocument({
  projectTitle,
  lines,
  generatedAt,
}: {
  projectTitle: string;
  lines: LedgerLine[];
  generatedAt: Date;
}) {
  const LOGO = findLogoPath();
  const budget = lines.reduce((a, l) => a + l.budgetAmount, 0);
  const actual = lines.reduce((a, l) => a + l.actualAmount, 0);
  const committed = lines
    .filter((l) => ["Committed", "Invoiced", "Paid"].includes(l.status))
    .reduce((a, l) => a + l.budgetAmount, 0);
  const paid = lines.filter((l) => l.status === "Paid").reduce((a, l) => a + l.actualAmount, 0);
  const variance = budget - actual;

  return (
    <Document title={`${projectTitle} — Financial Ledger`}>
      <Page size="LETTER" orientation="landscape" style={s.page}>
        <View style={s.headerRow}>
          {LOGO ? <Image src={LOGO} style={s.logo} /> : <Text style={s.kickerRight}>Z1POWER</Text>}
          <Text style={s.kickerRight}>FINANCIAL LEDGER</Text>
        </View>
        <View style={s.hr} />

        <Text style={s.title}>{projectTitle}</Text>
        <Text style={s.meta}>
          Generated {generatedAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} ·{" "}
          {lines.length} line item{lines.length === 1 ? "" : "s"}
        </Text>

        <View style={s.sumRow}>
          {[
            ["BUDGET", money(budget)],
            ["COMMITTED", money(committed)],
            ["ACTUAL", money(actual)],
            ["PAID", money(paid)],
            ["VARIANCE", money(variance)],
          ].map(([label, value]) => (
            <View key={label} style={s.sumBox}>
              <Text style={s.sumLabel}>{label}</Text>
              <Text style={[s.sumValue, label === "VARIANCE" && variance < 0 ? { color: RED } : {}]}>{value}</Text>
            </View>
          ))}
        </View>

        <View style={s.th}>
          <View style={{ width: `${W.cat}%` }}><Text style={s.thText}>CATEGORY</Text></View>
          <View style={{ width: `${W.desc}%` }}><Text style={s.thText}>DESCRIPTION</Text></View>
          <View style={{ width: `${W.vendor}%` }}><Text style={s.thText}>VENDOR</Text></View>
          <View style={{ width: `${W.qty}%` }}><Text style={s.thText}>QTY</Text></View>
          <View style={{ width: `${W.unit}%` }}><Text style={s.thText}>UNIT COST</Text></View>
          <View style={{ width: `${W.budget}%` }}><Text style={s.thText}>BUDGET</Text></View>
          <View style={{ width: `${W.actual}%` }}><Text style={s.thText}>ACTUAL</Text></View>
          <View style={{ width: `${W.variance}%` }}><Text style={s.thText}>VARIANCE</Text></View>
          <View style={{ width: `${W.status}%` }}><Text style={s.thText}>STATUS</Text></View>
        </View>

        {lines.map((l, i) => {
          const v = l.budgetAmount - l.actualAmount;
          return (
            <View key={i} style={[s.tr, i % 2 === 1 ? s.trAlt : {}]} wrap={false}>
              <View style={{ width: `${W.cat}%` }}><Text style={s.td}>{l.category}</Text></View>
              <View style={{ width: `${W.desc}%` }}><Text style={s.td}>{l.description}</Text></View>
              <View style={{ width: `${W.vendor}%` }}><Text style={s.td}>{l.vendor || "—"}</Text></View>
              <View style={{ width: `${W.qty}%` }}><Text style={s.td}>{l.qty}</Text></View>
              <View style={{ width: `${W.unit}%` }}><Text style={s.td}>{money(l.unitCost)}</Text></View>
              <View style={{ width: `${W.budget}%` }}><Text style={s.tdBold}>{money(l.budgetAmount)}</Text></View>
              <View style={{ width: `${W.actual}%` }}><Text style={s.td}>{money(l.actualAmount)}</Text></View>
              <View style={{ width: `${W.variance}%` }}>
                <Text style={[s.td, v < 0 ? { color: RED, fontWeight: 700 } : {}]}>{money(v)}</Text>
              </View>
              <View style={{ width: `${W.status}%` }}><Text style={s.td}>{l.status}</Text></View>
            </View>
          );
        })}

        <View style={s.tfoot}>
          <View style={{ width: `${W.cat + W.desc + W.vendor + W.qty + W.unit}%` }}><Text style={s.tfText}>TOTAL</Text></View>
          <View style={{ width: `${W.budget}%` }}><Text style={s.tfText}>{money(budget)}</Text></View>
          <View style={{ width: `${W.actual}%` }}><Text style={s.tfText}>{money(actual)}</Text></View>
          <View style={{ width: `${W.variance}%` }}><Text style={s.tfText}>{money(variance)}</Text></View>
          <View style={{ width: `${W.status}%` }}><Text style={s.tfText}></Text></View>
        </View>

        <View style={s.footer} fixed>
          <Text style={s.footerText}>CONFIDENTIAL — Z1POWER INTERNAL</Text>
          <Text style={s.footerText} render={({ pageNumber, totalPages }) => `PAGE ${pageNumber} OF ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
