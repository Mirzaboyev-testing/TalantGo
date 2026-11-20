// «Jamoam» in Topshiriqlar: my persistent and one-time teams, opening a team, and joining one by its 6-character
// code. ?kod=<CODE> (the share link) shows the team at once with a «Qo'shilish» button; ?id=<id> opens a team.
import { useCallback, useEffect, useState } from "react";
import { competitionsApi, type TeamOut, type TeamPreview } from "../../../competitionsApi";
import { t, useLang } from "../../../i18n";
import { Icon } from "../../../icons";
import { navigate, useSearch } from "../../../router";
import { haptic } from "../../../tg";
import { Avatar, ErrorText, Sheet, message, toast } from "../../../ui";
import TeamPage from "./TeamPage";
import { KindBadge, TEAM_PATH, TeamMark, teamLink } from "./kit";
import "./competitions.css";

const PERSISTENT_MAX = 2;          // a student is in at most two persistent teams (docs/13, section 5)
const cleanCode = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);

export default function TeamsHub() {
  useLang();
  const search = useSearch();
  const id = search.id ? Number(search.id) || null : null;
  if (id) return <TeamPage key={id} id={id} onBack={() => navigate(TEAM_PATH)} />;
  return <TeamsHome code={search.kod ? cleanCode(search.kod) : ""} />;
}

