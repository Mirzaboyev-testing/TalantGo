import { useEffect, useState } from "react";
import { api, CONTACT_FIELDS, type Me, type PublicStats, type TeamMember } from "../api";
import { BRAND } from "../brand";
import { getLang, t, type MsgKey } from "../i18n";
import { Icon } from "../icons";
import { go, PartnerLogo, statTiles } from "./Home";
import { panelBase } from "./panels";
import { contactHref, initials, siteImage, useSiteContent } from "./siteContent";

const PROBLEMS: [string, MsgKey, MsgKey][] = [
  ["school", "site.about.pr.student", "site.about.pr.student_text"],
  ["briefcase", "site.about.pr.company", "site.about.pr.company_text"],
  ["building", "site.about.pr.uni", "site.about.pr.uni_text"],
];
const VALUES: [string, MsgKey, MsgKey][] = [
  ["eye", "site.about.v1", "site.about.v1_text"],
  ["scale", "site.about.v2", "site.about.v2_text"],
  ["award", "site.about.v3", "site.about.v3_text"],
  ["users", "site.about.v4", "site.about.v4_text"],
];
const CONTACT_ICON: Record<string, string> = {
  email: "mail", phone: "phone", address: "pin", telegram: "send", instagram: "camera", linkedin: "link", facebook: "link", youtube: "play",
};

/** "About us": what the platform is for, the team and partners (managed in admin → Sayt) and how to reach us. */
export default function About({ me }: { me: Me | null }) {
  const site = useSiteContent();
  const [stats, setStats] = useState<PublicStats | null>(null);
  useEffect(() => { api.public.stats().then(setStats, () => {}); }, []);
  const tiles = statTiles(stats);
  // a first visit means signing up: the sign-in page opens on «Ro'yxatdan o'tish» (?yangi), not on «Kirish»
  const start = me ? panelBase(me) : "/kirish?yangi=1";
  const contacts = CONTACT_FIELDS.filter((f) => site?.contacts[f]);

  return (
    <>
      <section className="h-hero ab-hero">
        <div className="pub-wrap h-hero-grid">
          <div className="h-copy">
            <span className="h-badge"><i />{t("site.about.eyebrow")}</span>
            <h1 className="h-title ab-title">{t("site.about.title")}</h1>
            <p className="h-lead">{t("site.about.text", { brand: BRAND })}</p>
            <div className="h-actions">
              <a className="btn h-primary" href={start} onClick={go(start)}>{me ? t("pub.nav.my_panel") : t("site.hero.start")}<Icon name="arrow" size={18} /></a>
              {contacts.length > 0 && (
                <a className="h-play" href="#contact" onClick={(e) => { e.preventDefault(); document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" }); }}>
                  <span><Icon name="mail" size={16} /></span>{t("site.about.contact")}
                </a>
              )}
            </div>
          </div>
          <div className="ab-photo">
            <div className="h-ring" aria-hidden="true" />
            <div className="h-media-photo">{site && <img src={siteImage(site, "about")} alt="" width={650} height={650} />}</div>
          </div>
        </div>
      </section>

      <section className="pub-wrap pub-section">
        <div className="ab-mv">
          <article><span className="h-feat-ic"><Icon name="target" size={24} /></span><h2>{t("site.about.mission")}</h2><p>{t("site.about.mission_text")}</p></article>
          <article><span className="h-feat-ic"><Icon name="eye" size={24} /></span><h2>{t("site.about.vision")}</h2><p>{t("site.about.vision_text")}</p></article>
        </div>
      </section>

      <section className="soft-band">
        <div className="pub-wrap pub-section">
          <h2 className="pub-h2 middle">{t("site.about.problem_title")}</h2>
          <div className="ab-cards three">
            {PROBLEMS.map(([icon, title, text]) => (
              <article key={title} className="ab-card"><span className="step-ic"><Icon name={icon} size={22} /></span><b>{t(title)}</b><p>{t(text)}</p></article>
            ))}
          </div>
        </div>
      </section>

      {tiles.length > 0 && (
        <section className="pub-wrap pub-section">
          <h2 className="pub-h2 middle">{t("site.about.numbers")}</h2>
          <div className="ab-numbers">
            {tiles.map(([icon, n, label]) => (
              <div key={label}><span className="h-stat-ic"><Icon name={icon} size={22} /></span><b>{n.toLocaleString("en-US")}</b><small>{t(label)}</small></div>
            ))}
          </div>
        </section>
      )}

      <section className="pub-wrap pub-section">
        <h2 className="pub-h2 middle">{t("site.about.values_title")}</h2>
        <div className="ab-cards four">
          {VALUES.map(([icon, title, text]) => (
            <article key={title} className="ab-card plain"><span className="h-feat-ic small"><Icon name={icon} size={18} /></span><b>{t(title)}</b><p>{t(text)}</p></article>
          ))}
        </div>
      </section>

      {site && site.team.length > 0 && (
        <section className="pub-wrap pub-section">
          <h2 className="pub-h2 middle">{t("site.about.team")}</h2>
          <p className="ab-sub">{t("site.about.team_sub", { brand: BRAND })}</p>
          <div className="ab-team">{site.team.map((m) => <Person key={m.id} m={m} />)}</div>
        </section>
      )}

      {site && site.partners.length > 0 && (
        <section className="pub-wrap pub-section">
          <h2 className="pub-h2 middle">{t("site.about.partners")}</h2>
          <div className="ab-partners">{site.partners.map((p) => <PartnerLogo key={p.id} partner={p} />)}</div>
        </section>
      )}

      {contacts.length > 0 && site && (
        <section className="pub-wrap pub-section" id="contact">
          <div className="ab-contact">
            <div>
              <h2>{t("site.about.contact")}</h2>
              <p>{t("site.about.contact_sub")}</p>
            </div>
            <ul>
              {contacts.map((f) => {
                const value = site.contacts[f] ?? "";
                const href = contactHref(f, value);
                const body = <><span className="h-feat-ic small"><Icon name={CONTACT_ICON[f]} size={18} /></span><span><small>{t(`site.contact.${f}` as MsgKey)}</small><b>{value}</b></span></>;
                return (
                  <li key={f}>
                    {href ? <a href={href} target={/^https?:/.test(href) ? "_blank" : undefined} rel="noopener noreferrer">{body}</a> : <span>{body}</span>}
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      )}

      {!me && (
        <section className="pub-wrap pub-section">
          <div className="cta-band h-cta">
            <div>
              <h2>{t("pub.cta.title")}</h2>
              <p>{t("pub.cta.text")}</p>
            </div>
            <div className="btn-row"><a className="btn light" href="/kirish" onClick={go("/kirish")}>{t("pub.cta.start")}<Icon name="arrow" size={18} /></a></div>
          </div>
        </section>
      )}
    </>
  );
}

function Person({ m }: { m: TeamMember }) {
  const lang = getLang();
  const role = (lang === "ru" && m.role_ru) || (lang === "en" && m.role_en) || m.role;
  return (
    <article className="ab-person">
      <div className="ab-avatar">{m.photo_url ? <img src={m.photo_url} alt={m.full_name} loading="lazy" /> : <span>{initials(m.full_name)}</span>}</div>
      <b>{m.full_name}</b>
      <small>{role}</small>
      {m.link && <a className="ab-link" href={m.link} target="_blank" rel="noopener noreferrer" aria-label={m.full_name}><Icon name="link" size={16} /></a>}
    </article>
  );
}
