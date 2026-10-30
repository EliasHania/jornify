// src/pages/Incidencias.tsx — correcciones con conformidad de las dos partes
import { useCallback, useEffect, useMemo, useState } from "react";
import { DateTime } from "luxon";
import { CheckCircle, XCircle, Plus, Undo2, AlertTriangle, User, MessageSquare, Clock } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useProfile } from "@/hooks/useProfile";
import { PageHeader, Card, Button, Pill, Notice, Empty, Loading, Tabs, Modal, TextArea } from "@/components/ui/kit";
import CorrectionForm, { type CorrectionPreset } from "@/components/CorrectionForm";
import { fetchPeople, type Person } from "@/lib/data";
import { ACTION_LABEL, ADJ_STATUS, MODE_LABEL, TYPE_LABEL, TZ, errMsg, fmtDateTime, fullName, type RecordType } from "@/lib/format";
import { t } from "@/i18n";

type Adj = {
  id: string;
  user_id: string;
  action: string | null;
  desired_type: RecordType | null;
  desired_ts: string | null;
  meta: Record<string, unknown> | null;
  reason: string | null;
  status: string;
  created_at: string;
  reviewed_at: string | null;
  requested_by: string | null;
  target_time_record_id: string | null;
  work_mode: string | null;
  worker_response: string | null;
  worker_comment: string | null;
  worker_responded_at: string | null;
  admin_comment: string | null;
  applied_with_discrepancy: boolean;
};

type Unclosed = {
  user_id: string;
  open_time_record_id: string;
  last_type: RecordType;
  last_ts: string;
  autoclosed_at: string | null;
  reason: string;
};

type Target = { id: string; type: RecordType; ts: string; meta: Record<string, unknown> | null };

type Pending = { adj: Adj; kind: "approve" | "reject" | "apply" | "withdraw" | "accept" | "dispute" };

const effTs = (a: Adj) => (a.meta?.effective_ts as string | undefined) ?? a.desired_ts;

