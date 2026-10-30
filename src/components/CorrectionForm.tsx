// src/components/CorrectionForm.tsx — proponer (empresa) o pedir (trabajador) una corrección
import { useEffect, useState } from "react";
import { DateTime } from "luxon";
import { supabase } from "@/lib/supabaseClient";
import { Button, Input, Select, TextArea, Notice, Modal } from "@/components/ui/kit";
import { fetchPunches, type Person, type Punch } from "@/lib/data";
import { ACTION_LABEL, TYPE_LABEL, TZ, errMsg, fmtTime, fullName, MODE_LABEL, todayISO, type RecordType } from "@/lib/format";
import { t } from "@/i18n";

export type CorrectionPreset = {
  userId?: string;
  action?: "CLOSE_SHIFT" | "ADD" | "MODIFY" | "DELETE";
  day?: string;
  time?: string;
  targetId?: string;
  reason?: string;
};

export default function CorrectionForm({ mode, companyId, people, selfId, preset, onClose, onDone }: {
  mode: "admin" | "worker";
  companyId: string;
  people?: Person[];
  selfId: string;
  preset?: CorrectionPreset;
  onClose: () => void;
  onDone: () => void;
}) {
  const [userId, setUserId] = useState(preset?.userId ?? (mode === "worker" ? selfId : ""));
  const [action, setAction] = useState<CorrectionPreset["action"]>(preset?.action ?? "ADD");
  const [day, setDay] = useState(preset?.day ?? todayISO());
  const [punches, setPunches] = useState<Punch[]>([]);
  const [targetId, setTargetId] = useState(preset?.targetId ?? "");
  const [type, setType] = useState<RecordType>("IN");
  const [date, setDate] = useState(preset?.day ?? todayISO());
  const [time, setTime] = useState(preset?.time ?? "");
  const [workMode, setWorkMode] = useState("");
  const [reason, setReason] = useState(preset?.reason ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!userId || !day) { setPunches([]); return; }
    const start = DateTime.fromISO(day, { zone: TZ }).startOf("day");
    fetchPunches({ companyId, userId, fromISO: start.minus({ hours: 6 }).toUTC().toISO()!, toISO: start.plus({ days: 1, hours: 6 }).toUTC().toISO()! })
      .then(setPunches)
      .catch(() => setPunches([]));
  }, [userId, day, companyId]);

  const needsTarget = action === "MODIFY" || action === "DELETE";
  const needsTime = action !== "DELETE";
  const target = punches.find((p) => p.id === targetId);

  async function submit() {
    setErr(null);
    if (!userId) { setErr(t("corrWeb.pickWorker")); return; }
    if (needsTarget && !targetId) { setErr(t("errors.db.pickRecord")); return; }
    if (needsTime && !time) { setErr(t("errors.db.pickCorrectTime")); return; }
    if (reason.trim().length < 3) { setErr(t("errors.db.explainCorrection")); return; }
    const eff = needsTime ? DateTime.fromISO(`${date}T${time}`, { zone: TZ }) : null;
    if (eff && !eff.isValid) { setErr(t("corrWeb.badDateTime")); return; }
    if (eff && eff > DateTime.now().plus({ minutes: 1 })) { setErr(t("errors.db.timeInFuture")); return; }

    const args = {
      p_action: action,
      p_target_record_id: needsTarget ? targetId : null,
      p_type: action === "ADD" ? type : null,
      p_effective_ts: eff ? eff.toUTC().toISO() : null,
      p_reason: reason.trim(),
      p_work_mode: workMode || null,
    };
    setSaving(true);
    const { error } = mode === "admin"
      ? await supabase.rpc("admin_propose_correction", { p_user_id: userId, ...args })
      : await supabase.rpc("request_correction", args);
    setSaving(false);
    if (error) { setErr(errMsg(error)); return; }
    onDone();
  }

  const workers = (people ?? []).filter((p) => p.role === "employee" && p.employee_status === "active" && p.company_id === companyId);

  return (
    <Modal open onClose={onClose} title={mode === "admin" ? t("corrWeb.proposeTitle") : t("corrWeb.requestTitle")}
      footer={<><Button onClick={onClose}>{t("common.cancel")}</Button><Button variant="primary" disabled={saving} onClick={submit}>{saving ? t("login.sending") : mode === "admin" ? t("corrWeb.sendWorker") : t("corrWeb.sendCompany")}</Button></>}>
      <div className="space-y-4">
        <Notice tone="info">{mode === "admin" ? t("corrWeb.adminNote") : t("corrWeb.workerNote")}</Notice>

        {mode === "admin" && (
          <Select label={t("corrWeb.worker")} value={userId} onChange={(e) => { setUserId(e.target.value); setTargetId(""); }}
            placeholder={t("corrWeb.pickWorkerPh")} options={workers.map((w) => ({ value: w.user_id, label: fullName(w) }))} />
        )}

        <Select label={t("corrWeb.what")} value={action} onChange={(e) => { setAction(e.target.value as CorrectionPreset["action"]); setTargetId(""); }}
          options={(["ADD", "MODIFY", "DELETE", "CLOSE_SHIFT"] as const).map((a) => ({ value: a, label: ACTION_LABEL[a] }))} />

        <Input label={t("cells.day")} type="date" value={day} max={todayISO()} onChange={(e) => { setDay(e.target.value); setDate(e.target.value); setTargetId(""); }} />

        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("corrWeb.dayPunches")}</p>
          {punches.length === 0 ? (
            <p className="text-xs text-slate-400">{t("corrWeb.noDayPunches")}</p>
          ) : (
            <div className="space-y-1">
              {punches.map((p) => (
                <label key={p.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs ${needsTarget ? "cursor-pointer" : ""} ${targetId === p.id ? "border-accent bg-accent/10" : "border-slate-200 dark:border-white/10"}`}>
                  {needsTarget && <input type="radio" name="target" checked={targetId === p.id} onChange={() => { setTargetId(p.id); setTime(fmtTime(p.event_ts)); setDate(DateTime.fromISO(p.event_ts, { zone: TZ }).toISODate()!); }} />}
                  <span className="font-mono">{DateTime.fromISO(p.event_ts, { zone: TZ }).toFormat("dd/MM HH:mm")}</span>
                  <span>{TYPE_LABEL[p.type]}</span>
                  <span className="text-slate-400">{MODE_LABEL[p.work_mode]}</span>
                  {p.is_correction && <span className="text-sky-500">{t("dash.corrected")}</span>}
                </label>
              ))}
            </div>
          )}
        </div>

        {action === "ADD" && (
          <Select label={t("corrWeb.punchType")} value={type} onChange={(e) => setType(e.target.value as RecordType)}
            options={(Object.keys(TYPE_LABEL) as RecordType[]).map((k) => ({ value: k, label: TYPE_LABEL[k] }))} />
        )}

        {needsTime && (
          <div className="grid grid-cols-2 gap-3">
            <Input label={action === "CLOSE_SHIFT" ? t("corrWeb.outDate") : t("corrWeb.rightDate")} type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
            <Input label={action === "CLOSE_SHIFT" ? t("corrWeb.outTime") : t("corrWeb.rightTime")} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
        )}

        {(action === "ADD" || action === "MODIFY") && (
          <Select label={t("cells.mode")} hint={`(${t("common.optional")})`} value={workMode} onChange={(e) => setWorkMode(e.target.value)} placeholder={action === "MODIFY" && target ? t("corrWeb.sameAsOriginal", { mode: MODE_LABEL[target.work_mode] }) : t("corrWeb.bySlot")}
            options={[{ value: "presencial", label: MODE_LABEL.presencial }, { value: "teletrabajo", label: MODE_LABEL.teletrabajo }]} />
        )}

        <TextArea label={t("corrWeb.reason")} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("corrWeb.reasonPh")} />

        {err && <Notice tone="error">{err}</Notice>}
      </div>
    </Modal>
  );
}
