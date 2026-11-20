// The organizer's competition form: the text, the format (individual or a team of n–m), who may take part,
// the registration deadline, 1–5 stages with their dates and how many go on, and the place points.
// Client checks mirror the contract (docs/13-musobaqalar.md §6): 1–5 stages, times in order, team_min ≤ team_max.
import { useEffect, useState } from "react";
import { api as coreApi, loadCatalog, type Catalog, type Me, type University } from "../../api";
import type { Competition, CompetitionAudience, CompetitionInput, CompetitionMode, CompetitionTeamKind, OrganizerApi } from "../../competitionsApi";
import { Field } from "../../form";
import { formatDateTime, t, tMaybe, useLang } from "../../i18n";
import { Icon } from "../../icons";
import { haptic } from "../../tg";
import { ErrorText, focusField, message, toast } from "../../ui";
import { PageHead } from "../employer/kit";
import { fromLocalInput, localInDays, localMs, localPlusDays, toLocalInput, type OrgKind } from "./orgKit";

interface StageDraft { key: number; title: string; description: string; starts_at: string; ends_at: string; advance: string }

const MAX_STAGES = 5;
const DEFAULT_POINTS = ["50", "30", "20"];
let nextKey = 1;
const digits = (v: string, n: number) => v.replace(/\D/g, "").slice(0, n);

function stageDraft(prev?: StageDraft, regEnds?: string): StageDraft {
  const starts = prev?.ends_at || regEnds || localInDays(7);
  return { key: nextKey++, title: "", description: "", starts_at: starts, ends_at: localPlusDays(starts, 7), advance: "" };
}

