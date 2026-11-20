// One competition for the student: the hero, the rules and stages, taking part (alone, with one of my teams, or a
// one-time team made here), the work of the open stage, and the live leaderboard.
import { useCallback, useEffect, useRef, useState } from "react";
import { api, fileSize, type SubmittedFile } from "../../../api";
import { competitionsApi, type Competition, type MyEntry, type StageOut, type TeamOut } from "../../../competitionsApi";
import { formatDateTime, t, useLang, type MsgKey } from "../../../i18n";
import { Icon } from "../../../icons";
import { navigate } from "../../../router";
import { ask, backButton, haptic } from "../../../tg";
import { Avatar, ErrorText, message, toast } from "../../../ui";
import { Tabs } from "../../employer/kit";
import CompetitionLeaderboard from "./CompetitionLeaderboard";
import {
  EntryBadge, KindBadge, ModeBadge, OrganizerLine, PhaseChip, Rank, StagePhaseChip, StageProgress, TEAM_PATH, TeamMark,
  copyText, day, joinLink, num, openStage, registrationOpen, sortedStages, teamLink, timeLeft,
} from "./kit";

const MAX_FILES = 5;
type View = "about" | "board";

export default function CompetitionDetail({ id, onBack }: { id: number; onBack: () => void }) {
  useLang();
  const [c, setC] = useState<Competition | null>(null);
  const [error, setError] = useState("");
  const [view, setView] = useState<View | null>(null);
  const load = useCallback(() => competitionsApi.get(id).then(setC, (e) => setError(message(e))), [id]);
  useEffect(() => { void load(); }, [load]);
  // Telegram's own Back button leads to the list too
  const back = useRef(onBack);
  back.current = onBack;
  useEffect(() => backButton(() => back.current()), []);

  const head = <button className="btn small ghost co-back" onClick={onBack}><Icon name="back" size={16} />{t("cm.back")}</button>;
  if (!c) return <div className="co-page cm-page">{head}{error ? <ErrorText error={error} /> : <div className="st-skeleton-grid"><span /><span /></div>}</div>;

  // finished competitions open on their results
  const tab: View = view ?? (c.phase === "finished" ? "board" : "about");
  const e = c.my_entry;
  const stage = openStage(c);
  const setEntry = (entry: MyEntry) => setC({ ...c, my_entry: entry });
  return (
    <div className="co-page cm-page">
      {head}
      <Hero c={c} />
      <div className="cm-detail-grid">
        <div className="co-col cm-main">
          <Tabs items={[["about", t("cm.tab.about")], ["board", t("cm.tab.board"), c.entries_n]]} value={tab} onChange={setView} />
          {tab === "about" ? <About c={c} /> : <CompetitionLeaderboard c={c} />}
        </div>
        <div className="co-col cm-side">
          <Participation c={c} onChange={setC} />
          {e && e.status === "registered" && stage && (
            <SubmitStage key={`${stage.id}-${e.submissions.find((s) => s.stage_id === stage.id)?.submitted_at ?? ""}`}
                         c={c} stage={stage} entry={e} onDone={setEntry} />
          )}
        </div>
      </div>
    </div>
  );
}

function Hero({ c }: { c: Competition }) {
  useLang();
  return (
    <div className="co-card cm-hero">
      <div className="row between wrap" style={{ gap: 8 }}>
        <OrganizerLine o={c.organizer} size={34} />
        <PhaseChip phase={c.phase} />
      </div>
      <h1>{c.title}</h1>
      <div className="st-task-meta">
        <ModeBadge c={c} />
        <StageProgress c={c} />
        {c.prize && <span className="co-pill warn"><Icon name="trophy" size={13} />{c.prize}</span>}
        <span className="hint cm-card-n"><Icon name="users" size={13} />{t("cm.entries_n", { n: c.entries_n })}</span>
      </div>
      <div className="cm-dates">
        <div><Icon name="calendar" size={16} /><span>{t("cm.date.registration")}</span><b>{formatDateTime(c.registration_ends_at)}</b></div>
        <div><Icon name="play" size={16} /><span>{t("cm.date.starts")}</span><b>{formatDateTime(c.starts_at)}</b></div>
        <div><Icon name="flag" size={16} /><span>{t("cm.date.ends")}</span><b>{formatDateTime(c.ends_at)}</b></div>
      </div>
    </div>
  );
}

