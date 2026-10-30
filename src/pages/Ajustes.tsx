// src/pages/Ajustes.tsx — datos de empresa, reglas de fichaje, festivos, protocolo, legal
import { useCallback, useEffect, useState } from "react";
import { DateTime } from "luxon";
import { Building2, Save, Clock, CalendarDays, FileText, Scale, AlertOctagon, Trash2, Plus, ExternalLink, Palmtree, Globe } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useProfile } from "@/hooks/useProfile";
import { PageHeader, Card, Button, Notice, Empty, Loading, Input, Select, TextArea, Toggle, Table, Modal } from "@/components/ui/kit";
import { fetchCenters, type Center } from "@/lib/data";
import { downloadProtocolPdf } from "@/lib/protocol";
import { privacyUrl, termsUrl } from "@/lib/config";
import { TZ, errMsg, fmtDate, fmtDateTime } from "@/lib/format";
import { useT } from "@/i18n";
import { LanguageOptions } from "@/components/LanguageMenu";

type Company = {
  name: string; legal_name: string | null; cif: string | null; address: string | null; city: string | null;
  province: string | null; postal_code: string | null; country: string | null; contact_phone: string | null; billing_email: string | null;
  collective_agreement: string | null; allow_remote: boolean; geofence_mode: "flag" | "block"; max_shift_hours: number;
  full_time_weekly_minutes: number; annual_hours: number | null; overtime_compensation: string;
  has_rlt: boolean; protocol_rlt_consulted_at: string | null; protocol_notes: string | null;
  terms_accepted_at: string | null; terms_version: string | null; owner_id: string; code: string; plan: string | null; trial_ends_at: string | null;
  vacation_days: number; vacation_day_type: "naturales" | "laborables"; reminders_enabled: boolean; monthly_signoff_enabled: boolean;
  hour_bank_enabled: boolean; hour_bank_start: string | null; web_punch_enabled: boolean;
};
type Holiday = { id: string; day: string; name: string; center_id: string | null };

const COLS = "name, legal_name, cif, address, city, province, postal_code, country, contact_phone, billing_email, collective_agreement, allow_remote, geofence_mode, max_shift_hours, full_time_weekly_minutes, annual_hours, overtime_compensation, has_rlt, protocol_rlt_consulted_at, protocol_notes, terms_accepted_at, terms_version, owner_id, code, plan, trial_ends_at, vacation_days, vacation_day_type, reminders_enabled, monthly_signoff_enabled, hour_bank_enabled, hour_bank_start, web_punch_enabled";

const CIF_RE = /^[A-HJ-NP-SUVW][0-9]{7}[0-9A-J]$|^[0-9]{8}[A-Z]$|^[XYZ][0-9]{7}[A-Z]$/;

/** Idioma: lo pueden cambiar todos (empresa y trabajadores) */
function LanguageCard() {
  const { t } = useT();
  return (
    <Card title={t("lang.title")} icon={<Globe className="w-4 h-4" />}>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">{t("lang.subtitle")}</p>
      <LanguageOptions />
    </Card>
  );
}

/** Ajustes de una persona trabajadora: idioma y documentos legales */
function PersonalSettings() {
  const { t } = useT();
  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader title={t("settingsWeb.personalTitle")} subtitle={t("settingsWeb.personalSub")} />
      <LanguageCard />
      <Card title={t("settingsWeb.legalTitle")} icon={<Scale className="w-4 h-4" />}>
        <div className="flex flex-wrap gap-3 text-sm">
          <a className="inline-flex items-center gap-1 text-accent hover:underline" href={privacyUrl()} target="_blank" rel="noreferrer">{t("settingsWeb.privacy")} <ExternalLink className="w-3 h-3" /></a>
          <a className="inline-flex items-center gap-1 text-accent hover:underline" href={termsUrl()} target="_blank" rel="noreferrer">{t("settingsWeb.termsShort")} <ExternalLink className="w-3 h-3" /></a>
        </div>
      </Card>
    </div>
  );
}