export default function CompetitionForm({ api, kind, me, initial, onDone }: {
  api: OrganizerApi; kind: OrgKind; me?: Me | null; initial?: Competition; onDone: (saved: Competition | null) => void;
}) {
  useLang();
  const editing = Boolean(initial);
  const isDraft = !initial || initial.status === "draft";
  // after the start only the text and the prize may change (contract: PATCH)
  const locked = Boolean(initial && initial.status !== "draft" && !["upcoming", "registration"].includes(initial.phase));
  const ownUni = me?.staff_university ?? null;

  const [f, setF] = useState(() => ({
    title: initial?.title ?? "", description: initial?.description ?? "", prize: initial?.prize ?? "",
    mode: (initial?.mode ?? "individual") as CompetitionMode,
    team_kind: (initial?.team_kind ?? "any") as CompetitionTeamKind,
    team_min: String(initial && initial.mode === "team" ? initial.team_min : 2),
    team_max: String(initial && initial.mode === "team" ? initial.team_max : 4),
    audience: (initial?.audience ?? (kind === "university" ? "university" : "all")) as CompetitionAudience,
    university_id: initial?.university_id ? String(initial.university_id) : "",
    registration_ends_at: initial ? toLocalInput(initial.registration_ends_at) : localInDays(7),
  }));
  const [fields, setFields] = useState<string[]>(initial?.job_fields ?? []);
  const [stages, setStages] = useState<StageDraft[]>(() => initial?.stages.length
    ? [...initial.stages].sort((a, b) => a.order - b.order).map((s) => ({
        key: nextKey++, title: s.title, description: s.description, starts_at: toLocalInput(s.starts_at),
        ends_at: toLocalInput(s.ends_at), advance: s.advance_count != null ? String(s.advance_count) : "",
      }))
    : [stageDraft(undefined, localInDays(7))]);
  const [points, setPoints] = useState<string[]>(() => initial?.place_points?.length ? initial.place_points.slice(0, 3).map(String) : DEFAULT_POINTS);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [unis, setUnis] = useState<University[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadCatalog().then(setCatalog, () => {});
    if (kind !== "university") coreApi.universities().then(setUnis, () => {});
  }, [kind]);

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => {
    setF((cur) => ({ ...cur, [k]: v }));
    setErrors((cur) => (cur[k] ? { ...cur, [k]: "" } : cur));
  };
  const setStage = (i: number, patch: Partial<StageDraft>) => {
    setStages((cur) => cur.map((s, j) => (j === i ? { ...s, ...patch } : s)));
    setErrors((cur) => {
      const next = { ...cur };
      for (const k of Object.keys(next)) if (k.startsWith(`st${i}-`)) delete next[k];
      return next;
    });
  };
  const err = (id: string) => errors[id] || undefined;
  const cls = (id: string) => (errors[id] ? "invalid" : "");

  /** Stages in date order, then every rule; returns the errors keyed by the field's id. */
  function validate(sorted: StageDraft[]): [string, string][] {
    const out: [string, string][] = [];
    if (f.title.trim().length < 3) out.push(["title", t("corg.f.err.title")]);
    if (f.description.trim().length < 20) out.push(["description", t("corg.f.err.description")]);
    if (locked) return out;
    if (f.mode === "team") {
      const lo = Number(f.team_min), hi = Number(f.team_max);
      if (!(lo >= 1 && lo <= 10 && hi >= 1 && hi <= 10)) out.push(["team", t("corg.f.err.team_range")]);
      else if (lo > hi) out.push(["team", t("corg.f.err.team_order")]);
      else if (hi < 2) out.push(["team", t("corg.f.err.team_max2")]);
      else if (f.team_kind === "persistent" && lo > 5) out.push(["team", t("corg.f.err.team_persistent")]);
    }
    if (f.audience === "fields" && (fields.length < 1 || fields.length > 5)) out.push(["fields", t("corg.f.err.fields")]);
    if (f.audience === "university" && kind !== "university" && !f.university_id) out.push(["university_id", t("corg.f.err.university")]);
    if (f.audience === "university" && kind === "university" && !ownUni) out.push(["university_id", t("corg.f.err.own_university")]);
    const reg = localMs(f.registration_ends_at);
    if (Number.isNaN(reg)) out.push(["registration_ends_at", t("corg.f.err.date")]);
    else if (reg <= Date.now() && !editing) out.push(["registration_ends_at", t("corg.f.err.reg_past")]);
    if (sorted.length < 1 || sorted.length > MAX_STAGES) out.push(["stages", t("corg.f.err.stages_n")]);
    sorted.forEach((s, i) => {
      if (s.title.trim().length < 2) out.push([`st${i}-title`, t("corg.f.err.stage_title")]);
      const a = localMs(s.starts_at), b = localMs(s.ends_at);
      if (Number.isNaN(a)) out.push([`st${i}-starts`, t("corg.f.err.date")]);
      if (Number.isNaN(b)) out.push([`st${i}-ends`, t("corg.f.err.date")]);
      if (!Number.isNaN(a) && !Number.isNaN(b) && b <= a) out.push([`st${i}-ends`, t("corg.f.err.stage_order")]);
      if (i === 0 && !Number.isNaN(b) && !Number.isNaN(reg) && reg > b) out.push(["registration_ends_at", t("corg.f.err.reg_after_stage")]);
      if (i > 0 && !Number.isNaN(a) && a < localMs(sorted[i - 1].ends_at)) out.push([`st${i}-starts`, t("corg.f.err.stage_overlap", { n: i })]);
      if (i < sorted.length - 1 && s.advance) {
        const n = Number(s.advance);
        if (!(n >= 1)) out.push([`st${i}-advance`, t("corg.f.err.advance")]);
        const before = i > 0 && sorted[i - 1].advance ? Number(sorted[i - 1].advance) : null;
        if (before != null && n > before) out.push([`st${i}-advance`, t("corg.f.err.advance_more", { n: before })]);
      }
    });
    if (points.some((p) => p === "" || Number(p) > 100)) out.push(["points", t("corg.f.err.points")]);
    return out;
  }

  async function save(publish: boolean) {
    // «reorder by dates»: the stages are numbered by when they start
    const sorted = locked ? stages : [...stages].sort((a, b) => (localMs(a.starts_at) || 0) - (localMs(b.starts_at) || 0));
    if (!locked && sorted.some((s, i) => s !== stages[i])) setStages(sorted);
    const problems = validate(sorted);
    setErrors(Object.fromEntries(problems));
    if (problems.length) {
      toast(problems[0][1], "error");
      setTimeout(() => focusField(`corg-${problems[0][0]}`), 30);
      return;
    }
    setBusy(true); setError("");
    const text = { title: f.title.trim(), description: f.description.trim(), prize: f.prize.trim() };
    const team = f.mode === "team";
    const body: CompetitionInput = {
      ...text, mode: f.mode, team_kind: team ? f.team_kind : "any",
      team_min: team ? Number(f.team_min) : 1, team_max: team ? Number(f.team_max) : 1,
      audience: f.audience, job_fields: f.audience === "fields" ? fields : [],
      university_id: f.audience !== "university" ? null : kind === "university" ? ownUni?.id ?? null : Number(f.university_id),
      registration_ends_at: fromLocalInput(f.registration_ends_at),
      place_points: points.map((p) => Number(p) || 0),
      stages: sorted.map((s, i) => ({
        title: s.title.trim(), description: s.description.trim(),
        starts_at: fromLocalInput(s.starts_at), ends_at: fromLocalInput(s.ends_at),
        advance_count: i < sorted.length - 1 && s.advance ? Number(s.advance) : null,
      })),
      publish,
    };
    try {
      let saved: Competition;
      if (!initial) saved = await api.create(body);
      else {
        const { publish: _skip, ...changes } = body;
        void _skip;
        saved = await api.edit(initial.id, locked ? text : changes);
        if (publish && initial.status === "draft") saved = await api.publish(initial.id);
      }
      haptic("success");
      toast(publish && isDraft ? t("corg.f.published") : t("corg.f.saved"));
      onDone(saved);
    } catch (e) {
      setError(message(e));
      setBusy(false);
    }
  }

  const uniName = ownUni ? `${ownUni.short_name || ownUni.name}` : "";
  const audiences: [CompetitionAudience, string, string][] = [
    ["all", t("corg.f.aud.all"), t("corg.f.aud.all_hint")],
    ["fields", t("corg.f.aud.fields"), t("corg.f.aud.fields_hint")],
    ["university", t("corg.f.aud.university"), kind === "university" ? (uniName || t("corg.f.aud.own_hint")) : t("corg.f.aud.university_hint")],
  ];

  return (
    <div className="co-page corg">
      <button className="btn small ghost co-back" onClick={() => onDone(null)}><Icon name="back" size={16} />{t("corg.back")}</button>
      <PageHead title={editing ? t("corg.f.edit_title") : t("corg.new")} sub={editing ? initial!.title : t("corg.f.sub")} />
      {locked && <div className="co-note"><Icon name="lock" size={14} /> {t("corg.f.locked")}</div>}
      <div className="co-form-layout">
        <div className="co-col">
          <section className="co-card">
            <div className="co-section-title"><span>1</span>{t("corg.f.sec.main")}</div>
            <Field id="corg-title" label={t("corg.f.title")} required error={err("title")}>
              <input id="corg-title" className={cls("title")} value={f.title} maxLength={160} placeholder={t("corg.f.title_ph")}
                     onChange={(e) => set("title", e.target.value)} />
            </Field>
            <Field id="corg-description" label={t("corg.f.description")} required error={err("description")} hint={t("corg.f.description_hint")}>
              <textarea id="corg-description" className={cls("description")} value={f.description} maxLength={5000} rows={6}
                        onChange={(e) => set("description", e.target.value)} />
            </Field>
            <Field id="corg-prize" label={t("corg.f.prize")} hint={t("corg.f.prize_hint")}>
              <input id="corg-prize" value={f.prize} maxLength={300} placeholder={t("corg.f.prize_ph")} onChange={(e) => set("prize", e.target.value)} />
            </Field>
          </section>

          <fieldset className="co-card corg-fieldset" disabled={locked}>
            <div className="co-section-title"><span>2</span>{t("corg.f.sec.format")}</div>
            <div className="corg-choices two" role="radiogroup" aria-label={t("corg.f.mode")}>
              {(["individual", "team"] as const).map((m) => (
                <button key={m} type="button" role="radio" aria-checked={f.mode === m} className={`corg-choice ${f.mode === m ? "on" : ""}`}
                        onClick={() => set("mode", m)}>
                  <Icon name={m === "team" ? "users" : "user"} size={18} />
                  <span><b>{t(`corg.f.mode.${m}`)}</b><small>{t(`corg.f.mode.${m}_hint`)}</small></span>
                </button>
              ))}
            </div>
            {f.mode === "team" && (
              <div className="corg-team-opts">
                <Field id="corg-team_kind" label={t("corg.f.team_kind")} hint={t(`corg.f.team_kind.${f.team_kind}_hint`)}>
                  <select id="corg-team_kind" value={f.team_kind} onChange={(e) => set("team_kind", e.target.value as CompetitionTeamKind)}>
                    {(["any", "persistent", "one_time"] as const).map((k) => <option key={k} value={k}>{t(`corg.f.team_kind.${k}`)}</option>)}
                  </select>
                </Field>
                <Field id="corg-team" label={t("corg.f.team_size")} error={err("team")} hint={t("corg.f.team_size_hint")}>
                  <div className="corg-range">
                    <input id="corg-team" className={cls("team")} value={f.team_min} inputMode="numeric" aria-label={t("corg.f.team_min")}
                           onChange={(e) => set("team_min", digits(e.target.value, 2))} />
                    <span>–</span>
                    <input className={cls("team")} value={f.team_max} inputMode="numeric" aria-label={t("corg.f.team_max")}
                           onChange={(e) => set("team_max", digits(e.target.value, 2))} />
                    <span className="hint">{t("corg.f.people")}</span>
                  </div>
                </Field>
              </div>
            )}
          </fieldset>

          <fieldset className="co-card corg-fieldset" disabled={locked}>
            <div className="co-section-title"><span>3</span>{t("corg.f.sec.audience")}</div>
            <div className="corg-choices" role="radiogroup" aria-label={t("corg.f.audience")}>
              {audiences.map(([a, label, hint]) => (
                <button key={a} type="button" role="radio" aria-checked={f.audience === a} className={`corg-choice ${f.audience === a ? "on" : ""}`}
                        onClick={() => set("audience", a)}>
                  <Icon name={a === "all" ? "globe" : a === "fields" ? "briefcase" : "school"} size={18} />
                  <span><b>{label}</b><small>{hint}</small></span>
                </button>
              ))}
            </div>
            {f.audience === "fields" && (
              <Field id="corg-fields" label={t("corg.f.fields_pick", { n: fields.length })} error={err("fields")} hint={t("corg.f.fields_hint")}>
                <div id="corg-fields" tabIndex={-1} className={`chips ${errors.fields ? "invalid-group" : ""}`}>
                  {Object.entries(catalog?.job_fields ?? {}).map(([k, label]) => (
                    <button key={k} type="button" className={`chip ${fields.includes(k) ? "on" : ""}`}
                            disabled={!fields.includes(k) && fields.length >= 5}
                            onClick={() => { setFields(fields.includes(k) ? fields.filter((x) => x !== k) : [...fields, k]); setErrors((c) => ({ ...c, fields: "" })); }}>
                      {tMaybe(`field.${k}`) ?? label}
                    </button>
                  ))}
                  {!catalog && <span className="hint">{t("common.loading")}</span>}
                </div>
              </Field>
            )}
            {f.audience === "university" && kind !== "university" && (
              <Field id="corg-university_id" label={t("corg.f.university")} required error={err("university_id")}>
                <select id="corg-university_id" className={cls("university_id")} value={f.university_id} onChange={(e) => set("university_id", e.target.value)}>
                  <option value="">{t("corg.f.choose")}</option>
                  {unis.map((u) => <option key={u.id} value={u.id}>{u.short_name ? `${u.short_name} · ${u.name}` : u.name}</option>)}
                </select>
              </Field>
            )}
            {f.audience === "university" && kind === "university" && (
              <div id="corg-university_id" tabIndex={-1} className={`co-note ${errors.university_id ? "bad" : "good"}`} style={{ marginTop: 12 }}>
                <Icon name="school" size={14} />{ownUni ? t("corg.f.own_university", { name: ownUni.name }) : t("corg.f.err.own_university")}
              </div>
            )}
            <Field id="corg-registration_ends_at" label={t("corg.f.registration_ends")} required error={err("registration_ends_at")} hint={t("corg.f.registration_hint")}>
              <input id="corg-registration_ends_at" type="datetime-local" className={cls("registration_ends_at")} value={f.registration_ends_at}
                     onChange={(e) => set("registration_ends_at", e.target.value)} />
            </Field>
          </fieldset>

          <fieldset className="co-card corg-fieldset" disabled={locked}>
            <div className="co-section-title"><span>4</span>{t("corg.f.sec.stages")}</div>
            <p className="hint" style={{ margin: "0 0 8px" }}>{t("corg.f.stages_hint")}</p>
            {errors.stages && <div className="field-error">{errors.stages}</div>}
            <div id="corg-stages" tabIndex={-1} className="corg-stage-list">
              {stages.map((s, i) => {
                const last = i === stages.length - 1;
                return (
                  <div key={s.key} className="corg-stage-edit">
                    <div className="corg-stage-edit-head">
                      <span className="corg-stage-n">{i + 1}</span>
                      <b className="grow">{t("corg.f.stage_n", { n: i + 1 })}</b>
                      {stages.length > 1 && (
                        <button type="button" className="icon-btn" aria-label={t("corg.f.stage_remove")}
                                onClick={() => setStages(stages.filter((_, j) => j !== i))}><Icon name="trash" size={16} /></button>
                      )}
                    </div>
                    <Field id={`corg-st${i}-title`} label={t("corg.f.stage_title")} required error={err(`st${i}-title`)}>
                      <input id={`corg-st${i}-title`} className={cls(`st${i}-title`)} value={s.title} maxLength={120}
                             placeholder={t(i === 0 ? "corg.f.stage_title_ph1" : last ? "corg.f.stage_title_ph3" : "corg.f.stage_title_ph2")}
                             onChange={(e) => setStage(i, { title: e.target.value })} />
                    </Field>
                    <Field id={`corg-st${i}-description`} label={t("corg.f.stage_description")}>
                      <textarea id={`corg-st${i}-description`} value={s.description} rows={2} maxLength={2000}
                                placeholder={t("corg.f.stage_description_ph")} onChange={(e) => setStage(i, { description: e.target.value })} />
                    </Field>
                    <div className="co-form-grid">
                      <Field id={`corg-st${i}-starts`} label={t("corg.f.stage_starts")} required error={err(`st${i}-starts`)}>
                        <input id={`corg-st${i}-starts`} type="datetime-local" className={cls(`st${i}-starts`)} value={s.starts_at}
                               onChange={(e) => setStage(i, { starts_at: e.target.value })} />
                      </Field>
                      <Field id={`corg-st${i}-ends`} label={t("corg.f.stage_ends")} required error={err(`st${i}-ends`)}>
                        <input id={`corg-st${i}-ends`} type="datetime-local" className={cls(`st${i}-ends`)} value={s.ends_at}
                               onChange={(e) => setStage(i, { ends_at: e.target.value })} />
                      </Field>
                    </div>
                    {!last ? (
                      <Field id={`corg-st${i}-advance`} label={t("corg.f.advance")} error={err(`st${i}-advance`)} hint={t("corg.f.advance_hint")}>
                        <div className="corg-range">
                          <input id={`corg-st${i}-advance`} className={cls(`st${i}-advance`)} value={s.advance} inputMode="numeric" placeholder="—"
                                 onChange={(e) => setStage(i, { advance: digits(e.target.value, 4) })} />
                          <span className="hint">{t("corg.f.advance_unit")}</span>
                        </div>
                      </Field>
                    ) : (
                      <div className="hint corg-last-note"><Icon name="trophy" size={14} />{t("corg.f.last_stage")}</div>
                    )}
                  </div>
                );
              })}
            </div>
            {stages.length < MAX_STAGES && (
              <button type="button" className="btn soft small corg-add-stage"
                      onClick={() => setStages([...stages, stageDraft(stages[stages.length - 1], f.registration_ends_at)])}>
                <Icon name="plus" size={16} />{t("corg.f.stage_add", { n: stages.length, max: MAX_STAGES })}
              </button>
            )}
          </fieldset>

          <fieldset className="co-card corg-fieldset" disabled={locked}>
            <div className="co-section-title"><span>5</span>{t("corg.f.sec.points")}</div>
            <p className="hint" style={{ margin: "0 0 4px" }}>{t("corg.f.points_hint")}</p>
            <div id="corg-points" tabIndex={-1} className={`corg-points ${errors.points ? "invalid-group" : ""}`}>
              {points.map((p, i) => (
                <label key={i} className="corg-point">
                  <span className={`corg-medal m${i + 1}`}>{i + 1}</span>
                  <span className="corg-point-label">{t("corg.place_n", { n: i + 1 })}</span>
                  <input value={p} inputMode="numeric" aria-label={t("corg.place_n", { n: i + 1 })}
                         onChange={(e) => { setPoints(points.map((x, j) => (j === i ? digits(e.target.value, 3) : x))); setErrors((c) => ({ ...c, points: "" })); }} />
                </label>
              ))}
            </div>
            {errors.points && <div className="field-error">{errors.points}</div>}
          </fieldset>

          <div className="co-card corg-save">
            <ErrorText error={error} />
            <div className="co-save-row" style={{ marginTop: 0, paddingTop: 0, borderTop: 0 }}>
              <button className="btn ghost" disabled={busy} onClick={() => onDone(null)}>{t("common.cancel")}</button>
              {isDraft && <button className="btn soft" disabled={busy} onClick={() => save(false)}><Icon name="file" size={16} />{t("corg.f.save_draft")}</button>}
              <button className="btn" disabled={busy} onClick={() => save(isDraft)}>
                <Icon name={isDraft ? "send" : "tick"} size={16} />{isDraft ? t("corg.f.publish") : t("common.save")}
              </button>
            </div>
            {isDraft && <p className="hint" style={{ margin: "8px 0 0", textAlign: "right" }}>{t("corg.f.publish_hint")}</p>}
          </div>
        </div>

        <aside className="co-col co-sticky">
          <div className="co-preview">
            <div className="co-preview-label">{t("corg.f.preview")}</div>
            <div className="co-preview-card">
              <b style={{ display: "block", overflowWrap: "anywhere" }}>{f.title.trim() || t("corg.f.title_ph")}</b>
              <div className="corg-preview-tags">
                <span className="co-tag"><Icon name={f.mode === "team" ? "users" : "user"} size={13} />
                  {f.mode === "individual" ? t("corg.mode.individual")
                    : f.team_min === f.team_max ? t("corg.mode.team_one", { n: f.team_max || "?" }) : t("corg.mode.team_n", { min: f.team_min || "?", max: f.team_max || "?" })}
                </span>
                {f.registration_ends_at && <span className="co-tag"><Icon name="clock" size={13} />{t("corg.reg_until", { date: formatDateTime(fromLocalSafe(f.registration_ends_at)) })}</span>}
              </div>
              <ol className="corg-timeline">
                {stages.map((s, i) => (
                  <li key={s.key}>
                    <span className="corg-stage-n small">{i + 1}</span>
                    <div className="grow">
                      <b>{s.title.trim() || t("corg.f.stage_n", { n: i + 1 })}</b>
                      <small>{fromLocalSafe(s.starts_at) && fromLocalSafe(s.ends_at) ? `${formatDateTime(fromLocalSafe(s.starts_at))} – ${formatDateTime(fromLocalSafe(s.ends_at))}` : "—"}</small>
                      {i < stages.length - 1 && s.advance && <small className="corg-adv">{t("corg.advance_n", { n: s.advance })}</small>}
                    </div>
                  </li>
                ))}
              </ol>
              <div className="co-podium corg-podium" aria-label={t("corg.f.sec.points")}>
                <div className="p2"><span>2</span><b>+{points[1] || 0}</b></div>
                <div className="p1"><span>1</span><b>+{points[0] || 0}</b></div>
                <div className="p3"><span>3</span><b>+{points[2] || 0}</b></div>
              </div>
            </div>
          </div>
          <div className="co-card co-tips">
            <b><Icon name="spark" size={16} />{t("corg.f.tips_title")}</b>
            <ul>{([1, 2, 3, 4] as const).map((n) => <li key={n}>{t(`corg.f.tip.${n}`)}</li>)}</ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

/** ISO for a datetime-local value, or "" while it is incomplete (the preview must not throw). */
function fromLocalSafe(v: string): string {
  const ms = localMs(v);
  return Number.isNaN(ms) ? "" : new Date(ms).toISOString();
}
