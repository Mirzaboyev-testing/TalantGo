import { useCallback, useEffect, useState } from "react";
import { formatDateTime, t, useLang } from "../../i18n";
import { courseText } from "../../labels";
import { haptic } from "../../tg";
import { ErrorText, message, toast } from "../../ui";
import Groups from "../Groups";
import { uapi, type Announcement, type Audience, type Facets } from "./uapi";
import type { Go } from "./UniversityApp";
import { Empty, PageHead, Panel, Tabs, Toggle, UIcon } from "./ukit";

const TEMPLATES = ["career_day", "vacancy", "profile", "verify"] as const;

/** Messages to the university's own students (by faculty, course, group...) and the group chats. */
export default function UniMessages({ sub, go }: { sub: string; go: Go }) {
  useLang();
  const view = sub === "groups" ? "groups" : "news";
  return (
    <>
      <PageHead title={t("u.nav.messages")} sub={t("u.msg.sub")} />
      <Tabs value={view} onChange={(v) => go("messages", v === "groups" ? "groups" : undefined)}
            items={[{ id: "news", label: t("u.msg.tab_news") }, { id: "groups", label: t("u.msg.tab_groups") }]} />
      {view === "news" ? <News /> : <div style={{ maxWidth: 820 }}><Groups /></div>}
    </>
  );
}

function audienceTags(a: Audience): string[] {
  const out: string[] = [];
  if (a.faculty) out.push(a.faculty);
  if (a.course) out.push(courseText(a.course));
  if (a.group) out.push(a.group);
  if (a.graduation_year) out.push(t("u.st.grad", { year: a.graduation_year }));
  if (a.verified_only) out.push(t("u.msg.verified_only"));
  if (a.open_to_work) out.push(t("u.st.f.ready"));
  return out.length ? out : [t("u.msg.everyone")];
}

