// The organizer's competitions page, one component for a company, a university and the admins
// (docs/13-musobaqalar.md): the list with filters, the create/edit form and one competition's detail
// (stage tabs, scoring, closing stages, results, live leaderboard). `?c=<id>` in the address opens that
// competition directly (organizer notifications link there); closing the detail drops it.
import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { Me } from "../../api";
import type { Competition, OrganizerApi } from "../../competitionsApi";
import { t, useLang } from "../../i18n";
import { Icon } from "../../icons";
import { navigate, useSearch } from "../../router";
import { ErrorText, message } from "../../ui";
import { EmptyState, PageHead, Tabs } from "../employer/kit";
import CompetitionDetail from "./CompetitionDetail";
import CompetitionForm from "./CompetitionForm";
import { filterOf, modeLabel, phaseLabel, StageBar, STATUS_BADGE, statusLabel, type ListFilter, type OrgKind } from "./orgKit";
import "./competitions-org.css";

export type { OrgKind } from "./orgKit";

export interface CompetitionManagerProps {
  /** `competitionsApi.organizer` for a company or university, `competitionsApi.admin` for admins. */
  api: OrganizerApi;
  kind: OrgKind;
  /** The signed-in account: a university's own university comes from `me.staff_university`. */
  me?: Me | null;
  /** Extra controls on each card and in the detail header (the admin page adds «Yashirish / Tiklash»). */
  renderActions?: (c: Competition, update: (c: Competition) => void) => ReactNode;
  /** Shown above the list (the admin page puts the home page switch here). */
  top?: ReactNode;
}

const FILTERS: ListFilter[] = ["active", "draft", "finished", "archived"];

/** The current address with `?c=` set to `id` (or removed), other query keys and the hash kept (the admin site routes by hash). */
function addressWith(id: number | null): string {
  const q = new URLSearchParams(window.location.search);
  if (id == null) q.delete("c"); else q.set("c", String(id));
  const s = q.toString();
  return `${window.location.pathname}${s ? `?${s}` : ""}${window.location.hash}`;
}

export default function CompetitionManager({ api, kind, me, renderActions, top }: CompetitionManagerProps) {
  useLang();
  const search = useSearch();
  const openId = Number(search.c) || null;
  const [rows, setRows] = useState<Competition[] | null>(null);
  const [form, setForm] = useState<null | "new" | Competition>(null);
  const [filter, setFilter] = useState<ListFilter | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => api.list().then((r) => {
    setRows(r);
    setError("");
    // opens on the first filter that has something in it
    setFilter((cur) => cur ?? FILTERS.find((f) => r.some((c) => filterOf(c) === f)) ?? "active");
  }, (e) => setError(message(e))), [api]);
  useEffect(() => { void load(); }, [load]);

  /** Puts a changed competition into the list (keeps list-only fields such as `to_score` the answer lacks). */
  const update = useCallback((c: Competition) => setRows((cur) => {
    if (!cur) return [c];
    return cur.some((x) => x.id === c.id) ? cur.map((x) => (x.id === c.id ? { ...x, ...c } : x)) : [c, ...cur];
  }), []);

  const open = (id: number) => navigate(addressWith(id));
  const close = () => { navigate(addressWith(null), { replace: true }); void load(); };

  if (form) {
    return (
      <CompetitionForm api={api} kind={kind} me={me} initial={form === "new" ? undefined : form}
                       onDone={(saved) => {
                         setForm(null);
                         if (!saved) return;
                         update(saved);
                         setFilter(filterOf(saved));
                         if (openId !== saved.id) open(saved.id);
                         void load();
                       }} />
    );
  }

  if (openId) {
    const c = rows?.find((x) => x.id === openId);
    if (c) {
      return (
        <CompetitionDetail key={c.id} api={api} kind={kind} me={me} c={c} onBack={close} onChanged={update}
                           onEdit={() => setForm(c)} actions={renderActions?.(c, update)} />
      );
    }
    return (
      <div className="co-page corg">
        <button className="btn small ghost co-back" onClick={close}><Icon name="back" size={16} />{t("corg.back")}</button>
        <ErrorText error={error} />
        {!rows && !error && <div className="co-sk-block" style={{ height: 240 }} />}
        {rows && <EmptyState icon="flag" title={t("corg.not_found")} text={t("corg.not_found_text")} />}
      </div>
    );
  }

  const count = (f: ListFilter) => (rows ?? []).filter((c) => filterOf(c) === f).length;
  const view = filter ?? "active";
  const shown = (rows ?? []).filter((c) => filterOf(c) === view);
  const active = (rows ?? []).filter((c) => c.status === "published");
  const toScore = active.reduce((n, c) => n + (c.to_score ?? 0), 0);
  const entries = active.reduce((n, c) => n + c.entries_n, 0);
  const newButton = <button className="btn" onClick={() => setForm("new")}><Icon name="plus" size={18} />{t("corg.new")}</button>;

  return (
    <div className="co-page corg">
      <PageHead title={kind === "admin" ? t("corg.title_admin") : t("corg.title")} sub={t(`corg.sub.${kind}`)} actions={newButton} />
      {top}
      {rows && rows.length > 0 && (
        <div className="co-mini-stats">
          <div><b>{count("active")}</b><span>{t("corg.filter.active")}</span></div>
          <div><b>{entries}</b><span>{t("corg.stats.entries")}</span></div>
          <div className={toScore ? "warn" : ""}><b>{toScore}</b><span>{t("corg.card.to_score")}</span></div>
          <div><b>{count("finished")}</b><span>{t("corg.filter.finished")}</span></div>
        </div>
      )}
      {rows && rows.length > 0 && (
        <Tabs items={FILTERS.map((f) => [f, t(`corg.filter.${f}`), count(f)] as [ListFilter, string, number])} value={view} onChange={setFilter} />
      )}
      <ErrorText error={error} />
      {!rows && !error && <div className="co-grid">{[0, 1, 2].map((i) => <div key={i} className="co-sk-block" style={{ height: 230 }} />)}</div>}
      {rows?.length === 0 && <Intro onNew={() => setForm("new")} />}
      {rows && rows.length > 0 && shown.length === 0 && <div className="co-card hint">{t(`corg.filter.empty.${view}`)}</div>}
      <div className="co-grid corg-grid">
        {shown.map((c) => <CompetitionCard key={c.id} c={c} kind={kind} onOpen={() => open(c.id)} actions={renderActions?.(c, update)} />)}
      </div>
    </div>
  );
}

