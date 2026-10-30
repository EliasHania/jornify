// src/pages/Turnos.tsx — cuadrante semanal (empresa) y mis turnos (trabajador)
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DateTime } from "luxon";
import clsx from "clsx";
import { CalendarClock, ChevronLeft, ChevronRight, Copy, Send, Plus, Trash2, Download, Save, Paintbrush, Eraser, Settings2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useProfile } from "@/hooks/useProfile";
import { PageHeader, Card, Button, Notice, Empty, Loading, Input, Select, TextArea, Toggle, Modal, Pill } from "@/components/ui/kit";
import { fetchCenters, fetchPeople, fetchTerms, termsAt, type Center, type Person, type Terms } from "@/lib/data";
import { downloadXlsx } from "@/lib/exporters";
import { ABSENCE_COLOR, ABSENCE_LABEL, TZ, errMsg, fullName, secondsToHM } from "@/lib/format";
import { t } from "@/i18n";

type Shift = {
  id: string; user_id: string; day: string; start_time: string; end_time: string; break_minutes: number;
  center_id: string | null; label: string | null; color: string | null; note: string | null; status: "draft" | "published";
};
type Abs = { user_id: string; kind: string; date_from: string; date_to: string; hours: number | null };
/** Plantilla de turno de la empresa (tabla shift_templates) */
type Template = { id: string; label: string; start_time: string; end_time: string; break_minutes: number; color: string; sort: number };
type Brush = { kind: "tpl"; tpl: Template } | { kind: "erase" } | null;