export default function Ajustes() {
  const { isAdmin, loading } = useProfile();
  if (loading) return <Loading />;
  return isAdmin ? <CompanySettings /> : <PersonalSettings />;
}

function CompanySettings() {
  const { t } = useT();
  const { isAdmin, userId, companyId, loading: profileLoading, reload } = useProfile();
  const [c, setC] = useState<Company | null>(null);
  const [centers, setCenters] = useState<Center[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [year, setYear] = useState(DateTime.now().setZone(TZ).year);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ section: string; tone: "ok" | "error"; text: string } | null>(null);
  const [hDay, setHDay] = useState("");
  const [hName, setHName] = useState("");
  const [hCenter, setHCenter] = useState("");
  const [dissolve, setDissolve] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const [{ data }, cc] = await Promise.all([
      supabase.from("companies").select(COLS).eq("id", companyId).single(),
      fetchCenters(companyId).catch(() => [] as Center[]),
    ]);
    setC(data as Company | null);
    setCenters(cc);
    setLoading(false);
  }, [companyId]);

  const loadHolidays = useCallback(async () => {
    if (!companyId) return;
    const { data } = await supabase.from("company_holidays").select("id, day, name, center_id")
      .eq("company_id", companyId).gte("day", `${year}-01-01`).lte("day", `${year}-12-31`).order("day");
    setHolidays((data ?? []) as Holiday[]);
  }, [companyId, year]);

  useEffect(() => { if (!profileLoading && isAdmin) load(); }, [profileLoading, isAdmin, load]);
  useEffect(() => { if (!profileLoading && isAdmin) loadHolidays(); }, [profileLoading, isAdmin, loadHolidays]);

  if (profileLoading || loading || !c) return <Loading />;

  const set = <K extends keyof Company>(k: K, v: Company[K]) => setC({ ...c, [k]: v });

  async function save(section: string, patch: Partial<Company>) {
    setMsg(null);
    setSaving(section);
    const { error } = await supabase.from("companies").update(patch).eq("id", companyId!);
    setSaving(null);
    if (error) { setMsg({ section, tone: "error", text: errMsg(error) }); return; }
    setMsg({ section, tone: "ok", text: t("settingsWeb.saved") });
    reload();
  }

  function saveIdentity() {
    if (!c!.legal_name?.trim() || !c!.cif?.trim()) { setMsg({ section: "id", tone: "error", text: t("settingsWeb.legalRequired") }); return; }
    const cif = c!.cif.trim().toUpperCase().replace(/[\s-]/g, "");
    if (!CIF_RE.test(cif)) { setMsg({ section: "id", tone: "error", text: t("settingsWeb.cifInvalid") }); return; }
    save("id", {
      name: c!.name.trim(), legal_name: c!.legal_name.trim(), cif,
      address: c!.address?.trim() || null, city: c!.city?.trim() || null, province: c!.province?.trim() || null,
      postal_code: c!.postal_code?.trim() || null, country: c!.country?.trim() || null,
      contact_phone: c!.contact_phone?.trim() || null, billing_email: c!.billing_email?.trim().toLowerCase() || null,
      collective_agreement: c!.collective_agreement?.trim() || null,
    });
  }

  async function addHoliday() {
    setMsg(null);
    if (!hDay || !hName.trim()) { setMsg({ section: "hol", tone: "error", text: t("settingsWeb.holNeedBoth") }); return; }
    const { error } = await supabase.from("company_holidays").insert({ company_id: companyId, day: hDay, name: hName.trim(), center_id: hCenter || null });
    if (error) { setMsg({ section: "hol", tone: "error", text: /duplicate|unique/i.test(error.message) ? t("settingsWeb.holDup") : errMsg(error) }); return; }
    setHName("");
    if (DateTime.fromISO(hDay).year !== year) setYear(DateTime.fromISO(hDay).year); else loadHolidays();
  }

  async function delHoliday(id: string) {
    const { error } = await supabase.from("company_holidays").delete().eq("id", id);
    if (error) setMsg({ section: "hol", tone: "error", text: errMsg(error) }); else loadHolidays();
  }

  async function doDissolve() {
    const { data, error } = await supabase.rpc("dissolve_my_company");
    if (error) { setMsg({ section: "danger", tone: "error", text: errMsg(error) }); return; }
    const r = data as { status: string; message: string; employees_removed?: number };
    setDissolve(false);
    const text = r.status === "dissolved" ? t("settingsWeb.dissolved", { count: r.employees_removed ?? 0 })
      : r.status === "already_dissolved" ? t("settingsWeb.alreadyDissolved")
      : r.status === "no_company" ? t("errors.db.noCompany")
      : r.status === "forbidden" ? t("settingsWeb.onlyOwner")
      : r.message;
    setMsg({ section: "danger", tone: r.status === "dissolved" ? "ok" : "error", text });
    load();
  }

  const isOwner = c.owner_id === userId;
  const centerName = (id: string | null) => (id ? centers.find((x) => x.id === id)?.name ?? "—" : t("settingsWeb.allCenters"));
  const M = ({ s }: { s: string }) => (msg?.section === s ? <Notice tone={msg.tone}>{msg.text}</Notice> : null);
  const address = [c.address, c.postal_code, c.city, c.province].filter(Boolean).join(", ");

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader title={t("settingsWeb.title")} subtitle={t("settingsWeb.subtitle")} />

      <LanguageCard />

      {/* Identificación */}
      <Card title={t("settingsWeb.idTitle")} icon={<Building2 className="w-4 h-4" />}>
        <div className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Input label={`${t("settingsWeb.tradeName")} *`} value={c.name} onChange={(e) => set("name", e.target.value)} />
            <Input label={`${t("settingsWeb.legalName")} *`} value={c.legal_name ?? ""} onChange={(e) => set("legal_name", e.target.value)} placeholder={t("settingsWeb.legalNamePh")} />
            <Input label={`${t("settingsWeb.cif")} *`} value={c.cif ?? ""} onChange={(e) => set("cif", e.target.value)} placeholder="B12345678" />
            <Input label={t("settingsWeb.phone")} type="tel" value={c.contact_phone ?? ""} onChange={(e) => set("contact_phone", e.target.value)} />
            <Input label={t("settingsWeb.contactEmail")} type="email" value={c.billing_email ?? ""} onChange={(e) => set("billing_email", e.target.value)} />
            <Input label={t("settingsWeb.agreement")} value={c.collective_agreement ?? ""} onChange={(e) => set("collective_agreement", e.target.value)} placeholder={t("settingsWeb.agreementPh")} />
          </div>
          <Input label={t("settingsWeb.address")} value={c.address ?? ""} onChange={(e) => set("address", e.target.value)} />
          <div className="grid md:grid-cols-4 gap-4">
            <Input label={t("settingsWeb.postalCode")} value={c.postal_code ?? ""} onChange={(e) => set("postal_code", e.target.value)} />
            <Input label={t("settingsWeb.city")} value={c.city ?? ""} onChange={(e) => set("city", e.target.value)} />
            <Input label={t("settingsWeb.province")} value={c.province ?? ""} onChange={(e) => set("province", e.target.value)} />
            <Input label={t("settingsWeb.country")} value={c.country ?? ""} onChange={(e) => set("country", e.target.value)} />
          </div>
          <M s="id" />
          <div className="flex justify-end"><Button variant="primary" disabled={saving === "id"} onClick={saveIdentity}><Save className="w-4 h-4" />{t("common.save")}</Button></div>
        </div>
      </Card>

      {/* Fichaje */}
      <Card title={t("settingsWeb.rulesTitle")} icon={<Clock className="w-4 h-4" />}>
        <div className="space-y-5">
          <Toggle checked={c.allow_remote} onChange={(v) => set("allow_remote", v)} label={t("settingsWeb.allowRemote")}
            description={t("settingsWeb.allowRemoteDesc")} />
          <div className="grid md:grid-cols-2 gap-4">
            <Select label={t("settingsWeb.geofence")} value={c.geofence_mode}
              onChange={(e) => set("geofence_mode", e.target.value as "flag" | "block")}
              options={[{ value: "flag", label: t("settingsWeb.geoFlag") }, { value: "block", label: t("settingsWeb.geoBlock") }]} />
            <Input label={t("settingsWeb.maxShift")} type="number" min={4} max={36} value={c.max_shift_hours}
              hint={t("settingsWeb.maxShiftHint")} onChange={(e) => set("max_shift_hours", Number(e.target.value))} />
            <Input label={t("settingsWeb.fullTime")} type="number" min={1} max={80} step="0.5"
              value={c.full_time_weekly_minutes / 60} onChange={(e) => set("full_time_weekly_minutes", Math.round(Number(e.target.value) * 60))}
              hint={t("settingsWeb.fullTimeHint")} />
            <Input label={t("settingsWeb.annual")} type="number" min={0} max={3000} value={c.annual_hours ?? ""}
              onChange={(e) => set("annual_hours", e.target.value ? Number(e.target.value) : null)} hint={`(${t("common.optional")})`} />
            <Select label={t("settingsWeb.overtime")} value={c.overtime_compensation}
              onChange={(e) => set("overtime_compensation", e.target.value)}
              options={[{ value: "pago", label: t("settingsWeb.otPay") }, { value: "descanso", label: t("settingsWeb.otRest") }, { value: "mixta", label: t("settingsWeb.otMixed") }]} />
          </div>
          <Notice tone="info">{t("settingsWeb.geoNotice")}</Notice>
          <M s="rules" />
          <div className="flex justify-end">
            <Button variant="primary" disabled={saving === "rules"} onClick={() => {
              if (c.max_shift_hours < 4 || c.max_shift_hours > 36) { setMsg({ section: "rules", tone: "error", text: t("settingsWeb.maxShiftRange") }); return; }
              save("rules", {
                allow_remote: c.allow_remote, geofence_mode: c.geofence_mode, max_shift_hours: c.max_shift_hours,
                full_time_weekly_minutes: c.full_time_weekly_minutes, annual_hours: c.annual_hours, overtime_compensation: c.overtime_compensation,
              });
            }}><Save className="w-4 h-4" />{t("common.save")}</Button>
          </div>
        </div>
      </Card>

      {/* Vacaciones, avisos y funciones */}
      <Card title={t("settingsWeb.featTitle")} icon={<Palmtree className="w-4 h-4" />}>
        <div className="space-y-5">
          <div className="grid md:grid-cols-2 gap-4">
            <Input label={t("settingsWeb.vacDays")} type="number" min={0} max={60} value={c.vacation_days}
              hint={t("settingsWeb.vacDaysHint")} onChange={(e) => set("vacation_days", Number(e.target.value))} />
            <Select label={t("settingsWeb.vacCount")} value={c.vacation_day_type} onChange={(e) => set("vacation_day_type", e.target.value as "naturales" | "laborables")}
              options={[{ value: "naturales", label: t("settingsWeb.vacCalendar") }, { value: "laborables", label: t("settingsWeb.vacWorking") }]} />
          </div>
          <Toggle checked={c.web_punch_enabled} onChange={(v) => set("web_punch_enabled", v)} label={t("settingsWeb.webPunch")}
            description={t("settingsWeb.webPunchDesc")} />
          <Toggle checked={c.reminders_enabled} onChange={(v) => set("reminders_enabled", v)} label={t("settingsWeb.reminders")}
            description={t("settingsWeb.remindersDesc")} />
          <Toggle checked={c.monthly_signoff_enabled} onChange={(v) => set("monthly_signoff_enabled", v)} label={t("settingsWeb.signoff")}
            description={t("settingsWeb.signoffDesc")} />
          <Toggle checked={c.hour_bank_enabled} onChange={(v) => set("hour_bank_enabled", v)} label={t("settingsWeb.bank")}
            description={t("settingsWeb.bankDesc")} />
          {c.hour_bank_enabled && (
            <Input label={t("settingsWeb.bankStart")} type="date" value={c.hour_bank_start ?? ""} className="max-w-xs"
              hint={t("settingsWeb.bankStartHint")} onChange={(e) => set("hour_bank_start", e.target.value || null)} />
          )}
          <M s="feat" />
          <div className="flex justify-end">
            <Button variant="primary" disabled={saving === "feat"} onClick={() => {
              if (c.vacation_days < 0 || c.vacation_days > 60) { setMsg({ section: "feat", tone: "error", text: t("settingsWeb.vacRange") }); return; }
              if (c.hour_bank_enabled && !c.hour_bank_start) { setMsg({ section: "feat", tone: "error", text: t("settingsWeb.bankStartMissing") }); return; }
              save("feat", {
                vacation_days: c.vacation_days, vacation_day_type: c.vacation_day_type, web_punch_enabled: c.web_punch_enabled,
                reminders_enabled: c.reminders_enabled, monthly_signoff_enabled: c.monthly_signoff_enabled,
                hour_bank_enabled: c.hour_bank_enabled, hour_bank_start: c.hour_bank_enabled ? c.hour_bank_start : c.hour_bank_start,
              });
            }}><Save className="w-4 h-4" />{t("common.save")}</Button>
          </div>
        </div>
      </Card>

      {/* Festivos */}
      <Card title={t("settingsWeb.holTitle")} icon={<CalendarDays className="w-4 h-4" />}
        actions={<Select value={String(year)} onChange={(e) => setYear(Number(e.target.value))}
          options={[-1, 0, 1].map((d) => { const y = DateTime.now().year + d; return { value: String(y), label: String(y) }; })} />}>
        <div className="space-y-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t("settingsWeb.holHint")}
          </p>
          <div className="grid sm:grid-cols-4 gap-3 items-end">
            <Input label={t("cells.date")} type="date" value={hDay} onChange={(e) => setHDay(e.target.value)} />
            <Input label={t("settingsWeb.holName")} value={hName} onChange={(e) => setHName(e.target.value)} placeholder={t("settingsWeb.holNamePh")} className="sm:col-span-2" />
            <Select label={t("cells.center")} value={hCenter} onChange={(e) => setHCenter(e.target.value)} placeholder={t("settingsWeb.all")} options={centers.map((x) => ({ value: x.id, label: x.name }))} />
          </div>
          <div className="flex justify-end"><Button onClick={addHoliday}><Plus className="w-4 h-4" />{t("settingsWeb.holAdd")}</Button></div>
          <M s="hol" />
          {holidays.length === 0 ? <Empty>{t("settingsWeb.holNone", { year })}</Empty> : (
            <Table head={[t("cells.date"), t("settingsWeb.holCol"), t("cells.center"), ""]}>
              {holidays.map((h) => (
                <tr key={h.id}>
                  <td className="px-3 py-2 whitespace-nowrap">{fmtDate(h.day)}</td>
                  <td className="px-3 py-2">{h.name}</td>
                  <td className="px-3 py-2">{centerName(h.center_id)}</td>
                  <td className="px-3 py-2 text-right">
                    <button type="button" onClick={() => delHoliday(h.id)} className="p-1 text-slate-400 hover:text-red-500 cursor-pointer" aria-label={t("common.delete")}><Trash2 className="w-3.5 h-3.5" /></button>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      </Card>

      {/* Protocolo */}
      <Card title={t("settingsWeb.protoTitle")} icon={<FileText className="w-4 h-4" />}>
        <div className="space-y-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">{t("settingsWeb.protoHint")}</p>
          <Toggle checked={c.has_rlt} onChange={(v) => set("has_rlt", v)} label={t("settingsWeb.hasRlt")}
            description={t("settingsWeb.hasRltDesc")} />
          {c.has_rlt && (
            <Input label={t("settingsWeb.rltDate")} type="date" value={c.protocol_rlt_consulted_at ?? ""}
              onChange={(e) => set("protocol_rlt_consulted_at", e.target.value || null)} className="max-w-xs" />
          )}
          <TextArea label={t("cells.notes")} hint={t("settingsWeb.protoNotesHint")}
            value={c.protocol_notes ?? ""} onChange={(e) => set("protocol_notes", e.target.value)} />
          <M s="proto" />
          <div className="flex flex-wrap justify-end gap-2">
            <Button disabled={saving === "proto"} onClick={() => save("proto", { has_rlt: c.has_rlt, protocol_rlt_consulted_at: c.protocol_rlt_consulted_at, protocol_notes: c.protocol_notes?.trim() || null })}>
              <Save className="w-4 h-4" />{t("common.save")}
            </Button>
            <Button variant="primary" onClick={() => downloadProtocolPdf({
              legalName: c.legal_name || c.name, cif: c.cif ?? "", address, collectiveAgreement: c.collective_agreement ?? "",
              centers: centers.filter((x) => x.active).map((x) => ({ name: x.name, address: x.address, radius_m: x.radius_m })),
              allowRemote: c.allow_remote, geofenceMode: c.geofence_mode, maxShiftHours: c.max_shift_hours,
              fullTimeHours: c.full_time_weekly_minutes / 60, annualHours: c.annual_hours, overtimeCompensation: c.overtime_compensation,
              hasRlt: c.has_rlt, rltConsultedAt: c.protocol_rlt_consulted_at, notes: c.protocol_notes ?? "",
            })}>
              <FileText className="w-4 h-4" />{t("settingsWeb.protoDownload")}
            </Button>
          </div>
        </div>
      </Card>

      {/* Legal */}
      <Card title={t("settingsWeb.legalTitle")} icon={<Scale className="w-4 h-4" />}>
        <div className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
          <p>
            {c.terms_accepted_at
              ? t("settingsWeb.termsAccepted", { when: fmtDateTime(c.terms_accepted_at), version: c.terms_version ?? "—" })
              : t("settingsWeb.termsNoRecord")}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t("settingsWeb.controller")}</p>
          <div className="flex flex-wrap gap-3 text-xs">
            <a className="inline-flex items-center gap-1 text-accent hover:underline" href={termsUrl()} target="_blank" rel="noreferrer">{t("settingsWeb.terms")} <ExternalLink className="w-3 h-3" /></a>
            <a className="inline-flex items-center gap-1 text-accent hover:underline" href={privacyUrl()} target="_blank" rel="noreferrer">{t("settingsWeb.privacy")} <ExternalLink className="w-3 h-3" /></a>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t("settingsWeb.companyCode")}: <span className="font-mono">{c.code}</span></p>
        </div>
      </Card>

      {/* Zona peligrosa */}
      {isOwner && (
        <Card title={t("settingsWeb.dissolveTitle")} icon={<AlertOctagon className="w-4 h-4" />} className="border-red-500/30 dark:border-red-500/30">
          <div className="space-y-3">
            <p className="text-xs text-slate-600 dark:text-slate-400">{t("settingsWeb.dissolveHint")}</p>
            <M s="danger" />
            <Button variant="danger" onClick={() => { setConfirmText(""); setDissolve(true); }}>{t("settingsWeb.dissolveBtn")}</Button>
          </div>
        </Card>
      )}

      <Modal open={dissolve} onClose={() => setDissolve(false)} title={t("settingsWeb.dissolveTitle")}
        footer={<><Button onClick={() => setDissolve(false)}>{t("common.cancel")}</Button><Button variant="danger" disabled={confirmText.trim() !== c.name.trim()} onClick={doDissolve}>{t("settingsWeb.dissolve")}</Button></>}>
        <div className="space-y-3">
          <Notice tone="error">{t("settingsWeb.dissolveWarn")}</Notice>
          <Input label={t("settingsWeb.typeToConfirm", { name: c.name })} value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
        </div>
      </Modal>
    </div>
  );
}