function TeamsHome({ code: linkCode }: { code: string }) {
  useLang();
  const [teams, setTeams] = useState<TeamOut[] | null>(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [code, setCode] = useState(linkCode);
  const [preview, setPreview] = useState<TeamPreview | null>(null);
  const [joinError, setJoinError] = useState("");
  const [busy, setBusy] = useState("");
  const load = useCallback(() => competitionsApi.myTeams().then(setTeams, (e) => setError(message(e))), []);
  useEffect(() => { void load(); }, [load]);

  const look = useCallback(async (value: string) => {
    if (value.length !== 6) { setJoinError(t("cm.join_code.need6")); return; }
    setBusy("preview"); setJoinError("");
    try { setPreview(await competitionsApi.previewTeam(value)); }
    catch (e) { setJoinError(message(e)); }
    finally { setBusy(""); }
  }, []);
  // the share link: the team shows straight away
  useEffect(() => { if (linkCode) { setCode(linkCode); void look(linkCode); } }, [linkCode, look]);

  function closePreview() {
    setPreview(null);
    if (linkCode) navigate(TEAM_PATH, { replace: true });
  }
  async function join() {
    setBusy("join"); setJoinError("");
    try {
      const team = await competitionsApi.joinTeam(code);
      haptic("success"); toast(t("cm.join_code.joined", { name: team.name }));
      setPreview(null);
      navigate(teamLink(team.id), { replace: Boolean(linkCode) });
    } catch (e) { setJoinError(message(e)); haptic("error"); }
    finally { setBusy(""); }
  }

  const persistent = (teams ?? []).filter((x) => x.kind === "persistent");
  const oneTime = (teams ?? []).filter((x) => x.kind === "one_time");
  const full = persistent.length >= PERSISTENT_MAX;
  const already = preview && teams?.find((x) => x.id === preview.id);

  return (
    <div className="co-page cm-page">
      <p className="hint cm-intro">{t("cm.teams.intro")}</p>
      <div className="cm-team-actions">
        <div className="co-card cm-action">
          <span className="cm-action-icon"><Icon name="plus" size={20} /></span>
          <div className="grow" style={{ minWidth: 0 }}>
            <b>{t("cm.teams.new")}</b>
            <p className="hint">{full ? t("cm.teams.new_full", { n: PERSISTENT_MAX }) : t("cm.teams.new_hint")}</p>
            <button className="btn small" disabled={full} onClick={() => setCreating(true)}>{t("cm.teams.new_btn")}</button>
          </div>
        </div>
        <div className="co-card cm-action">
          <span className="cm-action-icon blue"><Icon name="link" size={20} /></span>
          <form className="grow" style={{ minWidth: 0 }} onSubmit={(e) => { e.preventDefault(); void look(code); }}>
            <b>{t("cm.join_code.title")}</b>
            <p className="hint">{t("cm.join_code.hint")}</p>
            <div className="cm-code-field">
              <input value={code} maxLength={6} autoCapitalize="characters" autoComplete="off" spellCheck={false}
                     aria-label={t("cm.join_code.label")} placeholder="AB12CD" onChange={(e) => { setCode(cleanCode(e.target.value)); setJoinError(""); }} />
              <button className="btn small" type="submit" disabled={code.length !== 6 || Boolean(busy)}>{busy === "preview" ? "…" : t("cm.join_code.look")}</button>
            </div>
            {!preview && <ErrorText error={joinError} />}
          </form>
        </div>
      </div>

      <ErrorText error={error} />
      {!teams && !error && <div className="st-skeleton-grid"><span /><span /></div>}
      {teams && teams.length === 0 && (
        <div className="st-empty">
          <Icon name="users" size={28} />
          <b>{t("cm.teams.empty")}</b>
          <span className="hint">{t("cm.teams.empty_hint")}</span>
        </div>
      )}
      {persistent.length > 0 && (
        <section>
          <h3 className="st-sub-title">{t("cm.teams.persistent", { n: persistent.length, max: PERSISTENT_MAX })}</h3>
          <div className="st-card-grid">{persistent.map((x) => <TeamCard key={x.id} team={x} />)}</div>
        </section>
      )}
      {oneTime.length > 0 && (
        <section>
          <h3 className="st-sub-title">{t("cm.teams.one_time")}</h3>
          <div className="st-card-grid">{oneTime.map((x) => <TeamCard key={x.id} team={x} />)}</div>
        </section>
      )}
      {teams && teams.length > 0 && <p className="hint">{t("cm.teams.kinds_hint")}</p>}

      {creating && <CreateTeam onClose={() => setCreating(false)} />}
      {preview && (
        <Sheet onClose={closePreview}>
          <div className="cm-preview">
            <TeamMark name={preview.name} big />
            <h2>{preview.name}</h2>
            <div className="row wrap" style={{ gap: 6, justifyContent: "center" }}>
              <KindBadge kind={preview.kind} />
              <span className="co-pill cm-pill-soft"><Icon name="users" size={13} />{t("cm.members_of", { n: preview.members_n, max: preview.size_max })}</span>
            </div>
            <p className="hint">{t("cm.join_code.captain", { name: preview.captain_name })}</p>
            {preview.competition_title && <p className="hint">{t("cm.join_code.for", { title: preview.competition_title })}</p>}
            {preview.kind === "persistent" && !already && full && <p className="cm-why"><Icon name="help" size={15} />{t("cm.teams.join_full", { n: PERSISTENT_MAX })}</p>}
            <ErrorText error={joinError} />
            {already ? (
              <button className="btn" onClick={() => { setPreview(null); navigate(teamLink(preview.id)); }}>{t("cm.join_code.open_mine")}</button>
            ) : (
              <button className="btn" disabled={Boolean(busy) || preview.members_n >= preview.size_max} onClick={join}>
                {preview.members_n >= preview.size_max ? t("cm.join_code.full") : busy === "join" ? t("s.common.sending") : t("cm.join_code.join")}
              </button>
            )}
            <button className="btn ghost" onClick={closePreview}>{t("common.cancel")}</button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function TeamCard({ team }: { team: TeamOut }) {
  useLang();
  return (
    <button type="button" className="st-task-card cm-team-card" onClick={() => navigate(teamLink(team.id))}>
      <div className="row between" style={{ gap: 8 }}>
        <KindBadge kind={team.kind} />
        {team.is_captain && <span className="cm-captain"><Icon name="star" size={12} />{t("cm.team.captain")}</span>}
      </div>
      <div className="row" style={{ gap: 10 }}>
        <TeamMark name={team.name} />
        <b className="grow ellipsis">{team.name}</b>
      </div>
      {team.kind === "one_time" && team.competition_title && <span className="hint ellipsis"><Icon name="trophy" size={13} /> {team.competition_title}</span>}
      {team.description && <p className="co-clamp cm-clamp2">{team.description}</p>}
      <div className="cm-avatars">
        {team.members.slice(0, 5).map((m) => <span key={m.user_id} title={m.name}><Avatar name={m.name} url={m.photo_url} /></span>)}
        <small>{t("cm.members_of", { n: team.members.length, max: team.size_max })}</small>
      </div>
      {team.kind === "persistent" && (
        <div className="st-task-meta" style={{ marginTop: "auto" }}>
          <span className="co-pill">{t("cm.team.points", { n: team.points })}</span>
          {team.wins > 0 && <span className="co-pill warn"><Icon name="trophy" size={12} />{t("cm.team.wins", { n: team.wins })}</span>}
          <span className="hint">{t("cm.team.competitions", { n: team.competitions_n })}</span>
        </div>
      )}
    </button>
  );
}

function CreateTeam({ onClose }: { onClose: () => void }) {
  useLang();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    setBusy(true); setError("");
    try {
      const team = await competitionsApi.createTeam({ name: name.trim(), kind: "persistent", description: description.trim() });
      haptic("success"); toast(t("cm.team.created"));
      onClose();
      navigate(teamLink(team.id));
    } catch (e) { setError(message(e)); }
    finally { setBusy(false); }
  }
  return (
    <Sheet onClose={onClose}>
      <form className="cm-sheet-form" onSubmit={(e) => { e.preventDefault(); if (name.trim().length >= 2) void save(); }}>
        <h2>{t("cm.teams.new")}</h2>
        <p className="hint">{t("cm.teams.new_sheet_hint")}</p>
        <label htmlFor="team-name">{t("cm.team.name")}</label>
        <input id="team-name" value={name} maxLength={60} autoFocus placeholder={t("cm.team.name_ph")} onChange={(e) => setName(e.target.value)} />
        <label htmlFor="team-about">{t("cm.team.about")}</label>
        <textarea id="team-about" value={description} maxLength={300} rows={3} placeholder={t("cm.team.about_ph")} onChange={(e) => setDescription(e.target.value)} />
        <ErrorText error={error} />
        <div className="cm-sheet-actions">
          <button className="btn" type="submit" disabled={busy || name.trim().length < 2}>{busy ? t("s.common.sending") : t("cm.team.create")}</button>
          <button className="btn ghost" type="button" onClick={onClose}>{t("common.cancel")}</button>
        </div>
      </form>
    </Sheet>
  );
}
