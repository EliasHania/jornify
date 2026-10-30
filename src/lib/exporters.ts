// src/lib/exporters.ts — Excel, CSV y PDF
import { DateTime } from "luxon";
import { TZ } from "@/lib/format";
import { t } from "@/i18n";

export type Cell = string | number | null | undefined;
export type SheetSpec = {
  name: string;
  /** Filas de cabecera informativa (clave, valor) que van encima de la tabla */
  info?: [string, Cell][];
  title?: string;
  head: string[];
  rows: Cell[][];
  widths?: number[];
  footer?: [string, Cell][];
};

const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_");

export async function downloadXlsx(filename: string, sheets: SheetSpec[]) {
  const XLSX = await import("xlsx-js-style");
  const wb = XLSX.utils.book_new();
  const bold = { font: { bold: true, name: "Calibri", sz: 11 } };
  const title = { font: { bold: true, name: "Calibri", sz: 13 } };
  const head = {
    font: { bold: true, name: "Calibri", sz: 11, color: { rgb: "FFFFFF" } },
    fill: { fgColor: { rgb: "1E293B" } },
    alignment: { vertical: "center", wrapText: true },
  };
  const cell = { font: { name: "Calibri", sz: 11 }, alignment: { vertical: "top", wrapText: true } };

  for (const s of sheets) {
    const aoa: { v: Cell; s: object }[][] = [];
    if (s.title) aoa.push([{ v: s.title, s: title }], []);
    for (const [k, v] of s.info ?? []) aoa.push([{ v: k, s: bold }, { v: v ?? "—", s: cell }]);
    if (s.info?.length) aoa.push([]);
    aoa.push(s.head.map((h) => ({ v: h, s: head })));
    for (const r of s.rows) aoa.push(r.map((v) => ({ v: v ?? "", s: cell })));
    if (s.footer?.length) {
      aoa.push([]);
      for (const [k, v] of s.footer) aoa.push([{ v: k, s: bold }, { v: v ?? "", s: cell }]);
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa.map((r) => r.map((c) => (c.v === undefined || c.v === null ? { v: "", s: c.s } : c))));
    ws["!cols"] = (s.widths ?? s.head.map(() => 16)).map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  XLSX.writeFile(wb, `${safeName(filename)}.xlsx`);
}

export function downloadCsv(filename: string, head: string[], rows: Cell[][]) {
  const esc = (v: Cell) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = "﻿" + [head, ...rows].map((r) => r.map(esc).join(";")).join("\r\n");
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${safeName(filename)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export type PdfSpec = {
  filename: string;
  title: string;
  subtitle?: string;
  landscape?: boolean;
  /** Bloques de datos en dos columnas (p. ej. empresa / trabajador) */
  blocks?: { heading: string; rows: [string, string][] }[];
  tables: { title?: string; head: string[]; body: Cell[][]; colWidths?: number[] }[];
  notes?: string[];
  signatures?: boolean;
};

export async function downloadPdf(spec: PdfSpec) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: spec.landscape ? "landscape" : "portrait", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 14;
  const gray: [number, number, number] = [100, 100, 100];
  const black: [number, number, number] = [20, 20, 20];
  const now = DateTime.now().setZone(TZ).toFormat("dd/MM/yyyy HH:mm");

  doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(...black);
  doc.text(spec.title, M, 16);
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...gray);
  if (spec.subtitle) doc.text(spec.subtitle, M, 21);
  doc.text(t("exp.generated", { when: now }), W - M, 21, { align: "right" });
  doc.setDrawColor(220, 220, 220); doc.line(M, 24, W - M, 24);

  let y = 29;
  if (spec.blocks?.length) {
    const n = spec.blocks.length;
    const colW = (W - M * 2 - 6 * (n - 1)) / n;
    let maxY = y;
    spec.blocks.forEach((b, i) => {
      const x = M + i * (colW + 6);
      let yy = y;
      doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(...gray);
      doc.text(b.heading.toUpperCase(), x, yy);
      yy += 4.5;
      for (const [k, v] of b.rows) {
        doc.setFont("helvetica", "bold"); doc.setFontSize(6.8); doc.setTextColor(...gray);
        doc.text(k, x, yy);
        doc.setFont("helvetica", "normal"); doc.setFontSize(7.8); doc.setTextColor(...black);
        const lines = doc.splitTextToSize(v || "—", colW) as string[];
        doc.text(lines, x, yy + 3.5);
        yy += 3.5 + lines.length * 3.4 + 1.6;
      }
      maxY = Math.max(maxY, yy);
    });
    y = maxY + 1;
    doc.setDrawColor(220, 220, 220); doc.line(M, y, W - M, y);
    y += 4;
  }

  for (const tb of spec.tables) {
    if (tb.title) {
      if (y > H - 30) { doc.addPage(); y = 16; }
      doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(...black);
      doc.text(tb.title, M, y);
      y += 2.5;
    }
    autoTable(doc, {
      startY: y,
      head: [tb.head],
      body: tb.body.map((r) => r.map((c) => (c === null || c === undefined ? "" : String(c)))),
      margin: { left: M, right: M },
      styles: { font: "helvetica", fontSize: 6.8, cellPadding: 1.4, textColor: [20, 20, 20], valign: "middle", overflow: "linebreak" },
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 6.8 },
      alternateRowStyles: { fillColor: [247, 248, 250] },
      columnStyles: Object.fromEntries((tb.colWidths ?? []).map((w, i) => [i, { cellWidth: w }])),
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  }

  if (spec.notes?.length) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.8); doc.setTextColor(...gray);
    for (const n of spec.notes) {
      const lines = doc.splitTextToSize(n, W - M * 2) as string[];
      if (y + lines.length * 3.2 > H - 14) { doc.addPage(); y = 16; }
      doc.text(lines, M, y);
      y += lines.length * 3.2 + 1.5;
    }
  }

  if (spec.signatures) {
    if (y + 24 > H - 12) { doc.addPage(); y = 20; }
    y += 6;
    doc.setFontSize(7.5); doc.setTextColor(...gray);
    doc.text(t("exp.signWorker"), M, y);
    doc.text(t("exp.signCompany"), W / 2 + 6, y);
    doc.setDrawColor(180, 180, 180);
    doc.line(M, y + 13, M + 70, y + 13);
    doc.line(W / 2 + 6, y + 13, W / 2 + 76, y + 13);
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(6.5); doc.setTextColor(170, 170, 170);
    doc.text(t("exp.footer", { i, n: pages }), W / 2, H - 6, { align: "center" });
  }
  doc.save(`${safeName(spec.filename)}.pdf`);
}
