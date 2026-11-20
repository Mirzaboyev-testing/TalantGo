// A small «Musobaqalar» card on the student's home page: how many competitions are open and the next deadline
// of a stage the student is in. Hidden when there is nothing to show (or the competitions API is not there).
import { useEffect, useState } from "react";
import { competitionsApi, type Competition, type StageOut } from "../../../competitionsApi";
import { t, useLang } from "../../../i18n";
import { Icon } from "../../../icons";
import { navigate } from "../../../router";
import { COMP_PATH, compLink, isSoon, openStage, timeLeft } from "./kit";
import "./competitions.css";

export default function CompetitionsHomeCard() {
  useLang();
  const [open, setOpen] = useState<Competition[] | null>(null);
  const [mine, setMine] = useState<Competition[]>([]);
  useEffect(() => {
    competitionsApi.list("open").then(setOpen, () => setOpen([]));
    competitionsApi.list("mine").then(setMine, () => {});
  }, []);
  if (!open) return null;

  const next = mine
    .flatMap((c): { c: Competition; s: StageOut }[] => {
      const s = openStage(c);
      return c.my_entry?.status === "registered" && s && timeLeft(s.ends_at) ? [{ c, s }] : [];
    })
    .sort((a, b) => a.s.ends_at.localeCompare(b.s.ends_at))[0];
  const fresh = open.filter((c) => !c.my_entry).length;
  if (fresh === 0 && !next) return null;
  const go = (path: string) => (e: React.MouseEvent) => { e.preventDefault(); navigate(path); };

  return (
    <div className="co-card cm-home">
      <div className="co-card-head">
        <b className="cm-home-title"><Icon name="trophy" size={17} />{t("cm.home.title")}</b>
        <a href={COMP_PATH} onClick={go(COMP_PATH)}>{t("home.see_all")}</a>
      </div>
      {fresh > 0 && (
        <button type="button" className="cm-home-row" onClick={go(COMP_PATH)}>
          <b>{fresh}</b><span>{t("cm.home.open_n", { n: fresh })}</span><Icon name="arrow" size={16} />
        </button>
      )}
      {next && (
        <button type="button" className={`cm-home-next ${isSoon(next.s.ends_at) ? "soon" : ""}`} onClick={go(compLink(next.c.id))}>
          <Icon name="clock" size={17} />
          <span className="grow" style={{ minWidth: 0 }}>
            <b className="ellipsis">{next.c.title}</b>
            <small>{t("cm.home.next", { stage: next.s.title, left: timeLeft(next.s.ends_at) ?? "" })}</small>
          </span>
        </button>
      )}
    </div>
  );
}
