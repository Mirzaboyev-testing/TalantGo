import type { Me } from "../api";
import { t, type MsgKey } from "../i18n";
import { Icon } from "../icons";
import { navigate } from "../router";

export type Panel = "talaba" | "korxona" | "universitet";

export const PANELS: { id: Panel; icon: string; title: MsgKey; text: MsgKey }[] = [
  { id: "talaba", icon: "school", title: "pub.panel.student.title", text: "pub.panel.student.text" },
  { id: "korxona", icon: "briefcase", title: "pub.panel.company.title", text: "pub.panel.company.text" },
  { id: "universitet", icon: "building", title: "pub.panel.university.title", text: "pub.panel.university.text" },
];

/** Where a signed-in person's own panel starts. */
export function panelBase(me: Me): string {
  if (me.account_type === "employer") return "/korxona";
  if (me.account_type === "university") return "/universitet";
  return "/talaba";
}

// The panel picked before signing in decides what a brand-new account sees first.
const INTENT = "tg_panel_intent";
export function rememberPanel(panel: Panel): void {
  try { sessionStorage.setItem(INTENT, panel); } catch { /* storage blocked */ }
}
export function chosenPanel(): Panel | null {
  try {
    const v = sessionStorage.getItem(INTENT);
    return v === "talaba" || v === "korxona" || v === "universitet" ? v : null;
  } catch { return null; }
}

export function PanelCards() {
  return (
    <div className="panel-cards">
      {PANELS.map((p) => (
        <div key={p.id} className="panel-card">
          <span className="panel-icon"><Icon name={p.icon} size={24} /></span>
          <b>{t(p.title)}</b>
          <p className="hint">{t(p.text)}</p>
          <button className="btn" onClick={() => navigate(`/kirish/${p.id}`)}>{t("pub.panel.enter")}</button>
        </div>
      ))}
    </div>
  );
}

export function PanelChooser() {
  return (
    <div className="pub-main">
      <h1 style={{ textAlign: "center" }}>{t("login.choose")}</h1>
      <PanelCards />
    </div>
  );
}
