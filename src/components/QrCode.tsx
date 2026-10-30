// src/components/QrCode.tsx — dibuja un código QR (para enlaces de kiosco, credenciales y QR dinámico)
import { useEffect, useState } from "react";
import { t } from "@/i18n";

export async function qrDataUrl(text: string, size = 320) {
  const QR = await import("qrcode");
  return QR.toDataURL(text, { margin: 1, width: size, errorCorrectionLevel: "M", color: { dark: "#0f172a", light: "#ffffff" } });
}

export default function QrCode({ text, size = 220, className }: { text: string; size?: number; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    qrDataUrl(text, size * 2).then((u) => alive && setSrc(u)).catch(() => alive && setSrc(null));
    return () => { alive = false; };
  }, [text, size]);
  return (
    <div className={className} style={{ width: size, height: size }}>
      {src ? <img src={src} alt={t("myKiosk.qrAlt")} width={size} height={size} className="rounded-lg bg-white p-1" /> : <div className="w-full h-full rounded-lg bg-slate-100 dark:bg-white/5 animate-pulse" />}
    </div>
  );
}
