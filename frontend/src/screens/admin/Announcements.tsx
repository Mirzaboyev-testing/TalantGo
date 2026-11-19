import { useCallback, useEffect, useState } from "react";
import { api, type AdminTrack, type Announcement, type AnnouncementAudience, type University } from "../../api";
import { ask } from "../../tg";
import { ErrorText, message } from "../../ui";

const AUDIENCE: Record<AnnouncementAudience, string> = {
  students: "Talabalar", companies: "Korxonalar (tasdiqlangan)", universities: "Universitet xodimlari (tasdiqlangan)", all: "Hamma",
};

/** An announcement goes to everyone's bell in the audience, and from the bot to those who have Telegram. */
export default function Announcements() {
  const [text, setText] = useState("");
  const [audience, setAudience] = useState<AnnouncementAudience>("students");
  const [trackId, setTrackId] = useState("");
  const [uniId, setUniId] = useState("");
  const [group, setGroup] = useState("");
  const [tracks, setTracks] = useState<AdminTrack[]>([]);
  const [unis, setUnis] = useState<University[]>([]);
  const [history, setHistory] = useState<Announcement[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => api.admin.announcements().then(setHistory, (e) => setError(message(e))), []);
  useEffect(() => {
    void load();
    api.admin.tracks().then(setTracks, () => {});
    api.universities().then(setUnis, () => {});
  }, [load]);
  // refresh while a message is still going out
  useEffect(() => {
    if (!history.some((a) => !a.finished_at)) return;
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, [history, load]);

  const students = audience === "students";
  async function send() {
    const who = [AUDIENCE[audience],
                 students && tracks.find((t) => String(t.id) === trackId)?.title,
                 students && unis.find((u) => String(u.id) === uniId)?.short_name,
                 students && group.trim() && `guruh ${group.trim()}`].filter(Boolean).join(", ");
    if (!(await ask(`E'lon yuborilsinmi? Kimga: ${who}`))) return;
    setBusy(true); setError("");
    try {
      await api.admin.announce({
        text: text.trim(), audience,
        track_id: students && trackId ? Number(trackId) : null,
        university_id: students && uniId ? Number(uniId) : null,
        group_name: students ? group.trim() || null : null,
      });
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
        <b>E'lon yuborish</b>
        <p className="hint">E'lon tanlangan auditoriyadagi har bir kishining bildirishnomalariga tushadi. Telegram ulanganlarga
          botdan ham keladi: talabalarda «Ilovani ochish», korxona va universitetlarda «Saytda ochish» tugmasi bilan.</p>
        <textarea value={text} maxLength={3500} placeholder="Masalan: Shu juma Careerup'da karyera kuni bo'ladi!" onChange={(e) => setText(e.target.value)} />
        <div className="row" style={{ marginTop: 8, flexWrap: "wrap", gap: 8 }}>
          <select value={audience} onChange={(e) => setAudience(e.target.value as AnnouncementAudience)}>
            {(Object.keys(AUDIENCE) as AnnouncementAudience[]).map((k) => <option key={k} value={k}>{AUDIENCE[k]}</option>)}
          </select>
          {students && (
            <>
              <select className="grow" value={trackId} onChange={(e) => setTrackId(e.target.value)}>
                <option value="">Barcha yo'nalishlar</option>
                {tracks.map((t) => <option key={t.id} value={t.id}>{t.icon} {t.title}</option>)}
              </select>
              <select className="grow" value={uniId} onChange={(e) => setUniId(e.target.value)}>
                <option value="">Barcha universitetlar</option>
                {unis.map((u) => <option key={u.id} value={u.id}>{u.short_name || u.name}</option>)}
              </select>
              <input style={{ width: 120 }} value={group} maxLength={40} placeholder="Guruh" onChange={(e) => setGroup(e.target.value)} />
            </>
          )}
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
            {a.in_app ? `Bildirishnomalarda: ${a.in_app} kishi. ` : ""}
            {a.total ? <>Bot: {a.finished_at ? "tugadi" : "yuborilmoqda…"}, {a.sent} / {a.total} yetkazildi{a.failed ? `, ${a.failed} ta yetmadi (botni bloklagan yoki ochmagan)` : ""}</>
              : "Botga yuborilmadi (Telegram ulanganlar yo'q yoki bot sozlanmagan)."}
          </div>
        </div>
      ))}
    </div>
  );
}
