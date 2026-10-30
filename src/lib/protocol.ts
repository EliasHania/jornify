// src/lib/protocol.ts — documento "Protocolo del sistema de registro de jornada"
import { DateTime } from "luxon";
import { TZ } from "@/lib/format";
import { privacyUrl, termsUrl } from "@/lib/config";
import { t } from "@/i18n";

export type ProtocolInput = {
  legalName: string;
  cif: string;
  address: string;
  collectiveAgreement: string;
  centers: { name: string; address: string | null; radius_m: number }[];
  allowRemote: boolean;
  geofenceMode: "flag" | "block";
  maxShiftHours: number;
  fullTimeHours: number;
  annualHours: number | null;
  overtimeCompensation: string;
  hasRlt: boolean;
  rltConsultedAt: string | null;
  notes: string;
};

export async function downloadProtocolPdf(d: ProtocolInput) {
  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 18;
  let y = 18;

  const ensure = (h: number) => { if (y + h > H - 16) { doc.addPage(); y = 18; } };
  const h1 = (s: string) => { doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(20); doc.text(s, M, y); y += 7; };
  const h2 = (s: string) => { ensure(12); y += 2; doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(20); doc.text(s, M, y); y += 5.5; };
  const p = (s: string) => {
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(40);
    const lines = doc.splitTextToSize(s, W - M * 2) as string[];
    for (const l of lines) { ensure(5); doc.text(l, M, y); y += 4.4; }
    y += 1.5;
  };
  const li = (s: string) => {
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(40);
    const lines = doc.splitTextToSize(s, W - M * 2 - 5) as string[];
    lines.forEach((l, i) => { ensure(5); if (i === 0) doc.text("•", M + 1, y); doc.text(l, M + 5, y); y += 4.4; });
    y += 0.6;
  };

  const longDate = (iso?: string) => (iso ? DateTime.fromISO(iso) : DateTime.now().setZone(TZ)).toLocaleString(DateTime.DATE_FULL);
  const today = longDate();
  const comp = d.overtimeCompensation === "descanso" ? t("proto.compRest") : d.overtimeCompensation === "mixta" ? t("proto.compMixed") : t("proto.compPay");
  const dash = "—";

  h1(t("proto.title"));
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(110);
  doc.text(t("proto.sub", { name: d.legalName || dash, cif: d.cif || dash, date: today }), M, y); y += 8;

  if (t("proto.translationNote")) p(t("proto.translationNote"));
  p(t("proto.intro"));

  h2(t("proto.s1"));
  li(t("proto.s1a", { name: d.legalName || dash, cif: d.cif || dash, address: d.address || dash }));
  li(t("proto.s1b", { agreement: d.collectiveAgreement || t("proto.notStated") }));
  li(t("proto.s1c", { centers: d.centers.length ? d.centers.map((c) => `${c.name}${c.address ? ` (${c.address})` : ""}`).join("; ") : dash }));
  li(t("proto.s1d"));

  h2(t("proto.s2"));
  li(t("proto.s2a"));
  li(t("proto.s2b"));
  li(t("proto.s2c"));
  li(t("proto.s2d"));

  h2(t("proto.s3"));
  li(t("proto.s3a"));
  li(d.geofenceMode === "block" ? t("proto.s3block") : t("proto.s3flag"));
  li(t("proto.s3radii", { list: d.centers.map((c) => `${c.name} ${c.radius_m} m`).join("; ") || dash }));
  li(d.allowRemote ? t("proto.s3remote") : t("proto.s3noRemote"));
  li(t("proto.s3info"));

  h2(t("proto.s4"));
  li(t("proto.s4a"));
  li(d.annualHours ? t("proto.s4bAnnual", { full: d.fullTimeHours, annual: d.annualHours }) : t("proto.s4b", { full: d.fullTimeHours }));
  li(t("proto.s4c"));

  h2(t("proto.s5"));
  li(t("proto.s5a"));
  li(t("proto.s5b", { comp }));
  li(t("proto.s5c"));

  h2(t("proto.s6"));
  li(t("proto.s6a"));
  li(t("proto.s6b"));
  li(t("proto.s6c"));
  li(t("proto.s6d", { h: d.maxShiftHours }));

  h2(t("proto.s7"));
  li(t("proto.s7a"));
  li(d.hasRlt ? t("proto.s7rlt") : t("proto.s7noRlt"));
  li(t("proto.s7insp"));

  h2(t("proto.s8"));
  li(t("proto.s8a"));
  li(t("proto.s8b", { privacy: privacyUrl(), terms: termsUrl() }));

  h2(t("proto.s9"));
  p(d.hasRlt
    ? (d.rltConsultedAt ? t("proto.s9done", { date: longDate(d.rltConsultedAt) }) : t("proto.s9pending"))
    : t("proto.s9none"));

  if (d.notes.trim()) {
    h2(t("proto.s10"));
    p(d.notes.trim());
  }

  ensure(40);
  y += 8;
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(90);
  doc.text(t("proto.byCompany"), M, y);
  doc.text(d.hasRlt ? t("proto.byRlt") : t("proto.received"), W / 2 + 4, y);
  doc.setDrawColor(170);
  doc.line(M, y + 16, M + 70, y + 16);
  doc.line(W / 2 + 4, y + 16, W / 2 + 74, y + 16);
  doc.text(t("proto.date"), M, y + 22);
  doc.text(t("proto.date"), W / 2 + 4, y + 22);

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7); doc.setTextColor(160);
    doc.text(t("proto.footer", { name: d.legalName || "", i, n: pages }), W / 2, H - 7, { align: "center" });
  }
  doc.save(`${t("proto.file")}_${(d.cif || "empresa").replace(/\W+/g, "")}.pdf`);
}