function News() {
  useLang();
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [link, setLink] = useState("");
  const [aud, setAud] = useState<Audience>({});
  const [facets, setFacets] = useState<Facets | null>(null);
  const [reach, setReach] = useState<number | null>(null);
  const [history, setHistory] = useState<Announcement[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(() => uapi.announcements().then(setHistory, (e) => setError(message(e))), []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { uapi.facets(aud.faculty).then(setFacets, () => {}); }, [aud.faculty]);
  useEffect(() => {
    setReach(null);
    const timer = window.setTimeout(() => uapi.previewAudience(aud).then((r) => setReach(r.recipients), () => {}), 250);
    return () => window.clearTimeout(timer);
  }, [aud]);
  const setA = (k: keyof Audience, v: string | number | boolean | undefined) =>
    setAud((cur) => { const next = { ...cur, [k]: v || undefined }; if (k === "faculty") delete next.group; return next; });

  async function send() {
    setBusy(true); setError("");
    try {
      const r = await uapi.announce({ title: title.trim(), text: text.trim(), link: link.trim(), audience: aud });
      haptic("success");
      toast(t("u.msg.sent", { n: r.recipients }));
      setTitle(""); setText(""); setLink("");
      void load();
    } catch (e) { setError(message(e)); }
    finally { setBusy(false); }
  }

  return (
    <div className="u-grid c21" style={{ alignItems: "start" }}>
      <Panel title={t("u.msg.new")} icon="megaphone">
        <div className="u-templates">
          {TEMPLATES.map((k) => (
            <button key={k} className="chip" onClick={() => { setTitle(t(`u.msg.tpl.${k}.title` as "u.msg.tpl.career_day.title")); setText(t(`u.msg.tpl.${k}.text` as "u.msg.tpl.career_day.text")); }}>
              {t(`u.msg.tpl.${k}.name` as "u.msg.tpl.career_day.name")}
            </button>
          ))}
        </div>
        <label>{t("u.msg.title")}</label>
        <input value={title} maxLength={160} placeholder={t("u.msg.title_ph")} onChange={(e) => setTitle(e.target.value)} />
        <label>{t("u.msg.text")}</label>
        <textarea value={text} rows={6} maxLength={2000} placeholder={t("u.msg.text_ph")} onChange={(e) => setText(e.target.value)} />
        <div className="row between" style={{ marginTop: 4 }}><span className="hint">{t("u.msg.plain")}</span><span className="hint">{text.length}/2000</span></div>
        <label>{t("u.msg.link")}</label>
        <select value={link} onChange={(e) => setLink(e.target.value)}>
          <option value="">{t("u.msg.link_default")}</option>
          <option value="/talaba/vakansiyalar">{t("u.msg.link_jobs")}</option>
          <option value="/talaba/profil">{t("u.msg.link_profile")}</option>
          <option value="/talaba/yol">{t("u.msg.link_path")}</option>
        </select>
        <label>{t("u.msg.to_whom")}</label>
        <div className="u-audience">
          <select value={aud.faculty ?? ""} onChange={(e) => setA("faculty", e.target.value)}><option value="">{t("emp.all_faculties")}</option>
            {facets?.faculties.map((x) => <option key={x.value} value={x.value}>{x.value} ({x.count})</option>)}</select>
          <select value={aud.course ?? ""} onChange={(e) => setA("course", e.target.value ? Number(e.target.value) : undefined)}><option value="">{t("u.st.all_courses")}</option>
            {facets?.courses.map((x) => <option key={x.value} value={x.value}>{courseText(x.value)} ({x.count})</option>)}</select>
          <select value={aud.group ?? ""} onChange={(e) => setA("group", e.target.value)}><option value="">{t("u.st.all_groups")}</option>
            {facets?.groups.map((x) => <option key={x.value} value={x.value}>{x.value} ({x.count})</option>)}</select>
          <select value={aud.graduation_year ?? ""} onChange={(e) => setA("graduation_year", e.target.value ? Number(e.target.value) : undefined)}><option value="">{t("u.st.all_years")}</option>
            {facets?.years.map((x) => <option key={x.value} value={x.value}>{t("u.st.grad", { year: x.value })}</option>)}</select>
        </div>
        <div className="u-filter-row" style={{ marginTop: 8 }}>
          <Toggle on={Boolean(aud.verified_only)} onChange={(v) => setA("verified_only", v)}>{t("u.msg.verified_only")}</Toggle>
          <Toggle on={Boolean(aud.open_to_work)} onChange={(v) => setA("open_to_work", v)}>{t("u.st.f.ready")}</Toggle>
        </div>
        <div className="u-reach"><UIcon name="users" size={18} /><span className="grow">{t("u.msg.reach")}</span><b>{reach ?? "…"}</b></div>
        <ErrorText error={error} />
        <button className="btn" style={{ marginTop: 12 }} disabled={busy || title.trim().length < 3 || text.trim().length < 5 || !reach} onClick={send}>
          <UIcon name="send" size={17} />{busy ? t("p.common.sending") : t("u.msg.send", { n: reach ?? 0 })}
        </button>
        <p className="hint" style={{ marginBottom: 0 }}>{t("u.msg.limit")}</p>
      </Panel>
      <Panel title={t("u.msg.history")} icon="clock">
        {!history ? <div className="u-skel" /> : history.length === 0 ? <Empty small icon="megaphone" tone="violet" title={t("u.msg.none")} text={t("u.msg.none_sub")} /> : (
          <div>
            {history.map((a) => (
              <div key={a.id} className="u-msg">
                <div className="row between" style={{ gap: 8, alignItems: "flex-start" }}><b>{a.title}</b><span className="u-tag green">{t("u.msg.reached", { n: a.recipients })}</span></div>
                <p>{a.text.length > 220 ? `${a.text.slice(0, 220)}…` : a.text}</p>
                <div className="u-chipline">{audienceTags(a.audience).map((x) => <span key={x} className="u-tag">{x}</span>)}</div>
                <div className="hint" style={{ marginTop: 6 }}>{formatDateTime(a.created_at)}{a.author ? ` · ${a.author}` : ""}</div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
