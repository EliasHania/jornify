// src/lib/badges.ts — credenciales imprimibles con QR para el kiosco (tamaño tarjeta 85 × 54 mm, 10 por A4)
import { qrDataUrl } from "@/components/QrCode";
import { t } from "@/i18n";

export type Badge = { name: string; code: string; workerCode?: string | null };

export async function downloadBadgesPdf(company: string, badges: Badge[]) {
  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 85, H = 54, MX = 15, MY = 13, GX = 10, GY = 2;
  for (let i = 0; i < badges.length; i++) {
    if (i > 0 && i % 10 === 0) doc.addPage();
    const k = i % 10;
    const x = MX + (k % 2) * (W + GX);
    const y = MY + Math.floor(k / 2) * (H + GY);
    const b = badges[i];
    doc.setDrawColor(200); doc.setLineDashPattern([1, 1], 0);
    doc.roundedRect(x, y, W, H, 3, 3);
    doc.setLineDashPattern([], 0);
    const img = await qrDataUrl(b.code, 400);
    doc.addImage(img, "PNG", x + W - 44, y + 6, 40, 40);
    doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(20);
    const name = doc.splitTextToSize(b.name, W - 50) as string[];
    doc.text(name.slice(0, 2), x + 5, y + 14);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(90);
    doc.text(doc.splitTextToSize(company, W - 50).slice(0, 2) as string[], x + 5, y + 27);
    if (b.workerCode) doc.text(b.workerCode, x + 5, y + 36);
    doc.setFontSize(6.5); doc.setTextColor(130);
    doc.text(t("badges.title"), x + 5, y + H - 6);
    doc.text(t("badges.personal"), x + 5, y + H - 3);
  }
  doc.save(`${t("badges.file")}_${new Date().toISOString().slice(0, 10)}.pdf`);
}
