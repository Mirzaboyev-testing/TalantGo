import { useState } from "react";
import { api, type Me } from "../api";
import { haptic, openLink } from "../tg";
import { Avatar, ErrorText, focusField, isFullName, message, toast } from "../ui";
import CareerProfile from "./CareerProfile";
import PhoneField from "./PhoneField";
import InviteCard from "./InviteCard";

export default function ProfileScreen({ me, onSaved, onChangeTrack }: { me: Me; onSaved: (m: Me) => void; onChangeTrack: () => void }) {
  const [form, setForm] = useState({
    full_name: me.full_name, group_name: me.group_name, bio: me.bio, headline: me.headline,
    github_url: me.github_url, linkedin_url: me.linkedin_url, goals: me.goals.join(", "),
  });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [tried, setTried] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setSaved(false);
    setForm({ ...form, [k]: e.target.value });
  };

  const cvUrl = `${window.location.origin}/cv/${me.cv_slug}`;

  // the name and the field are required; everything else here is optional
  const nameOk = isFullName(form.full_name);
  const headlineOk = form.headline.trim().length >= 5;

  async function save(extra: Partial<Me> = {}) {
    const isCvToggle = "cv_public" in extra;
    if (!isCvToggle && (!nameOk || !headlineOk)) {
      setTried(true);
      toast(!nameOk ? "Ism va familiyani to'liq yozing" : "Sohangizni yozing", "error");
      focusField(!nameOk ? "pf-name" : "pf-headline");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { goals: _unused, ...rest } = form;
      void _unused;
      onSaved(await api.updateMe(isCvToggle ? extra : { ...rest, full_name: rest.full_name.trim(), ...extra }));
      haptic("success");
      setSaved(true);
      toast("cv_public" in extra ? (extra.cv_public ? "CV ochiq qilindi" : "CV yopildi") : "Ma'lumotlar saqlandi");
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
        <b>Asosiy ma'lumotlar</b>
        <p className="hint" style={{ marginTop: 4 }}>* belgili maydonlar majburiy.</p>
        <label htmlFor="pf-name">Ism va familiya *</label>
        <input id="pf-name" className={tried && !nameOk ? "invalid" : ""} value={form.full_name} maxLength={128}
               autoComplete="name" placeholder="Masalan: Nodira Ergasheva" onChange={set("full_name")} />
        {tried && !nameOk && <div className="field-error">Ism va familiyani to'liq yozing</div>}
        <label htmlFor="pf-headline">Soha yoki sarlavha *</label>
        <input id="pf-headline" className={tried && !headlineOk ? "invalid" : ""} value={form.headline} maxLength={120}
               placeholder="Iqtisodiyot talabasi | Data Analytics" onChange={set("headline")} />
        {tried && !headlineOk && <div className="field-error">Sohangizni yozing, masalan: Data analitik</div>}
        <label>Guruh (ixtiyoriy)</label>
        <input value={form.group_name} maxLength={40} onChange={set("group_name")} />
        <label>O'zim haqimda (ixtiyoriy)</label>
        <textarea value={form.bio} maxLength={600} placeholder="2-3 gap: nimani o'rganyapsiz, qanday ishga qiziqasiz" onChange={set("bio")} />
        <label>GitHub (ixtiyoriy)</label>
        <input value={form.github_url} placeholder="github.com/ismingiz" inputMode="url" onChange={set("github_url")} />
        <label>LinkedIn (ixtiyoriy)</label>
        <input value={form.linkedin_url} placeholder="linkedin.com/in/ismingiz" inputMode="url" onChange={set("linkedin_url")} />
        <ErrorText error={error} />
        <div className="stack" style={{ marginTop: 12 }}>
          <button className="btn" disabled={busy} onClick={() => save()}>{saved ? "Saqlandi" : "Saqlash"}</button>
          <button className="btn ghost" onClick={onChangeTrack}>Yo'nalishni o'zgartirish</button>
        </div>
      </div>
    </div>
  );
}
