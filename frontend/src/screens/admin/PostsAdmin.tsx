// Admin → Postlar: the moderation queue of the posts feed (docs/12-talaba-postlar.md). Reported posts (a post is
// hidden by itself after a few reports), hidden ones and all; each shows the post, the reasons with counts and
// the reporters' notes, and "Yashirish" (with a note to the author) or "Tiklash".
import { useCallback, useEffect, useState } from "react";
import { api, type AdminPostRow } from "../../api";
import { formatDateTime, tMaybe } from "../../i18n";
import { ErrorText, message, toast } from "../../ui";
import { AuthorAvatar, KindChip, PostMedia, PostText, TimeAgo, Verified } from "../student/feedKit";

type Filter = "reported" | "hidden" | "all";
const FILTERS: [Filter, string][] = [["reported", "Shikoyat qilingan"], ["hidden", "Yashirilgan"], ["all", "Hammasi"]];
const STATUS: Record<string, [string, string]> = {
  visible: ["Ko'rinadi", "peer_verified"], hidden: ["Yashirilgan", "pending"], removed: ["Olib tashlangan", "rejected"],
};
const reasonLabel = (r: string) => tMaybe(`fd.reason.${r}`) ?? r;

export default function PostsAdmin({ canDecide }: { canDecide: boolean }) {
  const [filter, setFilter] = useState<Filter>("reported");
  const [rows, setRows] = useState<AdminPostRow[] | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    setRows(null); setError("");
    api.feed.adminList(filter).then((r) => setRows(r ?? []), (e) => setError(message(e)));
  }, [filter]);
  useEffect(() => { load(); }, [load]);

  async function act(row: AdminPostRow, hide: boolean) {
    setBusy(row.post.id); setError("");
    try {
      if (hide) await api.feed.adminHide(row.post.id, (notes[row.post.id] ?? "").trim());
      else await api.feed.adminRestore(row.post.id);
      toast(hide ? "Post yashirildi" : "Post tiklandi");
      load();
    } catch (e) { setError(message(e)); }
    finally { setBusy(null); }
  }

  return (
    <div className="narrow fd-admin">
      <div className="segmented">
        {FILTERS.map(([id, label]) => <button key={id} className={filter === id ? "on" : ""} onClick={() => setFilter(id)}>{label}</button>)}
      </div>
      <ErrorText error={error} />
      {!rows && !error && <div className="hint">Yuklanmoqda…</div>}
      {rows?.length === 0 && <div className="card hint">{filter === "reported" ? "Ochiq shikoyat yo'q" : "Post yo'q"}</div>}
      {rows?.map((row) => {
        const p = row.post;
        const counts = row.reports.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.reason]: (acc[r.reason] ?? 0) + 1 }), {});
        const [statusLabel, statusClass] = STATUS[p.status] ?? [p.status, "todo"];
        return (
          <div key={p.id} className="card fd-admin-card">
            <div className="fd-head">
              <AuthorAvatar author={p.author} className="fd-avatar" />
              <div className="fd-who">
                <div className="fd-name"><b>{p.author.name}</b>{p.author.verified && <Verified />}</div>
                {p.author.subtitle && <div className="fd-sub">{p.author.subtitle}</div>}
                <div className="fd-meta">
                  <TimeAgo iso={p.created_at} />
                  {p.visibility === "university" && <span>· faqat universitet</span>}
                  <span>· #{p.id}</span>
                </div>
              </div>
              <span className={`badge ${statusClass}`}>{statusLabel}</span>
            </div>
            <div className="fd-kind-row"><KindChip kind={p.kind} /></div>
            {p.text && <PostText text={p.text} lines={8} />}
            <PostMedia media={p.media} />
            <div className="hint fd-admin-stats">
              Yoqdi {p.reactions.like} · Tabrik {p.reactions.congrats} · Izoh {p.comments_n}
            </div>

            {row.reports.length > 0 && (
              <div className="fd-admin-reports">
                <div className="row wrap" style={{ gap: 6 }}>
                  <b style={{ fontSize: 14 }}>Shikoyatlar{row.reports_open > 0 ? ` (ochiq: ${row.reports_open})` : ""}</b>
                  {Object.entries(counts).map(([reason, n]) => <span key={reason} className="badge pending">{reasonLabel(reason)} × {n}</span>)}
                </div>
                {row.reports.map((r, i) => (
                  <div key={i} className="fd-admin-report">
                    <div className="hint">{r.reporter_name || "—"} · {formatDateTime(r.created_at)} · {reasonLabel(r.reason)}</div>
                    {r.note && <div className="fd-admin-note">«{r.note}»</div>}
                  </div>
                ))}
              </div>
            )}

            {canDecide && (
              <div className="fd-admin-actions">
                {p.status === "visible" || (p.status === "hidden" && row.reports_open > 0) ? (
                  <>
                    <input value={notes[p.id] ?? ""} maxLength={500} placeholder="Muallifga izoh (ixtiyoriy): nega yashirildi"
                           onChange={(e) => setNotes({ ...notes, [p.id]: e.target.value })} />
                    <div className="row wrap" style={{ marginTop: 8 }}>
                      <button className="btn small bad" disabled={busy === p.id} onClick={() => act(row, true)}>Yashirish</button>
                      {p.status === "hidden" && <button className="btn small ghost" disabled={busy === p.id} onClick={() => act(row, false)}>Tiklash</button>}
                    </div>
                  </>
                ) : (
                  <button className="btn small" disabled={busy === p.id} onClick={() => act(row, false)}>Tiklash</button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
