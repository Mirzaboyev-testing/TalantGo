import { useCallback, useEffect, useState } from "react";
import { api, type AdminTrack, type Announcement } from "../../api";
import { ask } from "../../tg";
import { ErrorText, message } from "../../ui";

export default function Announcements() {
  const [text, setText] = useState("");
  const [trackId, setTrackId] = useState("");
  const [group, setGroup] = useState("");
  const [tracks, setTracks] = useState<AdminTrack[]>([]);
  const [history, setHistory] = useState<Announcement[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => api.admin.announcements().then(setHistory, (e) => setError(message(e))), []);
  useEffect(() => {
    void load();
    api.admin.tracks().then(setTracks, () => {});
  }, [load]);
  // refresh while a message is still going out
  useEffect(() => {
    if (!history.some((a) => !a.finished_at)) return;
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, [history, load]);

  async function send() {
    const who = [tracks.find((t) => String(t.id) === trackId)?.title ?? "hamma", group.trim() && `guruh ${group.trim()}`].filter(Boolean).join(", ");
    if (!(await ask(`Xabar yuborilsinmi? Kimga: ${who}`))) return;
    setBusy(true); setError("");
    try {
      await api.admin.announce({ text: text.trim(), track_id: trackId ? Number(trackId) : null, group_name: group.trim() || null });
      setText("");
      void load();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="card">
        <b>Bot orqali e'lon</b>
        <p className="hint">Xabar botdan har bir talabaga keladi, ostida «Ilovani ochish» tugmasi bo'ladi.</p>
        <textarea value={text} maxLength={3500} placeholder="Masalan: Bu hafta 2-topshiriq muddati juma kuni tugaydi!" onChange={(e) => setText(e.target.value)} />
        <div className="row" style={{ marginTop: 8 }}>
          <select className="grow" value={trackId} onChange={(e) => setTrackId(e.target.value)}>
            <option value="">Barcha yo'nalishlar</option>
            {tracks.map((t) => <option key={t.id} value={t.id}>{t.icon} {t.title}</option>)}
          </select>
          <input style={{ width: 120 }} value={group} maxLength={40} placeholder="Guruh" onChange={(e) => setGroup(e.target.value)} />
        </div>
        <ErrorText error={error} />
        <button className="btn" style={{ marginTop: 10 }} disabled={busy || text.trim().length < 3} onClick={send}>Yuborish</button>
      </div>
      <h2>Yuborilganlar</h2>
      {history.length === 0 && <div className="hint">Hali e'lon yo'q</div>}
      {history.map((a) => (
        <div key={a.id} className="card">
          <div className="hint">{new Date(a.created_at).toLocaleString()} · {a.audience} · {a.created_by}</div>
          <div style={{ whiteSpace: "pre-line", margin: "6px 0" }}>{a.text}</div>
          <div className="hint">
            {a.finished_at ? "Tugadi" : "Yuborilmoqda…"}: {a.sent} / {a.total} yetkazildi{a.failed ? `, ${a.failed} ta yetmadi (botni bloklagan yoki ochmagan)` : ""}
          </div>
        </div>
      ))}
    </div>
  );
}
