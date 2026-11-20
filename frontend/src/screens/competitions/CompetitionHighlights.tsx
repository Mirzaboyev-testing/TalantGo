// The site's home page block «Musobaqa g'oliblari» and «Top jamoalar» (GET /public/competitions/highlights).
// Loads itself; draws nothing while the admin has it switched off or there is nothing to show yet.
import { useEffect, useState } from "react";
import { competitionsApi, type Highlights } from "../../competitionsApi";
import { t, useLang } from "../../i18n";
import { Icon } from "../../icons";
import { nameTone } from "../../ui";
import "./competitions-org.css";

const letters = (name: string) =>
  name.split(/\s+/).map((w) => w.match(/\p{L}|\p{N}/u)?.[0] ?? "").filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";

export default function CompetitionHighlights() {
  useLang();
  const [data, setData] = useState<Highlights | null>(null);
  useEffect(() => {
    let live = true;
    competitionsApi.highlights().then((h) => { if (live) setData(h); }, () => {});
    return () => { live = false; };
  }, []);

  if (!data || !data.show) return null;
  const winners = data.winners ?? [];
  const teams = (data.teams ?? []).slice(0, 5);
  if (winners.length === 0 && teams.length === 0) return null;

  return (
    <section className="pub-wrap pub-section chl" aria-labelledby="chl-title">
      <div className="chl-head">
        <span className="eyebrow">{t("chl.eyebrow")}</span>
        <h2 id="chl-title" className="pub-h2">{t("chl.title")}</h2>
        <p>{t("chl.sub")}</p>
      </div>
      <div className={`chl-grid ${winners.length && teams.length ? "two" : ""}`}>
        {winners.length > 0 && (
          <div className="chl-card">
            <div className="chl-card-head">
              <span className="chl-card-ic"><Icon name="trophy" size={20} /></span>
              <b>{t("chl.winners")}</b>
            </div>
            <ul className="chl-list">
              {winners.slice(0, 6).map((w, i) => (
                <li key={`${w.competition_id}-${w.place}-${i}`} className="chl-row">
                  <span className={`chl-medal m${w.place}`} aria-label={t("chl.place", { n: w.place })}>{w.place}</span>
                  <div className="chl-body">
                    <b className="chl-name">
                      {w.name}
                      {w.kind === "team" && <span className="chl-chip"><Icon name="users" size={12} />{t("chl.team")}</span>}
                    </b>
                    <small>{w.title}</small>
                    <small className="chl-org">{w.organizer}</small>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
        {teams.length > 0 && (
          <div className="chl-card">
            <div className="chl-card-head">
              <span className="chl-card-ic"><Icon name="users" size={20} /></span>
              <b>{t("chl.teams")}</b>
            </div>
            <ol className="chl-list">
              {teams.map((tm) => (
                <li key={tm.team_id} className="chl-row">
                  <span className={`chl-rank ${tm.rank <= 3 ? `r${tm.rank}` : ""}`}>{tm.rank}</span>
                  <span className="chl-team-mark" style={nameTone(tm.name)} aria-hidden="true">{letters(tm.name)}</span>
                  <div className="chl-body">
                    <b className="chl-name">{tm.name}</b>
                    <small>
                      {t("chl.members", { n: tm.members_n })}
                      {tm.universities.length > 0 && ` · ${tm.universities.slice(0, 2).join(", ")}${tm.universities.length > 2 ? ` +${tm.universities.length - 2}` : ""}`}
                    </small>
                  </div>
                  <div className="chl-points">
                    <b>{tm.points.toLocaleString("en-US")}</b>
                    <small>{tm.wins > 0 ? t("chl.wins", { n: tm.wins }) : t("chl.points")}</small>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </section>
  );
}