const COLORS = ["#0ea5e9", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#64748b"];
const SEL = "id, user_id, day, start_time, end_time, break_minutes, center_id, label, color, note, status";
const TPL_SEL = "id, label, start_time, end_time, break_minutes, color, sort";
const fieldCls =
  "rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-2 py-1.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent/50";

const hm = (v: string) => v.slice(0, 5);
const shiftSeconds = (s: Pick<Shift, "start_time" | "end_time" | "break_minutes">) => {
  const [a, b] = [s.start_time, s.end_time].map((v) => { const [h, m] = v.split(":").map(Number); return h * 60 + m; });
  let d = b - a; if (d <= 0) d += 1440;
  return Math.max(0, d - (s.break_minutes ?? 0)) * 60;
};
const mondayOf = (d: DateTime) => d.startOf("week");
const byStart = (a: Shift, b: Shift) => a.start_time.localeCompare(b.start_time);

async function fetchTemplates(companyId: string) {
  const { data, error } = await supabase.from("shift_templates").select(TPL_SEL).eq("company_id", companyId).order("sort").order("created_at");
  if (error) throw error;
  return (data ?? []) as Template[];
}

// ---------------------------------------------------------------------
// Plantillas de turno (Mañana, Tarde, Noche…)
// ---------------------------------------------------------------------
type TplRow = { id?: string; label: string; start: string; end: string; brk: number; color: string };

function TemplatesModal({ open, onClose, templates, onSaved }: {
  open: boolean; onClose: () => void; templates: Template[]; onSaved: () => void;
}) {
  const { companyId } = useProfile();
  const [rows, setRows] = useState<TplRow[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMsg(null);
    setRows(templates.map((tp) => ({ id: tp.id, label: tp.label, start: hm(tp.start_time), end: hm(tp.end_time), brk: tp.break_minutes, color: tp.color })));
  }, [open, templates]);

  const upd = (i: number, patch: Partial<TplRow>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const nextColor = (c: string) => COLORS[(COLORS.indexOf(c) + 1) % COLORS.length];

  async function save() {
    setMsg(null);
    for (const r of rows) {
      if (!r.label.trim()) { setMsg(t("shiftsWeb.tplNeedName")); return; }
      if (!r.start || !r.end || r.start === r.end) { setMsg(`${r.label}: ${t("shiftsWeb.sameTimes")}`); return; }
      if (!Number.isFinite(r.brk) || r.brk < 0 || r.brk > 600) { setMsg(`${r.label}: ${t("shiftsWeb.breakRange")}`); return; }
    }
    if (rows.length > 20) { setMsg(t("shiftsWeb.tplMax")); return; }
    setSaving(true);
    try {
      const removed = templates.filter((tp) => !rows.some((r) => r.id === tp.id)).map((tp) => tp.id);
      if (removed.length) {
        const { error } = await supabase.from("shift_templates").delete().in("id", removed);
        if (error) throw error;
      }
      const val = (r: TplRow, i: number) => ({ label: r.label.trim(), start_time: r.start, end_time: r.end, break_minutes: Math.round(r.brk), color: r.color, sort: i + 1 });
      const updates = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.id);
      for (const { r, i } of updates) {
        const { error } = await supabase.from("shift_templates").update(val(r, i)).eq("id", r.id!);
        if (error) throw error;
      }
      const inserts = rows.map((r, i) => ({ r, i })).filter(({ r }) => !r.id).map(({ r, i }) => ({ company_id: companyId, ...val(r, i) }));
      if (inserts.length) {
        const { error } = await supabase.from("shift_templates").insert(inserts);
        if (error) throw error;
      }
      onSaved();
    } catch (e) {
      setMsg(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} wide title={t("shiftsWeb.manageTpl")}
      footer={<>
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant="primary" disabled={saving} onClick={save}><Save className="w-4 h-4" />{t("common.save")}</Button>
      </>}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-300">{t("shiftsWeb.tplHint")}</p>
        {rows.length === 0 ? <Empty>{t("shiftsWeb.tplEmpty")}</Empty> : (
          <div className="space-y-2">
            <div className="hidden sm:grid grid-cols-[36px_1fr_128px_128px_90px_36px] gap-2 px-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <span />
              <span>{t("shiftsWeb.tplName")}</span>
              <span>{t("records.type.IN")}</span>
              <span>{t("records.type.OUT")}</span>
              <span>{t("shiftsWeb.tplBreak")}</span>
              <span />
            </div>
            {rows.map((r, i) => (
              <div key={r.id ?? `new${i}`} className="grid grid-cols-[36px_1fr_36px] sm:grid-cols-[36px_1fr_128px_128px_90px_36px] gap-2 items-center rounded-xl border border-slate-200 dark:border-white/10 p-2 sm:p-1.5 sm:border-0">
                <button type="button" onClick={() => upd(i, { color: nextColor(r.color) })} title={t("shiftsWeb.tplColor")} aria-label={t("shiftsWeb.tplColor")}
                  className="w-7 h-7 rounded-full cursor-pointer border-2 border-white dark:border-slate-900 ring-1 ring-slate-300 dark:ring-white/20" style={{ background: r.color }} />
                <input className={fieldCls} value={r.label} maxLength={40} placeholder={t("shiftsWeb.shiftNamePh")} aria-label={t("shiftsWeb.tplName")}
                  onChange={(e) => upd(i, { label: e.target.value })} />
                <button type="button" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} aria-label={t("common.delete")} title={t("common.delete")}
                  className="sm:order-last p-1.5 text-slate-400 hover:text-red-500 cursor-pointer justify-self-center"><Trash2 className="w-4 h-4" /></button>
                <div className="col-span-3 sm:col-span-1 sm:contents grid grid-cols-3 gap-2">
                  <input type="time" className={fieldCls} value={r.start} aria-label={t("records.type.IN")} onChange={(e) => upd(i, { start: e.target.value })} />
                  <input type="time" className={fieldCls} value={r.end} aria-label={t("records.type.OUT")} onChange={(e) => upd(i, { end: e.target.value })} />
                  <input type="number" min={0} max={600} step={5} className={fieldCls} value={r.brk} aria-label={t("shiftsWeb.tplBreak")}
                    onChange={(e) => upd(i, { brk: Number(e.target.value) })} />
                </div>
              </div>
            ))}
          </div>
        )}
        <Button size="sm" onClick={() => setRows((rs) => [...rs, { label: "", start: "09:00", end: "17:00", brk: 0, color: COLORS[rs.length % COLORS.length] }])}
          disabled={rows.length >= 20}>
          <Plus className="w-4 h-4" />{t("shiftsWeb.tplAdd")}
        </Button>
        <p className="text-[11px] text-slate-400">{t("shiftsWeb.tplBreakHint")}</p>
        {msg && <Notice tone="error">{msg}</Notice>}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------
// Editor de un turno
// ---------------------------------------------------------------------
function ShiftModal({ open, onClose, initial, people, centers, templates, onSaved, onTemplatesChanged }: {
  open: boolean; onClose: () => void; initial: Partial<Shift> & { user_id: string; day: string } | null;
  people: Person[]; centers: Center[]; templates: Template[]; onSaved: () => void; onTemplatesChanged: () => void;
}) {
  const { companyId } = useProfile();
  const [f, setF] = useState({ start: "09:00", end: "17:00", brk: 0, center: "", label: "", color: COLORS[0], note: "" });
  const [showBrk, setShowBrk] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!initial) return;
    setMsg(null); setRepeat(false);
    setShowBrk((initial.break_minutes ?? 0) > 0);
    setF({
      start: initial.start_time ? hm(initial.start_time) : "09:00", end: initial.end_time ? hm(initial.end_time) : "17:00",
      brk: initial.break_minutes ?? 0, center: initial.center_id ?? "", label: initial.label ?? "",
      color: initial.color ?? COLORS[0], note: initial.note ?? "",
    });
  }, [initial]);

  if (!initial) return null;
  const editing = !!initial.id;
  const person = people.find((p) => p.user_id === initial.user_id);
  const dur = shiftSeconds({ start_time: f.start, end_time: f.end, break_minutes: f.brk });

  function applyTpl(tp: Template) {
    setF({ ...f, start: hm(tp.start_time), end: hm(tp.end_time), brk: tp.break_minutes, label: tp.label, color: tp.color });
    setShowBrk(tp.break_minutes > 0);
  }
  async function saveTpl() {
    setMsg(null);
    if (!f.label.trim()) { setMsg({ tone: "error", text: t("shiftsWeb.tplNeedName") }); return; }
    if (f.start === f.end) { setMsg({ tone: "error", text: t("shiftsWeb.sameTimes") }); return; }
    const { error } = await supabase.from("shift_templates").insert({
      company_id: companyId, label: f.label.trim(), start_time: f.start, end_time: f.end, break_minutes: f.brk, color: f.color,
      sort: templates.length + 1,
    });
    if (error) { setMsg({ tone: "error", text: errMsg(error) }); return; }
    setMsg({ tone: "ok", text: t("shiftsWeb.tplSavedOne") });
    onTemplatesChanged();
  }

  async function save() {
    setMsg(null);
    if (f.start === f.end) { setMsg({ tone: "error", text: t("shiftsWeb.sameTimes") }); return; }
    if (f.brk < 0 || f.brk > 600) { setMsg({ tone: "error", text: t("shiftsWeb.breakRange") }); return; }
    const row = {
      company_id: companyId, user_id: initial!.user_id, start_time: f.start, end_time: f.end, break_minutes: showBrk ? f.brk : 0,
      center_id: f.center || null, label: f.label.trim() || null, color: f.color, note: f.note.trim() || null,
    };
    setSaving(true);
    let error;
    if (editing) {
      ({ error } = await supabase.from("shifts").update(row).eq("id", initial!.id!));
    } else {
      const d0 = DateTime.fromISO(initial!.day);
      const days = repeat
        ? Array.from({ length: 5 }, (_, i) => mondayOf(d0).plus({ days: i })).filter((d) => d >= d0).map((d) => d.toISODate()!)
        : [initial!.day];
      ({ error } = await supabase.from("shifts").insert(days.map((day) => ({ ...row, day, status: "draft" }))));
    }
    setSaving(false);
    if (error) { setMsg({ tone: "error", text: errMsg(error) }); return; }
    onSaved();
  }

  async function remove() {
    if (!initial?.id) return;
    const { error } = await supabase.from("shifts").delete().eq("id", initial.id);
    if (error) { setMsg({ tone: "error", text: errMsg(error) }); return; }
    onSaved();
  }

  return (
    <Modal open={open} onClose={onClose}
      title={`${editing ? t("shiftsWeb.editShift") : t("shiftsWeb.newShift")} · ${person ? fullName(person) : ""} · ${DateTime.fromISO(initial.day).toFormat("cccc d LLL")}`}
      footer={<>
        {editing && <Button variant="danger" onClick={remove} className="mr-auto"><Trash2 className="w-4 h-4" />{t("common.delete")}</Button>}
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant="primary" disabled={saving} onClick={save}><Save className="w-4 h-4" />{t("common.save")}</Button>
      </>}>
      <div className="space-y-4">
        {templates.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {templates.map((tp) => (
              <button key={tp.id} type="button" onClick={() => applyTpl(tp)}
                className={clsx("cursor-pointer text-xs px-2.5 py-1 rounded-lg border flex items-center gap-1.5",
                  f.label === tp.label && f.start === hm(tp.start_time) && f.end === hm(tp.end_time)
                    ? "border-accent bg-accent/10" : "border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5")}>
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: tp.color }} />{tp.label} {hm(tp.start_time)}–{hm(tp.end_time)}
              </button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Input label={t("records.type.IN")} type="time" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} />
          <Input label={t("records.type.OUT")} type="time" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} />
        </div>
        {showBrk ? (
          <div className="max-w-[220px]">
            <Input label={t("shiftsWeb.breakMin")} hint={t("shiftsWeb.breakHint")} type="number" min={0} max={600} step={5} value={f.brk}
              onChange={(e) => setF({ ...f, brk: Number(e.target.value) })} />
          </div>
        ) : (
          <button type="button" onClick={() => setShowBrk(true)} className="text-xs text-accent hover:underline cursor-pointer inline-flex items-center gap-1">
            <Plus className="w-3 h-3" />{t("shiftsWeb.addBreak")}
          </button>
        )}
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {t("shiftsWeb.workDur", { v: secondsToHM(showBrk ? dur : shiftSeconds({ start_time: f.start, end_time: f.end, break_minutes: 0 })) })}{f.end <= f.start ? ` ${t("shiftsWeb.nextDay")}` : ""}.
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          <Input label={t("shiftsWeb.shiftName")} hint={`(${t("common.optional")})`} value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder={t("shiftsWeb.shiftNamePh")} />
          <Select label={t("cells.center")} value={f.center} onChange={(e) => setF({ ...f, center: e.target.value })} placeholder={t("emp.unspecified")} options={centers.map((c) => ({ value: c.id, label: c.name }))} />
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("shiftsWeb.color")}</p>
          <div className="flex gap-2">
            {COLORS.map((c) => (
              <button key={c} type="button" onClick={() => setF({ ...f, color: c })} aria-label={`${t("shiftsWeb.color")} ${c}`}
                className={clsx("w-7 h-7 rounded-full border-2 cursor-pointer", f.color === c ? "border-slate-900 dark:border-white" : "border-transparent")} style={{ background: c }} />
            ))}
          </div>
        </div>
        <TextArea label={t("emp.note")} hint={t("shiftsWeb.noteHint")} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        {!editing && <Toggle checked={repeat} onChange={setRepeat} label={t("shiftsWeb.repeat")} description={t("shiftsWeb.repeatDesc")} />}
        <button type="button" onClick={saveTpl} className="text-xs text-accent hover:underline cursor-pointer">{t("shiftsWeb.saveTpl")}</button>
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------
// Empresa: cuadrante
// ---------------------------------------------------------------------
function AdminRoster() {
  const { companyId } = useProfile();
  const [monday, setMonday] = useState(() => mondayOf(DateTime.now().setZone(TZ)));
  const [people, setPeople] = useState<Person[]>([]);
  const [centers, setCenters] = useState<Center[]>([]);
  const [assign, setAssign] = useState<{ user_id: string; center_id: string }[]>([]);
  const [terms, setTerms] = useState<Terms[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [abs, setAbs] = useState<Abs[]>([]);
  const [hols, setHols] = useState<{ day: string; name: string }[]>([]);
  const [center, setCenter] = useState("");
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ tone: "ok" | "error" | "warn"; text: string } | null>(null);
  const [edit, setEdit] = useState<(Partial<Shift> & { user_id: string; day: string }) | null>(null);
  const [tplOpen, setTplOpen] = useState(false);
  const [brush, setBrush] = useState<Brush>(null);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const busy = useRef(new Set<string>());

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => monday.plus({ days: i })), [monday]);
  const from = days[0].toISODate()!;
  const to = days[6].toISODate()!;

  const loadTemplates = useCallback(async () => {
    if (!companyId) return;
    try { setTemplates(await fetchTemplates(companyId)); } catch (e) { setMsg({ tone: "error", text: errMsg(e) }); }
  }, [companyId]);

  const loadStatic = useCallback(async () => {
    if (!companyId) return;
    const [pp, cc, a, tt] = await Promise.all([
      fetchPeople(), fetchCenters(companyId, true),
      supabase.from("employee_centers").select("user_id, center_id").eq("company_id", companyId),
      fetchTerms(companyId),
    ]);
    setPeople(pp.filter((p) => p.company_id === companyId && p.role === "employee" && p.employee_status === "active"));
    setCenters(cc);
    setAssign((a.data ?? []) as { user_id: string; center_id: string }[]);
    setTerms(tt);
  }, [companyId]);

  const loadWeek = useCallback(async () => {
    if (!companyId) return;
    const [s, a, h] = await Promise.all([
      supabase.from("shifts").select(SEL).eq("company_id", companyId).gte("day", from).lte("day", to).order("start_time"),
      supabase.from("employee_absences").select("user_id, kind, date_from, date_to, hours").eq("company_id", companyId).eq("status", "approved").lte("date_from", to).gte("date_to", from),
      supabase.from("company_holidays").select("day, name").eq("company_id", companyId).gte("day", from).lte("day", to).is("center_id", null),
    ]);
    if (s.error) setMsg({ tone: "error", text: errMsg(s.error) });
    setShifts((s.data ?? []) as Shift[]);
    setAbs((a.data ?? []) as Abs[]);
    setHols((h.data ?? []) as { day: string; name: string }[]);
    setLoading(false);
  }, [companyId, from, to]);

  useEffect(() => { loadStatic(); loadTemplates(); }, [loadStatic, loadTemplates]);
  useEffect(() => { loadWeek(); }, [loadWeek]);

  // Esc para dejar de asignar
  useEffect(() => {
    if (!brush) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setBrush(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [brush]);
  // Si se borra la plantilla seleccionada, se suelta
  useEffect(() => {
    if (brush?.kind === "tpl" && !templates.some((x) => x.id === brush.tpl.id)) setBrush(null);
  }, [templates, brush]);

  const shown = people.filter((p) => !center || !assign.some((a) => a.user_id === p.user_id) || assign.some((a) => a.user_id === p.user_id && a.center_id === center));
  const drafts = shifts.filter((s) => s.status === "draft");
  const totalSecs = shifts.reduce((a, s) => a + shiftSeconds(s), 0);

  const markBusy = (key: string, on: boolean) => {
    if (on) busy.current.add(key); else busy.current.delete(key);
    setPending(new Set(busy.current));
  };

  /** Pone (o quita) la plantilla elegida en la casilla persona × día. Con `force` no se quita aunque ya esté. */
  async function paint(uid: string, iso: string, cellShifts: Shift[], force = false) {
    if (!brush || !companyId) return;
    const key = `${uid}|${iso}`;
    if (busy.current.has(key)) return;
    markBusy(key, true);
    try {
      if (brush.kind === "erase") {
        if (!cellShifts.length) return;
        const { error } = await supabase.from("shifts").delete().in("id", cellShifts.map((s) => s.id));
        if (error) throw error;
        setShifts((prev) => prev.filter((s) => !cellShifts.some((c) => c.id === s.id)));
        return;
      }
      const tp = brush.tpl;
      const vals = { start_time: hm(tp.start_time), end_time: hm(tp.end_time), break_minutes: tp.break_minutes, label: tp.label, color: tp.color };
      const same = cellShifts.length === 1 && hm(cellShifts[0].start_time) === vals.start_time && hm(cellShifts[0].end_time) === vals.end_time
        && (cellShifts[0].label ?? "") === tp.label;
      if (same) {
        if (force) return;
        const { error } = await supabase.from("shifts").delete().eq("id", cellShifts[0].id);
        if (error) throw error;
        setShifts((prev) => prev.filter((s) => s.id !== cellShifts[0].id));
        return;
      }
      if (!cellShifts.length) {
        const { data, error } = await supabase.from("shifts")
          .insert({ company_id: companyId, user_id: uid, day: iso, ...vals, center_id: center || null, status: "draft" })
          .select(SEL).single();
        if (error) throw error;
        setShifts((prev) => [...prev, data as Shift]);
        return;
      }
      const [first, ...rest] = [...cellShifts].sort(byStart);
      const { data, error } = await supabase.from("shifts").update({ ...vals, ...(center ? { center_id: center } : {}) })
        .eq("id", first.id).select(SEL).single();
      if (error) throw error;
      if (rest.length) {
        const r = await supabase.from("shifts").delete().in("id", rest.map((s) => s.id));
        if (r.error) throw r.error;
      }
      setShifts((prev) => [...prev.filter((s) => !cellShifts.some((c) => c.id === s.id)), data as Shift]);
    } catch (e) {
      setMsg({ tone: "error", text: errMsg(e) });
    } finally {
      markBusy(key, false);
    }
  }

  const fullDayAbsence = (uid: string, iso: string) => abs.some((x) => x.user_id === uid && x.date_from <= iso && x.date_to >= iso && !x.hours);

  /** Con una plantilla: la pone de lunes a viernes (sin festivos ni ausencias). Con «Quitar»: vacía la semana de esa persona. */
  async function fillRow(uid: string) {
    if (!brush) return;
    setMsg(null);
    const targets = brush.kind === "erase" ? days : days.slice(0, 5);
    for (const d of targets) {
      const iso = d.toISODate()!;
      if (brush.kind === "tpl" && (hols.some((h) => h.day === iso) || fullDayAbsence(uid, iso))) continue;
      await paint(uid, iso, shifts.filter((s) => s.user_id === uid && s.day === iso), true);
    }
  }

  async function publish() {
    setMsg(null);
    setBrush(null);
    const { data, error } = await supabase.rpc("admin_publish_shifts", { p_from: from, p_to: to });
    if (error) { setMsg({ tone: "error", text: errMsg(error) }); return; }
    setMsg({ tone: "ok", text: t("shiftsWeb.published", { count: Number(data) || 0 }) });
    loadWeek();
  }
  async function copyPrev() {
    if (!confirm(t("shiftsWeb.copyConfirm"))) return;
    setMsg(null);
    const { data, error } = await supabase.rpc("admin_copy_shifts", { p_src_from: monday.minus({ weeks: 1 }).toISODate(), p_dst_from: from, p_days: 7 });
    if (error) { setMsg({ tone: "error", text: errMsg(error) }); return; }
    setMsg({ tone: data ? "ok" : "warn", text: data ? t("shiftsWeb.copied", { count: Number(data) || 0 }) : t("shiftsWeb.prevEmpty") });
    loadWeek();
  }
  function exportXlsx() {
    downloadXlsx(`${t("shiftsWeb.file")}_${from}`, [{
      name: t("shiftsWeb.sheet"), title: t("shiftsWeb.sheetTitle", { from: days[0].toFormat("dd/MM/yyyy"), to: days[6].toFormat("dd/MM/yyyy") }),
      head: [t("absWeb.person"), ...days.map((d) => d.toFormat("ccc d")), t("absWeb.hours")],
      rows: shown.map((p) => {
        const mine = shifts.filter((s) => s.user_id === p.user_id);
        return [fullName(p), ...days.map((d) => {
          const iso = d.toISODate()!;
          const a = abs.find((x) => x.user_id === p.user_id && x.date_from <= iso && x.date_to >= iso && !x.hours);
          if (a) return ABSENCE_LABEL[a.kind] ?? a.kind;
          return mine.filter((s) => s.day === iso).sort(byStart).map((s) => `${hm(s.start_time)}-${hm(s.end_time)}${s.label ? ` ${s.label}` : ""}`).join(" / ");
        }), secondsToHM(mine.reduce((acc, s) => acc + shiftSeconds(s), 0))];
      }),
      widths: [24, 16, 16, 16, 16, 16, 16, 16, 10],
    }]);
  }

  if (loading) return <Loading />;
  const weekLabel = `${days[0].toFormat("d LLL")} – ${days[6].toFormat("d LLL yyyy")}`;
  const todayIso = DateTime.now().setZone(TZ).toISODate();
  const chipCls = (active: boolean) => clsx(
    "cursor-pointer text-xs px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 transition",
    active ? "border-accent bg-accent/15 ring-2 ring-accent/40 text-slate-900 dark:text-white" : "border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5",
  );

  return (
    <div className="space-y-6">
      <PageHeader title={t("nav.shifts")} subtitle={t("shiftsWeb.adminSub")}
        actions={<>
          <Button onClick={copyPrev}><Copy className="w-4 h-4" />{t("shiftsWeb.copyPrev")}</Button>
          <Button onClick={exportXlsx}><Download className="w-4 h-4" />Excel</Button>
          <Button variant="primary" disabled={!drafts.length} onClick={publish}><Send className="w-4 h-4" />{t("shiftsWeb.publish")}{drafts.length ? ` (${drafts.length})` : ""}</Button>
        </>} />

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <Button size="sm" onClick={() => setMonday(monday.minus({ weeks: 1 }))} aria-label={t("shiftsWeb.prevWeek")}><ChevronLeft className="w-4 h-4" /></Button>
          <span className="text-sm font-medium px-2 min-w-[170px] text-center">{weekLabel}</span>
          <Button size="sm" onClick={() => setMonday(monday.plus({ weeks: 1 }))} aria-label={t("shiftsWeb.nextWeek")}><ChevronRight className="w-4 h-4" /></Button>
          <Button size="sm" variant="subtle" onClick={() => setMonday(mondayOf(DateTime.now().setZone(TZ)))}>{t("common.today")}</Button>
        </div>
        {centers.length > 1 && (
          <Select value={center} onChange={(e) => setCenter(e.target.value)} placeholder={t("settingsWeb.allCenters")} options={centers.map((c) => ({ value: c.id, label: c.name }))} />
        )}
        <span className="text-xs text-slate-500 dark:text-slate-400">{t("shiftsWeb.countPlanned", { count: shifts.length, v: secondsToHM(totalSecs) })}</span>
      </div>

      {/* Asignación rápida con plantillas */}
      <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-card p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 inline-flex items-center gap-1.5 mr-1">
            <Paintbrush className="w-3.5 h-3.5" />{t("shiftsWeb.quickAssign")}
          </span>
          {templates.length === 0 ? (
            <span className="text-xs text-slate-500 dark:text-slate-400">{t("shiftsWeb.noTemplates")}</span>
          ) : (
            <>
              {templates.map((tp) => {
                const active = brush?.kind === "tpl" && brush.tpl.id === tp.id;
                return (
                  <button key={tp.id} type="button" aria-pressed={active} className={chipCls(active)}
                    onClick={() => setBrush(active ? null : { kind: "tpl", tpl: tp })}>
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: tp.color }} />
                    <span className="font-medium">{tp.label}</span>
                    <span className="text-slate-400">{hm(tp.start_time)}–{hm(tp.end_time)}</span>
                  </button>
                );
              })}
              <button type="button" aria-pressed={brush?.kind === "erase"} className={chipCls(brush?.kind === "erase")}
                onClick={() => setBrush(brush?.kind === "erase" ? null : { kind: "erase" })}>
                <Eraser className="w-3.5 h-3.5" />{t("shiftsWeb.eraser")}
              </button>
            </>
          )}
          <Button size="sm" variant="subtle" className="ml-auto" onClick={() => setTplOpen(true)}>
            <Settings2 className="w-4 h-4" />{templates.length ? t("shiftsWeb.manageTpl") : t("shiftsWeb.createTemplates")}
          </Button>
        </div>
        {brush && (
          <p className="text-xs text-accent">
            {brush.kind === "erase" ? t("shiftsWeb.eraseHint") : t("shiftsWeb.paintHint", { label: brush.tpl.label })}
          </p>
        )}
      </div>

      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {drafts.length > 0 && <Notice tone="warn">{t("shiftsWeb.drafts", { count: drafts.length })}</Notice>}

      {shown.length === 0 ? <Card><Empty>{t("absWeb.noActive")}</Empty></Card> : (
        <div className={clsx("overflow-x-auto rounded-2xl border bg-white dark:bg-card", brush ? "border-accent/50" : "border-slate-200 dark:border-white/10")}>
          <table className="w-full text-xs border-collapse table-fixed min-w-[860px]">
            <thead>
              <tr className="bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300">
                <th className="sticky left-0 z-10 bg-slate-100 dark:bg-slate-800 text-left font-medium px-3 py-2 w-[150px]">{t("absWeb.person")}</th>
                {days.map((d) => {
                  const iso = d.toISODate()!;
                  const h = hols.find((x) => x.day === iso);
                  return (
                    <th key={iso} className={clsx("px-2 py-2 font-medium text-left", iso === todayIso && "text-accent", h && "text-rose-500")}>
                      <span className="capitalize">{d.toFormat("ccc d")}</span>
                      {h && <span className="block text-[10px] font-normal truncate" title={h.name}>{h.name}</span>}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => {
                const mine = shifts.filter((s) => s.user_id === p.user_id);
                const planned = mine.reduce((a, s) => a + shiftSeconds(s), 0);
                const wt = termsAt(terms, p.user_id, from);
                return (
                  <tr key={p.user_id} className="border-t border-slate-100 dark:border-white/5 align-top">
                    <td className="sticky left-0 z-10 bg-white dark:bg-card px-3 py-2">
                      <p className="font-medium text-slate-800 dark:text-slate-100 truncate">{fullName(p)}</p>
                      <p className={clsx("text-[11px]", wt && planned > wt.weekly_minutes * 60 ? "text-amber-600 dark:text-amber-400" : "text-slate-400")}>
                        {secondsToHM(planned)}{wt ? ` / ${secondsToHM(wt.weekly_minutes * 60)}` : ""}
                      </p>
                      {brush && (
                        <button type="button" onClick={() => fillRow(p.user_id)}
                          title={brush.kind === "erase" ? t("shiftsWeb.clearWeekTitle") : t("shiftsWeb.fillWeekdaysTitle")}
                          className="mt-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md border border-accent/40 text-accent hover:bg-accent/10 cursor-pointer">
                          {brush.kind === "erase" ? t("shiftsWeb.clearWeek") : t("shiftsWeb.fillWeekdays")}
                        </button>
                      )}
                    </td>
                    {days.map((d) => {
                      const iso = d.toISODate()!;
                      const a = abs.find((x) => x.user_id === p.user_id && x.date_from <= iso && x.date_to >= iso);
                      const list = mine.filter((s) => s.day === iso).sort(byStart);
                      const isBusy = pending.has(`${p.user_id}|${iso}`);
                      return (
                        <td key={iso}
                          onClick={brush ? () => paint(p.user_id, iso, list) : undefined}
                          className={clsx("px-1.5 py-1.5 group", brush && "cursor-pointer hover:bg-accent/5", isBusy && "opacity-50")}>
                          <div className="space-y-1 min-h-[44px]">
                            {a && (
                              <div className={clsx("rounded-md border px-1.5 py-0.5 text-[10px] font-medium", ABSENCE_COLOR[a.kind])}>
                                {ABSENCE_LABEL[a.kind] ?? a.kind}{a.hours ? ` ${a.hours} h` : ""}
                              </div>
                            )}
                            {list.map((s) => (
                              <button key={s.id} type="button" onClick={brush ? undefined : () => setEdit(s)}
                                className={clsx("w-full text-left rounded-md px-1.5 py-1 cursor-pointer border-l-4 bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10",
                                  s.status === "draft" && "outline outline-1 outline-dashed outline-slate-300 dark:outline-white/20")}
                                style={{ borderLeftColor: s.color ?? COLORS[0] }}>
                                <span className="block font-semibold text-slate-800 dark:text-slate-100">{hm(s.start_time)}–{hm(s.end_time)}</span>
                                {(s.label || s.center_id) && (
                                  <span className="block text-[10px] text-slate-500 dark:text-slate-400 truncate">
                                    {[s.label, centers.length > 1 ? centers.find((c) => c.id === s.center_id)?.name : null].filter(Boolean).join(" · ")}
                                  </span>
                                )}
                              </button>
                            ))}
                            {!brush && (
                              <button type="button" onClick={() => setEdit({ user_id: p.user_id, day: iso })}
                                className="w-full flex justify-center py-0.5 rounded-md text-slate-300 dark:text-slate-600 hover:text-accent hover:bg-accent/5 cursor-pointer opacity-60 group-hover:opacity-100"
                                aria-label={t("shiftsWeb.addShift")}><Plus className="w-3.5 h-3.5" /></button>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-slate-400">{t("shiftsWeb.foot")}</p>

      <ShiftModal open={!!edit} onClose={() => setEdit(null)} initial={edit} people={people} centers={centers} templates={templates}
        onSaved={() => { setEdit(null); loadWeek(); }} onTemplatesChanged={loadTemplates} />
      <TemplatesModal open={tplOpen} onClose={() => setTplOpen(false)} templates={templates}
        onSaved={() => { setTplOpen(false); loadTemplates(); setMsg({ tone: "ok", text: t("shiftsWeb.tplSaved") }); }} />
    </div>
  );
}

// ---------------------------------------------------------------------
// Trabajador: mis turnos
// ---------------------------------------------------------------------
function MyShifts() {
  const { userId, companyId } = useProfile();
  const [monday, setMonday] = useState(() => mondayOf(DateTime.now().setZone(TZ)));
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [abs, setAbs] = useState<Abs[]>([]);
  const [centers, setCenters] = useState<Center[]>([]);
  const [loading, setLoading] = useState(true);
  const from = monday.toISODate()!;
  const to = monday.plus({ weeks: 4 }).minus({ days: 1 }).toISODate()!;

  useEffect(() => {
    if (!userId || !companyId) return;
    (async () => {
      const [s, a, c] = await Promise.all([
        supabase.from("shifts").select(SEL).eq("user_id", userId).gte("day", from).lte("day", to).order("day").order("start_time"),
        supabase.from("employee_absences").select("user_id, kind, date_from, date_to, hours").eq("user_id", userId).eq("status", "approved").lte("date_from", to).gte("date_to", from),
        fetchCenters(companyId, true).catch(() => [] as Center[]),
      ]);
      setShifts((s.data ?? []) as Shift[]);
      setAbs((a.data ?? []) as Abs[]);
      setCenters(c);
      setLoading(false);
    })();
  }, [userId, companyId, from, to]);

  if (loading) return <Loading />;
  const weeks = [0, 1, 2, 3].map((w) => monday.plus({ weeks: w }));
  const todayIso = DateTime.now().setZone(TZ).toISODate();

  return (
    <div className="space-y-6">
      <PageHeader title={t("nav.myShifts")} subtitle={t("shiftsWeb.workerSub")}
        actions={<div className="flex items-center gap-1">
          <Button size="sm" onClick={() => setMonday(monday.minus({ weeks: 4 }))} aria-label={t("shiftsWeb.previous")}><ChevronLeft className="w-4 h-4" /></Button>
          <Button size="sm" variant="subtle" onClick={() => setMonday(mondayOf(DateTime.now().setZone(TZ)))}>{t("common.today")}</Button>
          <Button size="sm" onClick={() => setMonday(monday.plus({ weeks: 4 }))} aria-label={t("shiftsWeb.next")}><ChevronRight className="w-4 h-4" /></Button>
        </div>} />
      {shifts.length === 0 && abs.length === 0 && <Notice tone="info">{t("shiftsWeb.none")}</Notice>}
      <div className="grid lg:grid-cols-2 gap-4">
        {weeks.map((w) => {
          const wd = Array.from({ length: 7 }, (_, i) => w.plus({ days: i }));
          const total = shifts.filter((s) => s.day >= w.toISODate()! && s.day <= wd[6].toISODate()!).reduce((a, s) => a + shiftSeconds(s), 0);
          return (
            <Card key={w.toISODate()} title={t("shiftsWeb.weekOf", { date: w.toLocaleString({ day: "numeric", month: "long" }) })} icon={<CalendarClock className="w-4 h-4" />}
              actions={total ? <span className="text-xs text-slate-500">{secondsToHM(total)}</span> : undefined}>
              <div className="divide-y divide-slate-100 dark:divide-white/5">
                {wd.map((d) => {
                  const iso = d.toISODate()!;
                  const list = shifts.filter((s) => s.day === iso);
                  const a = abs.find((x) => x.date_from <= iso && x.date_to >= iso);
                  return (
                    <div key={iso} className={clsx("flex gap-3 py-2", iso === todayIso && "bg-accent/5 -mx-2 px-2 rounded-lg")}>
                      <span className={clsx("w-16 shrink-0 text-xs capitalize", iso === todayIso ? "text-accent font-semibold" : "text-slate-500 dark:text-slate-400")}>{d.toFormat("ccc d")}</span>
                      <div className="flex-1 flex flex-wrap gap-1.5 min-w-0">
                        {a && <Pill className={`border ${ABSENCE_COLOR[a.kind]}`}>{ABSENCE_LABEL[a.kind] ?? a.kind}{a.hours ? ` ${a.hours} h` : ""}</Pill>}
                        {list.map((s) => (
                          <span key={s.id} className="inline-flex flex-col rounded-lg border-l-4 bg-slate-50 dark:bg-white/5 px-2 py-1" style={{ borderLeftColor: s.color ?? COLORS[0] }}>
                            <span className="text-sm font-semibold text-slate-900 dark:text-white">{hm(s.start_time)}–{hm(s.end_time)}</span>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400">
                              {[s.label, centers.find((c) => c.id === s.center_id)?.name, s.break_minutes ? t("shiftsWeb.breakN", { n: s.break_minutes }) : null].filter(Boolean).join(" · ")}
                            </span>
                            {s.note && <span className="text-[11px] text-slate-600 dark:text-slate-300 italic">{s.note}</span>}
                          </span>
                        ))}
                        {!a && !list.length && <span className="text-xs text-slate-300 dark:text-slate-600">—</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export default function Turnos() {
  const { isAdmin, loading, companyId, employeeStatus } = useProfile();
  if (loading) return <Loading />;
  if (!companyId || (!isAdmin && employeeStatus !== "active")) return <Empty>{t("absWeb.needCompany")}</Empty>;
  return isAdmin ? <AdminRoster /> : <MyShifts />;
}
