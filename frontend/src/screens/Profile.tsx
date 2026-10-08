import { useState } from "react";
import { api, type Me } from "../api";
import { haptic, openLink } from "../tg";
import { Avatar, ErrorText, message } from "../ui";
import CareerProfile from "./CareerProfile";
import PhoneField from "./PhoneField";
import InviteCard from "./InviteCard";

export default function ProfileScreen({ me, onSaved, onChangeTrack }: { me: Me; onSaved: (m: Me) => void; onChangeTrack: () => void }) {
  const [form, setForm] = useState({
    group_name: me.group_name, bio: me.bio, headline: me.headline,
    github_url: me.github_url, linkedin_url: me.linkedin_url, goals: me.goals.join(", "),
  });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setSaved(false);
    setForm({ ...form, [k]: e.target.value });
  };

  const cvUrl = `${window.location.origin}/cv/${me.cv_slug}`;

  async function save(extra: Partial<Me> = {}) {
    setBusy(true);
    setError("");
    try {
      const { goals: _unused, ...rest } = form;
      void _unused;
      onSaved(await api.updateMe({ ...rest, ...extra }));
      haptic("success");
      setSaved(true);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="row" style={{ margin: "8px 0 14px" }}>
        <Avatar name={me.full_name} url={me.photo_url} />
        <div className="grow">
          <h1 style={{ margin: 0 }}>{me.full_name}</h1>
          {me.headline && <div style={{ fontWeight: 600 }}>{me.headline}</div>}
          <div className="hint">{me.track?.title}{me.role !== "student" ? " · mentor" : ""}</div>
        </div>
      </div>

      <div className="card">
        <div className="row between">
          <b>Mening CV'im</b>
          <span className={`badge ${me.cv_public ? "peer_verified" : "todo"}`}>{me.cv_public ? "Ochiq" : "Yopiq"}</span>
        </div>
        <p className="hint">CV'ga faqat tasdiqlangan ishlar tushadi. Ochiq qilsangiz, havolani ish beruvchiga yuborishingiz mumkin.</p>
        <div className="stack">
          <button className="btn" disabled={busy} onClick={() => save({ cv_public: !me.cv_public })}>
            {me.cv_public ? "CV'ni yopish" : "CV'ni ochiq qilish"}
          </button>
          {me.cv_public && (
            <div className="row">
              <button className="btn ghost" onClick={() => openLink(cvUrl)}>Ko'rish</button>
              <button className="btn ghost" onClick={() => openLink(`https://t.me/share/url?url=${encodeURIComponent(cvUrl)}&text=${encodeURIComponent("Mening tasdiqlangan portfoliom")}`)}>Ulashish</button>
            </div>
          )}
        </div>
      </div>

      <InviteCard me={me} />

      <div className="card">
        <b>Telefon</b>
        <div style={{ marginTop: 8 }}><PhoneField me={me} onChanged={onSaved} /></div>
      </div>

      <CareerProfile me={me} onSaved={onSaved} />

      <div className="card">
        <b>Qo'shimcha ma'lumotlar</b>
        <label>Guruh</label>
        <input value={form.group_name} maxLength={40} onChange={set("group_name")} />
        <label>Sarlavha</label>
        <input value={form.headline} maxLength={120} placeholder="Iqtisodiyot talabasi | Data Analytics" onChange={set("headline")} />
        <label>O'zim haqimda</label>
        <textarea value={form.bio} maxLength={600} placeholder="2-3 gap: nimani o'rganyapsiz, qanday ishga qiziqasiz" onChange={set("bio")} />
        <label>GitHub</label>
        <input value={form.github_url} placeholder="https://github.com/…" inputMode="url" onChange={set("github_url")} />
        <label>LinkedIn</label>
        <input value={form.linkedin_url} placeholder="https://linkedin.com/in/…" inputMode="url" onChange={set("linkedin_url")} />
        <ErrorText error={error} />
        <div className="stack" style={{ marginTop: 12 }}>
          <button className="btn" disabled={busy} onClick={() => save()}>{saved ? "Saqlandi" : "Saqlash"}</button>
          <button className="btn ghost" onClick={onChangeTrack}>Yo'nalishni o'zgartirish</button>
        </div>
      </div>
    </div>
  );
}
