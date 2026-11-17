import { t } from "../../i18n";
import type { PartnershipRow } from "../../api";

/** One partnership row as either side sees it: state, and the answer buttons for the side that was asked. */
export function PartnershipCard({ p, side, title, onDecide }: {
  p: PartnershipRow; side: "company" | "university"; title: string; onDecide: (accept: boolean) => void;
}) {
  const asked = p.status === "pending" && p.initiated_by !== side;
  const [label, badge] = p.status === "accepted" ? [t("partners.accepted"), "peer_verified"]
    : p.status === "rejected" ? [t("partners.rejected"), "rejected"]
    : asked ? [t("partners.pending_in"), "pending"] : [t("partners.pending_out"), "todo"];
  return (
    <div className="card">
      <div className="row between">
        <b>{title}</b>
        <span className={`badge ${badge}`}>{label}</span>
      </div>
      {p.message && <p style={{ whiteSpace: "pre-line", margin: "6px 0 0" }}>{p.message}</p>}
      {asked && (
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn small ghost" onClick={() => onDecide(false)}>{t("partners.reject")}</button>
          <button className="btn small ok" onClick={() => onDecide(true)}>{t("partners.accept")}</button>
        </div>
      )}
    </div>
  );
}