function CompetitionCard({ c, kind, onOpen, actions }: { c: Competition; kind: OrgKind; onOpen: () => void; actions?: ReactNode }) {
  useLang();
  const team = c.mode === "team";
  return (
    <article className={`corg-card st-${filterOf(c)} ${c.is_hidden ? "is-hidden" : ""}`}>
      <button className="corg-card-main" onClick={onOpen}>
        <div className="co-job-top">
          <span className="co-tag"><Icon name={team ? "users" : "user"} size={13} />{modeLabel(c)}</span>
          <span className={`badge ${STATUS_BADGE[c.status]}`}>{statusLabel(c.status)}</span>
        </div>
        <h3>{c.title}</h3>
        {kind === "admin" && (
          <span className="hint corg-card-org"><Icon name={c.organizer.kind === "university" ? "school" : c.organizer.kind === "company" ? "building" : "verified"} size={13} />{c.organizer.name}</span>
        )}
        <div className="corg-card-phase">
          {c.status === "published" && <span className="corg-phase"><i className={`ph-${c.phase}`} />{phaseLabel(c.phase)}</span>}
          {c.is_hidden && <span className="badge pending"><Icon name="eye" size={12} />{t("corg.hidden")}</span>}
        </div>
        <StageBar c={c} />
        <div className="co-job-metrics">
          <div><b>{c.entries_n}</b><span>{team ? t("corg.card.teams") : t("corg.card.entries")}</span></div>
          <div className={c.to_score ? "warn" : ""}><b>{c.to_score ?? 0}</b><span>{t("corg.card.to_score")}</span></div>
          <div><b>{c.stages.length}</b><span>{t("corg.card.stages_n")}</span></div>
        </div>
        {c.to_score ? <div className="corg-card-warn"><Icon name="inbox" size={14} />{t("corg.card.to_score_note", { n: c.to_score })}</div> : null}
        {c.prize && <div className="co-prize"><Icon name="flame" size={14} /><span className="ellipsis">{c.prize}</span></div>}
      </button>
      {actions && <div className="corg-card-foot">{actions}</div>}
    </article>
  );
}

/** The empty page: what a competition is and how it runs, with the button to make the first one. */
function Intro({ onNew }: { onNew: () => void }) {
  useLang();
  return (
    <div className="corg-intro">
      <EmptyState icon="trophy" title={t("corg.empty.title")} text={t("corg.empty.text")}
                  action={<button className="btn" style={{ width: "auto" }} onClick={onNew}><Icon name="plus" size={18} />{t("corg.new")}</button>} />
      <div className="corg-intro-steps">
        {([["users", "who"], ["path", "stages"], ["trophy", "results"]] as const).map(([icon, k], i) => (
          <div key={k} className="corg-intro-step">
            <span className="co-how-n">{i + 1}</span>
            <div><b><Icon name={icon} size={15} />{t(`corg.empty.${k}`)}</b><p>{t(`corg.empty.${k}_hint`)}</p></div>
          </div>
        ))}
      </div>
    </div>
  );
}