export default function Incidencias() {
  const { isAdmin, userId, companyId, loading: profileLoading } = useProfile();

  const [adjs, setAdjs] = useState<Adj[]>([]);
  const [unclosed, setUnclosed] = useState<Unclosed[]>([]);
  const [openNow, setOpenNow] = useState<{ user_id: string; last_type: RecordType; last_ts: string }[]>([]);
  const [targets, setTargets] = useState<Record<string, Target>>({});
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<string>("todo");
  const [form, setForm] = useState<CorrectionPreset | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [comment, setComment] = useState("");
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    if (!companyId || !userId) return;
    setLoading(true);
    setError(null);
    try {
      let aq = supabase
        .from("time_record_adjustments")
        .select("id, user_id, action, desired_type, desired_ts, meta, reason, status, created_at, reviewed_at, requested_by, target_time_record_id, work_mode, worker_response, worker_comment, worker_responded_at, admin_comment, applied_with_discrepancy")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(400);
      let uq = supabase.from("v_autoclosed_incidents").select("user_id, open_time_record_id, last_type, last_ts, autoclosed_at, reason").eq("company_id", companyId);
      let oq = supabase.from("v_open_sessions").select("user_id, last_type, last_ts").eq("company_id", companyId);
      if (!isAdmin) { aq = aq.eq("user_id", userId); uq = uq.eq("user_id", userId); oq = oq.eq("user_id", userId); }

      const [a, u, o, p] = await Promise.all([aq, uq, oq, isAdmin ? fetchPeople() : Promise.resolve([] as Person[])]);
      if (a.error) throw a.error;
      if (u.error) throw u.error;
      if (o.error) throw o.error;
      const list = (a.data ?? []) as Adj[];
      setAdjs(list);
      setUnclosed((u.data ?? []) as Unclosed[]);
      setOpenNow((o.data ?? []) as { user_id: string; last_type: RecordType; last_ts: string }[]);
      setPeople(p);

      const ids = [...new Set(list.map((x) => x.target_time_record_id).filter(Boolean))] as string[];
      if (ids.length) {
        const { data: recs } = await supabase.from("time_records").select("id, type, ts, meta").in("id", ids);
        setTargets(Object.fromEntries(((recs ?? []) as Target[]).map((x) => [x.id, x])));
      } else setTargets({});
    } catch (e) {
      setError(errMsg(e, t("inc.loadError")));
    } finally {
      setLoading(false);
    }
  }, [companyId, userId, isAdmin]);

  useEffect(() => { if (!profileLoading) load(); }, [profileLoading, load]);

  const nameOf = useCallback(
    (uid: string | null) => {
      if (!uid) return "—";
      if (uid === userId) return t("inc.you");
      const p = people.find((x) => x.user_id === uid);
      return p ? fullName(p) : t("corrWeb.worker");
    },
    [people, userId]
  );

  const groups = useMemo(() => {
    const todo = isAdmin
      ? adjs.filter((a) => a.status === "pending" || a.status === "disputed")
      : adjs.filter((a) => a.status === "proposed");
    const waiting = isAdmin ? adjs.filter((a) => a.status === "proposed") : adjs.filter((a) => a.status === "pending" || a.status === "disputed");
    const history = adjs.filter((a) => ["approved", "rejected", "withdrawn"].includes(a.status));
    return { todo, waiting, history };
  }, [adjs, isAdmin]);

  const longOpen = openNow.filter((o) => DateTime.fromISO(o.last_ts) < DateTime.now().minus({ hours: 12 }));

  async function runAction() {
    if (!pending) return;
    const { adj, kind } = pending;
    if ((kind === "apply" || kind === "dispute") && comment.trim().length < 3) {
      setError(kind === "apply" ? t("errors.db.explainDiscrepancy") : t("errors.db.explainDisagreement"));
      return;
    }
    setActing(true);
    setError(null);
    const { error: e } =
      kind === "accept" || kind === "dispute"
        ? await supabase.rpc("respond_correction", { p_adj_id: adj.id, p_accept: kind === "accept", p_comment: comment.trim() || null })
        : await supabase.rpc("admin_resolve_correction", { p_adj_id: adj.id, p_decision: kind, p_comment: comment.trim() || null });
    setActing(false);
    if (e) { setError(errMsg(e)); return; }
    setPending(null);
    setComment("");
    load();
  }

  if (profileLoading) return <Loading />;
  if (!companyId) return <Empty>{t("errors.db.noCompany")}</Empty>;

  const list = tab === "todo" ? groups.todo : tab === "waiting" ? groups.waiting : groups.history;

  return (
    <div className="space-y-6">
      <PageHeader
        title={isAdmin ? t("nav.corrections") : t("inc.myTitle")}
        subtitle={isAdmin ? t("inc.adminSub") : t("inc.workerSub")}
        actions={
          <Button variant="primary" onClick={() => setForm({})}>
            <Plus className="w-4 h-4" /> {isAdmin ? t("corrWeb.proposeTitle") : t("corrWeb.requestTitle")}
          </Button>
        }
      />

      {error && <Notice tone="error">{error}</Notice>}

      {(unclosed.length > 0 || longOpen.length > 0) && (
        <Card title={t("inc.unclosedTitle")} icon={<AlertTriangle className="w-4 h-4" />}>
          <div className="divide-y divide-slate-100 dark:divide-white/5">
            {unclosed.map((u) => (
              <div key={u.open_time_record_id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-3">
                <div className="text-sm min-w-0">
                  {isAdmin && <p className="font-medium text-slate-900 dark:text-white truncate">{nameOf(u.user_id)}</p>}
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {u.autoclosed_at
                      ? t("inc.unclosedNext", { type: TYPE_LABEL[u.last_type], when: fmtDateTime(u.last_ts), next: fmtDateTime(u.autoclosed_at) })
                      : t("inc.unclosed", { type: TYPE_LABEL[u.last_type], when: fmtDateTime(u.last_ts) })}
                  </p>
                </div>
                <Button size="sm" onClick={() => setForm({
                  userId: u.user_id, action: "CLOSE_SHIFT",
                  day: DateTime.fromISO(u.last_ts, { zone: TZ }).toISODate()!,
                  reason: isAdmin ? t("inc.forgotOutAdmin") : t("inc.forgotOutWorker"),
                })}>
                  {isAdmin ? t("inc.proposeClose") : t("inc.requestClose")}
                </Button>
              </div>
            ))}
            {longOpen.map((o) => (
              <div key={o.user_id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-3">
                <div className="text-sm min-w-0">
                  {isAdmin && <p className="font-medium text-slate-900 dark:text-white truncate">{nameOf(o.user_id)}</p>}
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t("inc.longOpen", { when: fmtDateTime(o.last_ts) })}
                  </p>
                </div>
                <Button size="sm" onClick={() => setForm({
                  userId: o.user_id, action: "CLOSE_SHIFT",
                  day: DateTime.fromISO(o.last_ts, { zone: TZ }).toISODate()!,
                  reason: isAdmin ? t("inc.forgotOutAdmin") : t("inc.forgotOutWorker"),
                })}>
                  {isAdmin ? t("inc.proposeClose") : t("inc.requestClose")}
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "todo", label: isAdmin ? t("inc.tabTodoAdmin") : t("inc.tabTodoWorker"), count: groups.todo.length },
          { value: "waiting", label: isAdmin ? t("inc.tabWaitAdmin") : t("inc.tabWaitWorker"), count: groups.waiting.length },
          { value: "history", label: t("absWeb.history") },
        ]}
      />

      {loading ? <Loading /> : list.length === 0 ? (
        <Card><Empty>{tab === "history" ? t("inc.noHistory") : t("inc.nothing")}</Empty></Card>
      ) : (
        <div className="space-y-3">
          {list.map((a) => {
            const st = ADJ_STATUS[a.status] ?? ADJ_STATUS.pending;
            const target = a.target_time_record_id ? targets[a.target_time_record_id] : undefined;
            const targetTs = target ? ((target.meta?.effective_ts as string | undefined) ?? target.ts) : null;
            const byCompany = a.requested_by !== a.user_id;
            const eff = effTs(a);
            const action = a.action ?? (a.meta?.action as string) ?? "ADD";
            const typeLabel = action === "CLOSE_SHIFT" ? TYPE_LABEL.OUT : a.desired_type ? TYPE_LABEL[a.desired_type] : target ? TYPE_LABEL[target.type] : "";
            return (
              <Card key={a.id} className="!p-4">
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill className={`border ${st.cls}`}>{st.label}</Pill>
                      <Pill>{ACTION_LABEL[action] ?? action}</Pill>
                      <span className="text-xs text-slate-400">{byCompany ? t("inc.byCompany") : t("inc.byWorker")}</span>
                      {a.applied_with_discrepancy && <Pill className="bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20">{t("inc.withDiscrepancy")}</Pill>}
                    </div>
                    {isAdmin && (
                      <p className="text-sm font-medium text-slate-900 dark:text-white flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-slate-400" /> {nameOf(a.user_id)}
                      </p>
                    )}
                    <p className="text-sm text-slate-700 dark:text-slate-300">
                      {action === "DELETE" ? (
                        <>{target ? t("inc.voidOf", { type: TYPE_LABEL[target.type], when: fmtDateTime(targetTs) }) : t("inc.voidPunch")}</>
                      ) : action === "MODIFY" ? (
                        <>{typeLabel}: {fmtDateTime(targetTs)} → <b>{fmtDateTime(eff)}</b></>
                      ) : (
                        <>{typeLabel} · <b>{fmtDateTime(eff)}</b></>
                      )}
                      {a.work_mode && <span className="text-slate-400"> · {MODE_LABEL[a.work_mode]}</span>}
                    </p>
                    {a.reason && <p className="text-xs text-slate-500 dark:text-slate-400">{t("corrWeb.reason")}: {a.reason}</p>}
                    {a.worker_comment && (
                      <p className="text-xs text-slate-600 dark:text-slate-300 flex gap-1">
                        <MessageSquare className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span><b>{a.worker_response === "disputed" ? t("inc.workerDisputed") : t("corrWeb.worker")}:</b> {a.worker_comment}</span>
                      </p>
                    )}
                    {a.admin_comment && (
                      <p className="text-xs text-slate-600 dark:text-slate-300 flex gap-1">
                        <MessageSquare className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span><b>{t("inc.company")}:</b> {a.admin_comment}</span>
                      </p>
                    )}
                    <p className="text-[11px] text-slate-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {t("inc.created", { when: fmtDateTime(a.created_at) })}
                      {a.worker_responded_at && ` · ${t("inc.answered", { when: fmtDateTime(a.worker_responded_at) })}`}
                      {a.reviewed_at && ` · ${t("inc.resolved", { when: fmtDateTime(a.reviewed_at) })}`}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2 shrink-0">
                    {isAdmin && a.status === "pending" && (
                      <>
                        <Button size="sm" variant="success" onClick={() => setPending({ adj: a, kind: "approve" })}><CheckCircle className="w-3.5 h-3.5" />{t("absWeb.approve")}</Button>
                        <Button size="sm" variant="danger" onClick={() => setPending({ adj: a, kind: "reject" })}><XCircle className="w-3.5 h-3.5" />{t("absWeb.reject")}</Button>
                      </>
                    )}
                    {isAdmin && a.status === "disputed" && (
                      <Button size="sm" variant="primary" onClick={() => setPending({ adj: a, kind: "apply" })}>{t("inc.applyAnyway")}</Button>
                    )}
                    {isAdmin && (a.status === "proposed" || a.status === "disputed") && (
                      <Button size="sm" onClick={() => setPending({ adj: a, kind: "withdraw" })}><Undo2 className="w-3.5 h-3.5" />{t("inc.withdraw")}</Button>
                    )}
                    {!isAdmin && a.status === "proposed" && (
                      <>
                        <Button size="sm" variant="success" onClick={() => setPending({ adj: a, kind: "accept" })}><CheckCircle className="w-3.5 h-3.5" />{t("inc.iAccept")}</Button>
                        <Button size="sm" variant="danger" onClick={() => setPending({ adj: a, kind: "dispute" })}><XCircle className="w-3.5 h-3.5" />{t("inc.disagree")}</Button>
                      </>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {form && companyId && userId && (
        <CorrectionForm
          mode={isAdmin ? "admin" : "worker"}
          companyId={companyId}
          people={people}
          selfId={userId}
          preset={form}
          onClose={() => setForm(null)}
          onDone={() => { setForm(null); setTab(isAdmin ? "waiting" : "waiting"); load(); }}
        />
      )}

      <Modal
        open={!!pending}
        onClose={() => { setPending(null); setComment(""); }}
        title={
          pending?.kind === "approve" ? t("absWeb.approveTitle") :
          pending?.kind === "reject" ? t("absWeb.rejectTitle") :
          pending?.kind === "apply" ? t("inc.applyTitle") :
          pending?.kind === "withdraw" ? t("inc.withdrawTitle") :
          pending?.kind === "accept" ? t("inc.acceptTitle") : t("inc.disagree")
        }
        footer={
          <>
            <Button onClick={() => { setPending(null); setComment(""); }}>{t("common.cancel")}</Button>
            <Button variant={pending?.kind === "reject" || pending?.kind === "dispute" ? "danger" : "primary"} disabled={acting} onClick={runAction}>
              {acting ? t("resetWeb.saving") : t("inc.confirm")}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {pending?.kind === "apply" && (
            <Notice tone="warn">{t("inc.applyWarn")}</Notice>
          )}
          {pending?.kind === "accept" && <Notice tone="info">{t("inc.acceptNote")}</Notice>}
          {pending?.kind === "dispute" && <Notice tone="info">{t("inc.disputeNote")}</Notice>}
          <TextArea
            label={pending?.kind === "apply" || pending?.kind === "dispute" ? t("inc.reasonRequired") : t("inc.commentOptional")}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          {error && <Notice tone="error">{error}</Notice>}
        </div>
      </Modal>
    </div>
  );
}
