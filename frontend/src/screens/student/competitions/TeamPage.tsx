// One team: members with the captain, the invite code and link (members only), the captain's tools (remove,
// make captain, new code, edit), leaving, and the competitions the team took part in.
import { useCallback, useEffect, useRef, useState } from "react";
import { competitionsApi, type TeamMember, type TeamOut } from "../../../competitionsApi";
import { t, useLang } from "../../../i18n";
import { Icon } from "../../../icons";
import { navigate } from "../../../router";
import { ask, backButton, haptic, insideTelegram, openLink } from "../../../tg";
import { Avatar, ErrorText, Sheet, message, toast } from "../../../ui";
import { KindBadge, Rank, TEAM_PATH, TeamMark, compLink, copyText, day, joinLink, num } from "./kit";

export default function TeamPage({ id, onBack }: { id: number; onBack: () => void }) {
  useLang();
  const [team, setTeam] = useState<TeamOut | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [editing, setEditing] = useState(false);
  const load = useCallback(() => competitionsApi.team(id).then(setTeam, (e) => setError(message(e))), [id]);
  useEffect(() => { void load(); }, [load]);
  const back = useRef(onBack);
  back.current = onBack;
  useEffect(() => backButton(() => back.current()), []);

  const head = <button className="btn small ghost co-back" onClick={onBack}><Icon name="back" size={16} />{t("cm.teams.back")}</button>;
  if (!team) return <div className="co-page cm-page">{head}{error ? <ErrorText error={error} /> : <div className="st-skeleton-grid"><span /><span /></div>}</div>;

  // keeps what the list view had (history) when an action answers with the team alone
  const update = (next: TeamOut) => setTeam((cur) => ({ ...next, history: next.history ?? cur?.history }));
  async function act(key: string, call: () => Promise<TeamOut>, done: string) {
    setBusy(key); setError("");
    try { update(await call()); haptic("success"); toast(done); }
    catch (e) { setError(message(e)); haptic("error"); }
    finally { setBusy(""); }
  }
  async function remove(m: TeamMember) {
    if (!(await ask(t("cm.team.remove_ask", { name: m.name })))) return;
    await act(`rm-${m.user_id}`, () => competitionsApi.removeMember(team!.id, m.user_id), t("cm.team.removed", { name: m.name }));
  }
  async function captain(m: TeamMember) {
    if (!(await ask(t("cm.team.captain_ask", { name: m.name })))) return;
    await act(`cap-${m.user_id}`, () => competitionsApi.makeCaptain(team!.id, m.user_id), t("cm.team.captain_done", { name: m.name }));
  }
  async function newCode() {
    if (!(await ask(t("cm.team.new_code_ask")))) return;
    await act("code", () => competitionsApi.newCode(team!.id), t("cm.team.new_code_done"));
  }
  async function leave() {
    const alone = team!.members.length <= 1;
    if (!(await ask(alone ? t("cm.team.leave_alone_ask") : t("cm.team.leave_ask", { name: team!.name })))) return;
    setBusy("leave"); setError("");
    try {
      await competitionsApi.leaveTeam(team!.id);
      haptic("success"); toast(alone ? t("cm.team.closed") : t("cm.team.left"));
      navigate(TEAM_PATH, { replace: true });
    } catch (e) { setError(message(e)); haptic("error"); }
    finally { setBusy(""); }
  }

  const captainMe = team.is_captain;
  const others = team.members.length > 1;
  const members = [...team.members].sort((a, b) => (a.role === b.role ? a.joined_at.localeCompare(b.joined_at) : a.role === "captain" ? -1 : 1));
  return (
    <div className="co-page cm-page">
      {head}
      <div className="co-card cm-team-hero">
        <TeamMark name={team.name} big />
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="row wrap" style={{ gap: 6 }}>
            <KindBadge kind={team.kind} />
            {captainMe && <span className="cm-captain"><Icon name="star" size={12} />{t("cm.team.you_captain")}</span>}
          </div>
          <h1>{team.name}</h1>
          {team.kind === "one_time" && team.competition_id && team.competition_title && (
            <button type="button" className="cm-linkish" onClick={() => navigate(compLink(team.competition_id!))}>
              <Icon name="trophy" size={14} />{team.competition_title}
            </button>
          )}
          {team.description && <p className="st-pre">{team.description}</p>}
        </div>
        {captainMe && <button className="btn small ghost cm-edit" onClick={() => setEditing(true)}><Icon name="edit" size={15} />{t("cm.team.edit")}</button>}
        {team.kind === "persistent" && (
          <div className="cm-team-stats">
            <div><b>{team.points}</b><span>{t("cm.team.points_label")}</span></div>
            <div><b>{team.wins}</b><span>{t("cm.team.wins_label")}</span></div>
            <div><b>{team.competitions_n}</b><span>{t("cm.team.competitions_label")}</span></div>
          </div>
        )}
      </div>
      <ErrorText error={error} />

      <div className="co-dash-grid cm-team-grid">
        <div className="co-col">
          <div className="co-card">
            <div className="co-card-head">
              <b>{t("cm.team.members")}</b>
              <span className="hint">{t("cm.members_of", { n: team.members.length, max: team.size_max })}</span>
            </div>
            <div className="cm-members">
              {members.map((m) => {
                return (
                  <div key={m.user_id} className="cm-member">
                    <Avatar name={m.name} url={m.photo_url} />
                    <div className="grow" style={{ minWidth: 0 }}>
                      <b className="ellipsis">{m.name}{m.role === "captain" && <span className="cm-captain"><Icon name="star" size={11} />{t("cm.team.captain")}</span>}</b>
                      <small className="ellipsis">{m.subtitle}</small>
                      <small className="hint">{t("cm.team.joined", { date: day(m.joined_at) })}</small>
                    </div>
                    {captainMe && m.role !== "captain" && (
                      <div className="cm-member-actions">
                        <button className="btn small ghost" disabled={Boolean(busy)} onClick={() => captain(m)}><Icon name="star" size={14} />{t("cm.team.make_captain")}</button>
                        <button className="btn small bad" disabled={Boolean(busy)} onClick={() => remove(m)}><Icon name="close" size={14} />{t("cm.team.remove")}</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {captainMe && <p className="cm-replace"><Icon name="help" size={15} />{t("cm.team.replace_hint")}</p>}
          </div>

          <div className="co-card">
            <div className="co-card-head"><b>{t("cm.team.history")}</b></div>
            {(team.history ?? []).length === 0 && <p className="hint" style={{ margin: 0 }}>{t("cm.team.history_empty")}</p>}
            {(team.history ?? []).map((h) => (
              <button key={h.competition_id} type="button" className="cm-history" onClick={() => navigate(compLink(h.competition_id))}>
                {h.place ? <Rank n={h.place} /> : <span className="cm-rank">·</span>}
                <span className="grow ellipsis">{h.title}</span>
                {h.score != null && <b>{num(h.score)}</b>}
                <Icon name="arrow" size={15} />
              </button>
            ))}
          </div>
        </div>

        <div className="co-col">
          {team.invite_code && <InviteCard team={team} busy={busy === "code"} onNewCode={captainMe ? newCode : undefined} />}
          {team.mine && (
            <div className="co-card">
              <b>{captainMe && !others ? t("cm.team.close_title") : t("cm.team.leave_title")}</b>
              <p className="hint">
                {captainMe && others ? t("cm.team.leave_captain_hint") : captainMe ? t("cm.team.leave_alone_hint") : t("cm.team.leave_hint")}
              </p>
              <button className="btn small bad" disabled={Boolean(busy) || (captainMe && others)} onClick={leave}>
                <Icon name="logout" size={15} />{captainMe && !others ? t("cm.team.close") : t("cm.team.leave")}
              </button>
            </div>
          )}
          {!team.mine && <div className="co-card hint">{t("cm.team.not_member")}</div>}
        </div>
      </div>

      {editing && <EditTeam team={team} onClose={() => setEditing(false)} onSaved={(next) => { update(next); setEditing(false); }} />}
    </div>
  );
}

function InviteCard({ team, busy, onNewCode }: { team: TeamOut; busy: boolean; onNewCode?: () => void }) {
  useLang();
  const code = team.invite_code!;
  const link = joinLink(code);
  const full = team.members.length >= team.size_max;
  const share = () => openLink(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(t("cm.invite.share_text", { name: team.name, code }))}`);
  return (
    <div className="co-card cm-invite">
      <b>{t("cm.invite.title")}</b>
      <p className="hint">{full ? t("cm.invite.full", { n: team.members.length, max: team.size_max }) : t("cm.invite.hint")}</p>
      <div className="cm-code big" aria-label={t("cm.code")}>{code}</div>
      <div className="cm-invite-btns">
        <button className="btn small soft" onClick={() => copyText(code, t("cm.copied_code"))}><Icon name="copy" size={15} />{t("cm.copy_code")}</button>
        <button className="btn small soft" onClick={() => copyText(link, t("cm.copied_link"))}><Icon name="link" size={15} />{t("cm.copy_link")}</button>
        {insideTelegram || !navigator.share
          ? <button className="btn small soft" onClick={share}><Icon name="send" size={15} />{t("cm.invite.share")}</button>
          : <button className="btn small soft" onClick={() => navigator.share({ title: team.name, text: t("cm.invite.share_text", { name: team.name, code }), url: link }).catch(() => {})}><Icon name="send" size={15} />{t("cm.invite.share")}</button>}
      </div>
      <small className="hint ellipsis cm-invite-link">{link}</small>
      {onNewCode && (
        <button className="link-btn cm-new-code" disabled={busy} onClick={onNewCode}>{t("cm.team.new_code")}</button>
      )}
    </div>
  );
}

function EditTeam({ team, onClose, onSaved }: { team: TeamOut; onClose: () => void; onSaved: (t: TeamOut) => void }) {
  useLang();
  const [name, setName] = useState(team.name);
  const [description, setDescription] = useState(team.description);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    setBusy(true); setError("");
    try {
      const next = await competitionsApi.editTeam(team.id, { name: name.trim(), description: description.trim() });
      toast(t("cm.team.saved"));
      onSaved(next);
    } catch (e) { setError(message(e)); }
    finally { setBusy(false); }
  }
  return (
    <Sheet onClose={onClose}>
      <form className="cm-sheet-form" onSubmit={(e) => { e.preventDefault(); if (name.trim().length >= 2) void save(); }}>
        <h2>{t("cm.team.edit")}</h2>
        <label htmlFor="team-edit-name">{t("cm.team.name")}</label>
        <input id="team-edit-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        <label htmlFor="team-edit-about">{t("cm.team.about")}</label>
        <textarea id="team-edit-about" value={description} maxLength={300} rows={3} placeholder={t("cm.team.about_ph")} onChange={(e) => setDescription(e.target.value)} />
        <ErrorText error={error} />
        <div className="cm-sheet-actions">
          <button className="btn" type="submit" disabled={busy || name.trim().length < 2}>{busy ? t("s.common.sending") : t("common.save")}</button>
          <button className="btn ghost" type="button" onClick={onClose}>{t("common.cancel")}</button>
        </div>
      </form>
    </Sheet>
  );
}
