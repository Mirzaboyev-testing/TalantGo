import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Me, type NewsCategory, type NewsItem, type SubmittedFile } from "../../api";
import { t, useLang } from "../../i18n";
import { courseText } from "../../labels";
import { ask, haptic } from "../../tg";
import { ErrorText, message, toast } from "../../ui";
import Groups from "../Groups";
import Feed from "../student/Feed";
import { NEWS_CATEGORIES, NewsCard, categoryLabel } from "../NewsCard";
import { uapi, type Announcement, type Audience, type Channel, type Facets } from "./uapi";
import type { Go } from "./UniversityApp";
import { Empty, PageHead, Panel, Tabs, Toggle, UIcon } from "./ukit";

const TEMPLATES = ["career_day", "vacancy", "profile", "verify"] as const;
const MAX_PHOTOS = 6;

/** Announcements (with photos) to students, partner companies and the public page; the posts feed, where the
 *  university posts as itself next to its students (student panel's Feed); and the group chats. */
export default function UniMessages({ me, sub, go }: { me: Me; sub: string; go: Go }) {
  useLang();
  const view = sub === "groups" ? "groups" : sub === "feed" ? "feed" : "news";
  return (
    <>
      <PageHead title={t("u.nav.messages")} sub={t("u.msg.sub")} />
      <Tabs value={view} onChange={(v) => go("messages", v === "news" ? undefined : v)}
            items={[{ id: "news", label: t("u.msg.tab_news") }, { id: "feed", label: t("u.msg.tab_feed") },
                    { id: "groups", label: t("u.msg.tab_groups") }]} />
      {view === "news" && <News />}
      {view === "feed" && <div style={{ maxWidth: 820 }}><Feed me={me} /></div>}
      {view === "groups" && <div style={{ maxWidth: 820 }}><Groups /></div>}
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
  const [category, setCategory] = useState<NewsCategory>("news");
  const [channels, setChannels] = useState<Channel[]>(["students"]);
  const [photos, setPhotos] = useState<SubmittedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [aud, setAud] = useState<Audience>({});
  const [facets, setFacets] = useState<Facets | null>(null);
  const [reach, setReach] = useState<{ recipients: number; companies: number } | null>(null);
  const [history, setHistory] = useState<Announcement[] | null>(null);
  const [uni, setUni] = useState<NewsItem["university"]>(null);
  const [pv, setPv] = useState<"student" | "company" | "notif">("student");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const picker = useRef<HTMLInputElement>(null);
  const load = useCallback(() => uapi.announcements().then(setHistory, (e) => setError(message(e))), []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { uapi.profile().then((p) => setUni({ id: p.id, name: p.name, short_name: p.short_name, logo_url: p.logo_url }), () => {}); }, []);
  useEffect(() => { uapi.facets(aud.faculty).then(setFacets, () => {}); }, [aud.faculty]);
  useEffect(() => {
    setReach(null);
    // both counts every time, so the companies card shows how many partners there are even before it is ticked
    const timer = window.setTimeout(() => uapi.previewAudience(aud, ["students", "companies"]).then(setReach, () => {}), 250);
    return () => window.clearTimeout(timer);
  }, [aud]);
  const setA = (k: keyof Audience, v: string | number | boolean | undefined) =>
    setAud((cur) => { const next = { ...cur, [k]: v || undefined }; if (k === "faculty") delete next.group; return next; });
  const has = (c: Channel) => channels.includes(c);
  const toggle = (c: Channel) => setChannels((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]));
  const students = has("students") ? reach?.recipients ?? 0 : 0;
  const companies = has("companies") ? reach?.companies ?? 0 : 0;
  const reachesSomeone = has("public") || students > 0 || companies > 0;

  async function addPhotos(list: FileList | null) {
    const files = Array.from(list ?? []).slice(0, MAX_PHOTOS - photos.length);
    if (!files.length) return;
    setUploading(true);
    try {
      for (const f of files) {
        if (f.size > 10 * 1024 * 1024) { toast(t("u.file.too_big"), "error"); continue; }
        const up = await api.upload(f);
        setPhotos((cur) => (cur.length < MAX_PHOTOS ? [...cur, up] : cur));
      }
    } catch (e) { toast(message(e), "error"); }
    finally { setUploading(false); if (picker.current) picker.current.value = ""; }
  }

  async function send() {
    if (!channels.length) { setError(t("u.msg.need_channel")); return; }
    setBusy(true); setError("");
    try {
      const r = await uapi.announce({ title: title.trim(), text: text.trim(), link: link.trim(), audience: aud, channels, category,
                                      photo_ids: photos.map((p) => p.id) });
      haptic("success");
      toast(t("u.msg.published", { students: r.recipients, companies: r.company_recipients }));
      setTitle(""); setText(""); setLink(""); setPhotos([]); setCategory("news");
      void load();
    } catch (e) { setError(message(e)); }
    finally { setBusy(false); }
  }

  async function remove(a: Announcement) {
    if (!(await ask(t("u.msg.delete_confirm")))) return;
    try { await uapi.deleteAnnouncement(a.id); toast(t("u.msg.deleted")); void load(); } catch (e) { toast(message(e), "error"); }
  }

  const draft: NewsItem = {
    id: 0, title: title.trim() || t("u.msg.pv.title_ph"), text: text.trim() || t("u.msg.pv.text_ph"), link: link.trim(), category,
    created_at: new Date().toISOString(), photos, university: uni,
  };
  const CHANNELS: [Channel, "users" | "building" | "globe", string, string][] = [
    ["students", "users", t("u.msg.ch.students"), t("u.msg.ch.students_hint")],
    ["companies", "building", t("u.msg.ch.companies"), reach && reach.companies === 0 ? t("u.msg.no_partners") : t("u.msg.ch.companies_hint", { n: reach?.companies ?? "…" })],
    ["public", "globe", t("u.msg.ch.public"), t("u.msg.ch.public_hint")],
  ];

  return (
    <>
      <div className="u-grid c21" style={{ alignItems: "start" }}>
        <Panel title={t("u.msg.new")} icon="megaphone">
          <label style={{ marginTop: 0 }}>{t("u.msg.channels")}</label>
          <div className="u-channels">
            {CHANNELS.map(([c, icon, name, hint]) => (
              <label key={c} className={`u-channel ${has(c) ? "on" : ""}`}>
                <input type="checkbox" checked={has(c)} onChange={() => toggle(c)} />
                <span className="u-ic"><UIcon name={icon} size={18} /></span>
                <span className="grow" style={{ minWidth: 0 }}><b>{name}</b><span>{hint}</span></span>
                <span className="u-check" aria-hidden="true">{has(c) && <UIcon name="check" size={14} />}</span>
              </label>
            ))}
          </div>
          <div className="u-templates" style={{ marginTop: 14 }}>
            {TEMPLATES.map((k) => (
              <button key={k} className="chip" onClick={() => { setTitle(t(`u.msg.tpl.${k}.title` as "u.msg.tpl.career_day.title")); setText(t(`u.msg.tpl.${k}.text` as "u.msg.tpl.career_day.text")); }}>
                {t(`u.msg.tpl.${k}.name` as "u.msg.tpl.career_day.name")}
              </button>
            ))}
          </div>
          <div className="u-form-row">
            <div className="grow"><label>{t("u.msg.title")}</label>
              <input value={title} maxLength={160} placeholder={t("u.msg.title_ph")} onChange={(e) => setTitle(e.target.value)} /></div>
            <div style={{ minWidth: 170 }}><label>{t("u.msg.category")}</label>
              <select value={category} onChange={(e) => setCategory(e.target.value as NewsCategory)}>
                {NEWS_CATEGORIES.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}
              </select></div>
          </div>
          <label>{t("u.msg.text")}</label>
          <textarea value={text} rows={6} maxLength={2000} placeholder={t("u.msg.text_ph")} onChange={(e) => setText(e.target.value)} />
          <div className="row between" style={{ marginTop: 4 }}><span className="hint">{t("u.msg.plain")}</span><span className="hint">{text.length}/2000</span></div>

          <label>{t("u.msg.photos")}</label>
          <div className="u-photos">
            {photos.map((p, i) => (
              <div key={p.id} className="u-photo">
                <img src={p.url} alt="" />
                {i === 0 && <span className="u-photo-cover">{t("u.msg.cover")}</span>}
                <button className="u-photo-x" onClick={() => setPhotos((cur) => cur.filter((x) => x.id !== p.id))} aria-label={t("u.msg.remove_photo")}><UIcon name="close" size={14} /></button>
              </div>
            ))}
            {photos.length < MAX_PHOTOS && (
              <label className={`u-photo add ${uploading ? "busy" : ""}`}>
                <input ref={picker} type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={uploading}
                       onChange={(e) => void addPhotos(e.target.files)} />
                <UIcon name={uploading ? "clock" : "image"} size={20} />
                <span>{uploading ? t("u.file.uploading") : t("u.msg.add_photo")}</span>
              </label>
            )}
          </div>
          <div className="hint" style={{ marginTop: 6 }}>{t("u.msg.photos_hint")}</div>

          <label>{t("u.msg.link")}</label>
          <input value={link} maxLength={256} placeholder={t("u.msg.link_ph")} list="u-msg-links" onChange={(e) => setLink(e.target.value)} />
          <datalist id="u-msg-links">
            <option value="/talaba/vakansiyalar">{t("u.msg.link_jobs")}</option>
            <option value="/talaba/profil">{t("u.msg.link_profile")}</option>
            <option value="/talaba/tadbirlar">{t("u.nav.events")}</option>
          </datalist>
          <div className="hint" style={{ marginTop: 4 }}>{t("u.msg.link_hint")}</div>

          {has("students") && (
            <>
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
            </>
          )}
          <div className="u-reach-grid">
            <div className={`u-reach ${has("students") ? "" : "off"}`}><UIcon name="users" size={18} /><span className="grow">{t("u.msg.reach")}</span><b>{has("students") ? reach?.recipients ?? "…" : "—"}</b></div>
            <div className={`u-reach ${has("companies") ? "" : "off"}`}><UIcon name="building" size={18} /><span className="grow">{t("u.msg.reach_companies")}</span><b>{has("companies") ? reach?.companies ?? "…" : "—"}</b></div>
          </div>
          <ErrorText error={error} />
          <button className="btn" style={{ marginTop: 12 }}
                  disabled={busy || uploading || !channels.length || title.trim().length < 3 || text.trim().length < 5 || !reach || !reachesSomeone} onClick={send}>
            <UIcon name="send" size={17} />{busy ? t("p.common.sending") : t("u.msg.publish")}
          </button>
          <p className="hint" style={{ marginBottom: 0 }}>{t("u.msg.limit")}</p>
        </Panel>

        <Panel title={t("u.msg.preview")} icon="eye" className="u-sticky">
          <div className="u-pv-tabs" role="tablist">
            {(["student", "company", "notif"] as const).map((k) => (
              <button key={k} role="tab" aria-selected={pv === k} className={pv === k ? "on" : ""} onClick={() => setPv(k)}>{t(`u.msg.pv.${k}`)}</button>
            ))}
          </div>
          {pv === "student" && (has("students") || has("public")
            ? <><NewsCard item={draft} />{!has("students") && <p className="hint" style={{ marginBottom: 0 }}>{t("u.msg.pv.public_note")}</p>}</>
            : <div className="u-note">{t("u.msg.pv.off", { who: t("u.msg.pv.who_students") })}</div>)}
          {pv === "company" && (has("companies") || has("public")
            ? <><NewsCard item={{ ...draft, partner: has("companies") }} />{!has("companies") && <p className="hint" style={{ marginBottom: 0 }}>{t("u.msg.pv.public_note")}</p>}</>
            : <div className="u-note">{t("u.msg.pv.off", { who: t("u.msg.pv.who_companies") })}</div>)}
          {pv === "notif" && (
            has("students") || has("companies") ? (
              <div className="nt u-notif-preview">
                <div className="nt-item unread">
                  <span className="nt-ic violet"><UIcon name="megaphone" size={17} /></span>
                  <span className="nt-body"><span className="nt-text">{`${uni?.short_name ?? ""}: ${draft.title}\n${draft.text}`}</span>
                    <span className="nt-time">{t("notif.just_now")}</span></span>
                  <span className="nt-dot" />
                </div>
              </div>
            ) : <div className="u-note">{t("u.msg.ch.public_hint")}</div>
          )}
        </Panel>
      </div>

      <Panel title={t("u.msg.history")} icon="clock">
        {!history ? <div className="u-skel" /> : history.length === 0 ? <Empty small icon="megaphone" tone="violet" title={t("u.msg.none")} text={t("u.msg.none_sub")} /> : (
          <div className="nw-grid">
            {history.map((a) => (
              <div key={a.id} className="u-news-item">
                <NewsCard item={a} showUniversity={false} />
                <div className="u-news-foot">
                  <div className="u-chipline">
                    {a.channels.includes("students") && <span className="u-tag green"><UIcon name="users" size={12} />{t("u.msg.reached", { n: a.recipients })}</span>}
                    {a.channels.includes("companies") && <span className="u-tag violet"><UIcon name="building" size={12} />{t("u.msg.reached_companies", { n: a.company_recipients })}</span>}
                    {a.channels.includes("public") && <span className="u-tag blue"><UIcon name="globe" size={12} />{t("u.msg.on_public")}</span>}
                    {a.channels.includes("students") && audienceTags(a.audience).map((x) => <span key={x} className="u-tag">{x}</span>)}
                  </div>
                  <div className="row between" style={{ gap: 8, marginTop: 8 }}>
                    <span className="hint">{a.author ?? ""}</span>
                    <button className="btn small ghost u-danger" onClick={() => remove(a)}><UIcon name="trash" size={14} />{t("u.msg.delete")}</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </>
  );
}