function About({ c }: { c: Competition }) {
  useLang();
  const stages = sortedStages(c);
  const mine = c.my_entry?.submissions ?? [];
  return (
    <>
      <div className="co-card">
        <div className="co-card-head"><b>{t("cm.about.rules")}</b></div>
        <p className="st-pre" style={{ marginTop: 0 }}>{c.description || t("cm.about.no_text")}</p>
        <div className="cm-facts">
          <div><Icon name={c.mode === "team" ? "users" : "user"} size={16} /><span>{c.mode === "team"
            ? t(`cm.about.team.${c.team_kind}` as MsgKey, { range: c.team_min === c.team_max ? String(c.team_min) : `${c.team_min}–${c.team_max}` })
            : t("cm.about.individual")}</span></div>
          <div><Icon name="globe" size={16} /><span>{t(`cm.audience.${c.audience}` as MsgKey)}</span></div>
        </div>
      </div>

      {stages.length > 0 && (
        <div className="co-card">
          <div className="co-card-head"><b>{stages.length > 1 ? t("cm.about.stages", { n: stages.length }) : t("cm.about.stage_one")}</b></div>
          <ol className="cm-stages">
            {stages.map((s, i) => {
              const sub = mine.find((x) => x.stage_id === s.id);
              return (
                <li key={s.id} className={`cm-stage ${s.phase}`}>
                  <span className="cm-stage-n">{s.phase === "closed" ? <Icon name="tick" size={15} /> : i + 1}</span>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="cm-stage-top"><b>{s.title}</b><StagePhaseChip phase={s.phase} /></div>
                    <div className="hint">{formatDateTime(s.starts_at)} – {formatDateTime(s.ends_at)}</div>
                    {s.advance_count != null && i < stages.length - 1 && (
                      <div className="cm-advance"><Icon name="arrow" size={14} />{t("cm.stage.advance", { n: s.advance_count })}</div>
                    )}
                    {s.description && <p className="st-pre">{s.description}</p>}
                    {sub && (
                      <div className="cm-stage-mine">
                        <Icon name="tick" size={14} />
                        {sub.score != null ? t("cm.stage.scored", { score: num(sub.score) }) : t("cm.stage.sent", { date: day(sub.submitted_at) })}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {(c.prize || c.place_points.length > 0) && (
        <div className="co-card">
          <div className="co-card-head"><b>{t("cm.about.prizes")}</b></div>
          {c.prize && <p style={{ marginTop: 0 }}><Icon name="trophy" size={15} /> {c.prize}</p>}
          {c.place_points.length > 0 && (
            <>
              <div className="cm-places">
                {c.place_points.map((p, i) => (
                  <div key={i}><Rank n={i + 1} /><span>{t("cm.place", { n: i + 1 })}</span><b>+{p}</b></div>
                ))}
              </div>
              <p className="hint" style={{ marginBottom: 0 }}>{c.mode === "team" ? t("cm.about.points_team") : t("cm.about.points_one")}</p>
            </>
          )}
        </div>
      )}
    </>
  );
}

// ------------------------------------------------------------------ taking part

function Participation({ c, onChange }: { c: Competition; onChange: (c: Competition) => void }) {
  useLang();
  const e = c.my_entry;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const regOpen = registrationOpen(c);

  async function act(call: () => Promise<Competition>, done: string) {
    setBusy(true); setError("");
    try { onChange(await call()); haptic("success"); toast(done); }
    catch (err) { setError(message(err)); haptic("error"); }
    finally { setBusy(false); }
  }
  async function withdraw() {
    if (!(await ask(e?.team ? t("cm.withdraw.ask_team") : t("cm.withdraw.ask")))) return;
    await act(() => competitionsApi.withdraw(c.id), t("cm.withdraw.done"));
  }

  if (e && e.status !== "withdrawn") {
    // the server lets an entry withdraw until the competition starts (a team: only its captain)
    const canWithdraw = e.status === "registered" && c.status === "published" && Date.now() < new Date(c.starts_at).getTime()
      && (c.mode === "individual" || Boolean(e.team?.is_captain));
    const reviewed = e.submissions.filter((s) => s.score != null);
    const stageTitle = (id: number) => c.stages.find((s) => s.id === id)?.title ?? "";
    return (
      <div className={`co-card cm-entry-card ${e.status}`}>
        <b>{t("cm.my.title")}</b>
        <div className="row wrap" style={{ gap: 8, marginTop: 8 }}>
          <EntryBadge e={e} />
          {e.rank != null && <span className="hint">{t("cm.my.rank_of", { rank: e.rank, n: c.entries_n })}</span>}
        </div>
        {e.total_score != null && <div className="st-score"><b>{num(e.total_score)}</b> {t("cm.my.total")}</div>}
        {e.status === "eliminated" && <p className="hint">{t("cm.my.eliminated")}</p>}
        {e.status === "registered" && Date.now() < new Date(c.starts_at).getTime() && <p className="hint">{t("cm.my.wait_start", { date: day(c.starts_at) })}</p>}
        {e.team && <EntryTeam team={e.team} c={c} />}
        {reviewed.length > 0 && (
          <div className="cm-results">
            {reviewed.map((s) => (
              <div key={s.stage_id}>
                <div className="row between"><span className="ellipsis">{stageTitle(s.stage_id)}</span><b>{num(s.score!)}/100</b></div>
                {s.comment && <blockquote className="co-quote">«{s.comment}»</blockquote>}
              </div>
            ))}
          </div>
        )}
        <ErrorText error={error} />
        {canWithdraw && <button className="btn small bad cm-withdraw" disabled={busy} onClick={withdraw}>{t("cm.withdraw")}</button>}
      </div>
    );
  }

  if (!regOpen) {
    return (
      <div className="co-card cm-join">
        <b>{t("cm.join.title")}</b>
        <p className="hint" style={{ marginBottom: 0 }}>{c.phase === "finished" ? t("cm.join.over") : t("cm.join.closed")}</p>
      </div>
    );
  }
  if (c.mode === "team") return <TeamJoin c={c} onChange={onChange} withdrawn={Boolean(e)} />;
  return (
    <div className="co-card cm-join">
      <b>{t("cm.join.title")}</b>
      {e && <p className="hint">{t("cm.join.withdrawn")}</p>}
      <p className="hint">{t("cm.join.individual_hint", { date: formatDateTime(c.registration_ends_at) })}</p>
      {!c.can_register && c.why_not && <p className="cm-why"><Icon name="help" size={15} />{c.why_not}</p>}
      <ErrorText error={error} />
      <button className="btn" disabled={busy || !c.can_register} onClick={() => act(() => competitionsApi.register(c.id), t("cm.join.done"))}>
        {t("cm.join.register")}
      </button>
    </div>
  );
}

/** The team an entry is made with: its members, and while registration is open the code that adds more. */
function EntryTeam({ team, c }: { team: TeamOut; c: Competition }) {
  useLang();
  const room = team.members.length < Math.min(team.size_max, c.team_max);
  return (
    <div className="cm-entry-team">
      <button type="button" className="cm-entry-team-head" onClick={() => navigate(teamLink(team.id))}>
        <TeamMark name={team.name} />
        <span className="grow" style={{ minWidth: 0 }}>
          <b className="ellipsis">{team.name}</b>
          <small>{t("cm.members_of", { n: team.members.length, max: team.size_max })}{team.is_captain ? ` · ${t("cm.team.you_captain")}` : ""}</small>
        </span>
        <Icon name="arrow" size={16} />
      </button>
      <div className="cm-avatars">
        {team.members.map((m) => <span key={m.user_id} title={m.name}><Avatar name={m.name} url={m.photo_url} /></span>)}
      </div>
      {registrationOpen(c) && team.invite_code && room && <InviteMini code={team.invite_code} />}
    </div>
  );
}

function InviteMini({ code }: { code: string }) {
  useLang();
  return (
    <div className="cm-invite-mini">
      <span>{t("cm.code")}: <b>{code}</b></span>
      <button type="button" className="icon-btn" aria-label={t("cm.copy_code")} title={t("cm.copy_code")} onClick={() => copyText(code, t("cm.copied_code"))}><Icon name="copy" size={16} /></button>
      <button type="button" className="icon-btn" aria-label={t("cm.copy_link")} title={t("cm.copy_link")} onClick={() => copyText(joinLink(code), t("cm.copied_link"))}><Icon name="link" size={16} /></button>
    </div>
  );
}

function TeamJoin({ c, onChange, withdrawn }: { c: Competition; onChange: (c: Competition) => void; withdrawn: boolean }) {
  useLang();
  const [teams, setTeams] = useState<TeamOut[] | null>(null);
  const [pick, setPick] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<TeamOut | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const loadTeams = useCallback(() => competitionsApi.myTeams().then(setTeams, (e) => setError(message(e))), []);
  useEffect(() => { void loadTeams(); }, [loadTeams]);

  // why a team cannot enter (the server checks the same; this only explains it before the click)
  const why = (tm: TeamOut): string | null => {
    if (c.team_kind === "persistent" && tm.kind !== "persistent") return t("cm.why.need_persistent");
    if (c.team_kind === "one_time" && tm.kind !== "one_time") return t("cm.why.need_one_time");
    if (!tm.is_captain) return t("cm.why.not_captain");
    const n = tm.members.length;
    if (n < c.team_min) return t("cm.why.too_few", { min: c.team_min, n });
    if (n > c.team_max) return t("cm.why.too_many", { max: c.team_max, n });
    return null;
  };
  // one-time teams belong to one competition: those of others are left out
  const shown = (teams ?? []).filter((tm) => tm.kind === "persistent" || tm.competition_id === c.id);
  const eligible = shown.filter((tm) => !why(tm));
  const chosen = pick != null && eligible.some((tm) => tm.id === pick) ? pick : eligible[0]?.id ?? null;
  const range = c.team_min === c.team_max ? String(c.team_min) : `${c.team_min}–${c.team_max}`;

  async function register() {
    if (chosen == null) return;
    setBusy("register"); setError("");
    try { onChange(await competitionsApi.register(c.id, chosen)); haptic("success"); toast(t("cm.join.done_team")); }
    catch (err) { setError(message(err)); haptic("error"); }
    finally { setBusy(""); }
  }
  async function create() {
    setBusy("create"); setError("");
    try {
      const tm = await competitionsApi.createTeam({ name: name.trim(), kind: "one_time", competition_id: c.id });
      setTeams((cur) => [...(cur ?? []), tm]);
      setFresh(tm); setCreating(false); setName("");
      haptic("success"); toast(t("cm.team.created"));
    } catch (err) { setError(message(err)); }
    finally { setBusy(""); }
  }

  return (
    <div className="co-card cm-join">
      <b>{t("cm.join.title")}</b>
      {withdrawn && <p className="hint">{t("cm.join.withdrawn")}</p>}
      <p className="hint">{t(`cm.join.team_hint.${c.team_kind}` as MsgKey, { range, date: formatDateTime(c.registration_ends_at) })}</p>
      {!c.can_register && c.why_not && <p className="cm-why"><Icon name="help" size={15} />{c.why_not}</p>}

      {fresh?.invite_code && (
        <div className="cm-fresh">
          <b>{t("cm.fresh.title", { name: fresh.name })}</b>
          <div className="cm-code">{fresh.invite_code}</div>
          <div className="row wrap" style={{ gap: 6 }}>
            <button type="button" className="btn small soft" onClick={() => copyText(fresh.invite_code!, t("cm.copied_code"))}><Icon name="copy" size={15} />{t("cm.copy_code")}</button>
            <button type="button" className="btn small soft" onClick={() => copyText(joinLink(fresh.invite_code!), t("cm.copied_link"))}><Icon name="link" size={15} />{t("cm.copy_link")}</button>
          </div>
          <small>{c.team_min > 1 ? t("cm.fresh.hint", { min: c.team_min }) : t("cm.fresh.hint_one")}</small>
        </div>
      )}

      {!teams && !error && <div className="hint">{t("common.loading")}</div>}
      {shown.length > 0 && (
        <div className="cm-pick" role="radiogroup" aria-label={t("cm.join.pick")}>
          <span className="cm-pick-label">{t("cm.join.pick")}</span>
          {shown.map((tm) => {
            const reason = why(tm);
            return (
              <div key={tm.id} className={`cm-pick-row ${reason ? "off" : ""} ${chosen === tm.id ? "on" : ""}`}>
                <label>
                  <input type="radio" name={`team-${c.id}`} disabled={Boolean(reason)} checked={chosen === tm.id} onChange={() => setPick(tm.id)} />
                  <TeamMark name={tm.name} />
                  <span className="grow" style={{ minWidth: 0 }}>
                    <b className="ellipsis">{tm.name}</b>
                    <small><KindBadge kind={tm.kind} /> {t("cm.members_of", { n: tm.members.length, max: tm.size_max })}</small>
                    {reason && <small className="cm-pick-why">{reason}</small>}
                  </span>
                </label>
                {tm.kind === "one_time" && tm.invite_code && tm.members.length < tm.size_max && <InviteMini code={tm.invite_code} />}
              </div>
            );
          })}
          <button type="button" className="link-btn cm-refresh" onClick={() => void loadTeams()}>{t("cm.join.refresh")}</button>
        </div>
      )}
      {teams && shown.length === 0 && <p className="hint">{t(c.team_kind === "one_time" ? "cm.join.no_teams_one_time" : "cm.join.no_teams")}</p>}
      <ErrorText error={error} />
      {shown.length > 0 && (
        <button className="btn" disabled={chosen == null || Boolean(busy)} onClick={register}>
          {busy === "register" ? t("s.common.sending") : t("cm.join.register_team")}
        </button>
      )}

      <div className="cm-join-more">
        {c.team_kind !== "persistent" && (creating ? (
          <form className="cm-create" onSubmit={(ev) => { ev.preventDefault(); if (name.trim().length >= 2) void create(); }}>
            <label htmlFor={`one-time-${c.id}`}>{t("cm.team.name")}</label>
            <input id={`one-time-${c.id}`} value={name} maxLength={60} autoFocus placeholder={t("cm.team.name_ph")} onChange={(ev) => setName(ev.target.value)} />
            <small className="hint">{t("cm.join.one_time_note", { max: c.team_max })}</small>
            <div className="row wrap" style={{ gap: 8, marginTop: 8 }}>
              <button className="btn small" type="submit" disabled={name.trim().length < 2 || Boolean(busy)}>{busy === "create" ? t("s.common.sending") : t("cm.team.create")}</button>
              <button className="btn small ghost" type="button" onClick={() => setCreating(false)}>{t("common.cancel")}</button>
            </div>
          </form>
        ) : (
          <button type="button" className="btn small ghost" onClick={() => setCreating(true)}><Icon name="plus" size={15} />{t("cm.join.new_one_time")}</button>
        ))}
        {c.team_kind !== "one_time" && (
          <button type="button" className="btn small ghost" onClick={() => navigate(TEAM_PATH)}><Icon name="users" size={15} />{t("cm.join.my_teams")}</button>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ the work of the open stage

function SubmitStage({ c, stage, entry, onDone }: { c: Competition; stage: StageOut; entry: MyEntry; onDone: (e: MyEntry) => void }) {
  useLang();
  const prev = entry.submissions.find((s) => s.stage_id === stage.id) ?? null;
  const [url, setUrl] = useState(prev?.proof_url ?? "");
  const [note, setNote] = useState(prev?.note ?? "");
  const [kept, setKept] = useState(prev?.files ?? []);
  const [files, setFiles] = useState<SubmittedFile[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);

  async function pick(list: FileList | null) {
    if (!list) return;
    setError("");
    try {
      let count = files.length + kept.length;
      for (const f of Array.from(list)) {
        if (count >= MAX_FILES) { setError(t("s.path.max_files", { n: MAX_FILES })); break; }
        setBusy(t("co.file.uploading"));
        const up = await api.upload(f);
        count += 1;
        setFiles((cur) => [...cur, up]);
      }
    } catch (err) { setError(message(err)); }
    finally { setBusy(""); if (input.current) input.current.value = ""; }
  }
  async function send() {
    setBusy(t("s.common.sending")); setError("");
    try {
      const next = await competitionsApi.submit(c.id, stage.id, {
        proof_url: url.trim(), note: note.trim(), file_ids: [...kept.map((f) => f.id), ...files.map((f) => f.id)],
      });
      haptic("success");
      toast(prev ? t("cm.sub.updated") : t("cm.sub.sent_toast"));
      onDone(next);
    } catch (err) { setError(message(err)); haptic("error"); }
    finally { setBusy(""); }
  }
  const ready = url.trim().length >= 8 || files.length > 0 || kept.length > 0;
  const left = timeLeft(stage.ends_at);
  return (
    <div className="co-card cm-submit">
      <b>{prev ? t("cm.sub.update_title", { stage: stage.title }) : t("cm.sub.title", { stage: stage.title })}</b>
      <p className="hint" style={{ margin: "4px 0 0" }}>{t("cm.sub.until", { date: formatDateTime(stage.ends_at) })}{left ? ` · ${left}` : ""}</p>
      {entry.team && <p className="cm-team-note"><Icon name="users" size={15} />{t("cm.sub.team_note")}</p>}
      {prev && (
        <div className="cm-sub-prev">
          <div className="row between wrap" style={{ gap: 6 }}>
            <span className="cm-entry registered"><Icon name="tick" size={13} /> {t("cm.sub.sent")}</span>
            <span className="hint">{formatDateTime(prev.submitted_at)}</span>
          </div>
          {prev.submitted_by && <div className="hint">{t("cm.sub.by", { name: prev.submitted_by })}</div>}
          {prev.score != null && <div className="st-score"><b>{num(prev.score)}</b>/100</div>}
          {prev.comment && <blockquote className="co-quote">«{prev.comment}»</blockquote>}
          <div className="hint">{t("cm.sub.can_resend")}</div>
        </div>
      )}
      {kept.length > 0 && (
        <div className="files" style={{ marginTop: 10 }}>
          {kept.map((f, i) => (
            <div key={f.id} className="file-chip">
              <span className="file-ext"><Icon name="file" size={14} /></span>
              <a className="file-name" href={f.url} target="_blank" rel="noreferrer">{f.name || t("co.task.file_n", { n: i + 1 })}</a>
              <button className="file-remove" aria-label={t("s.path.remove_file")} onClick={() => setKept(kept.filter((x) => x.id !== f.id))}><Icon name="close" size={16} /></button>
            </div>
          ))}
        </div>
      )}
      <input ref={input} type="file" multiple hidden onChange={(ev) => pick(ev.target.files)} />
      <div className="dropzone" role="button" tabIndex={0} style={{ marginTop: 10 }} onClick={() => input.current?.click()}
           onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); input.current?.click(); } }}>
        <Icon name="upload" size={20} />{t("s.path.choose_file")}
        <span className="hint">{t("st.tb.file_hint", { n: MAX_FILES })}</span>
      </div>
      {files.length > 0 && (
        <div className="files">
          {files.map((f) => (
            <div key={f.id} className="file-chip">
              <span className="file-ext">{(f.name.split(".").pop() ?? "").slice(0, 4).toUpperCase()}</span>
              <span className="file-name">{f.name}</span><span className="hint">{fileSize(f.size)}</span>
              <button className="file-remove" aria-label={t("s.path.remove_file")} onClick={() => setFiles(files.filter((x) => x.id !== f.id))}><Icon name="close" size={16} /></button>
            </div>
          ))}
        </div>
      )}
      <label htmlFor={`proof-${stage.id}`}>{t("cm.sub.link")}</label>
      <input id={`proof-${stage.id}`} value={url} inputMode="url" placeholder={t("s.path.link_ph")} onChange={(ev) => setUrl(ev.target.value)} />
      <label htmlFor={`note-${stage.id}`}>{t("s.common.note_optional")}</label>
      <textarea id={`note-${stage.id}`} value={note} maxLength={1000} rows={3} placeholder={t("cm.sub.note_ph")} onChange={(ev) => setNote(ev.target.value)} />
      {!ready && <p className="hint" style={{ margin: "6px 0 0" }}>{t("cm.sub.need")}</p>}
      <ErrorText error={error} />
      <button className="btn" style={{ marginTop: 10 }} disabled={Boolean(busy) || !ready} onClick={send}>
        {busy || (prev ? t("cm.sub.resend") : t("cm.sub.send"))}
      </button>
    </div>
  );
}
