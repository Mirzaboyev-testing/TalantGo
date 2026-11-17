import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  api, CONTACT_FIELDS, type AdminSiteContent, type AdminSitePartner, type AdminTeamMember, type PartnerInput, type SiteChoice,
  type SiteContacts, type SiteImageSlot, type TeamInput,
} from "../../api";
import { Icon } from "../../icons";
import { DEFAULT_IMAGES, initials } from "../../public/siteContent";
import { ErrorText, message, toast } from "../../ui";

// The public website's own content: the moving strip of partners on the home page, the team on "About us",
// the page photos and the contact details. Changes show on the site at once.

type Tab = "partners" | "team" | "images" | "contacts";
const TABS: [Tab, string][] = [["partners", "Hamkorlar"], ["team", "Jamoa"], ["images", "Rasmlar"], ["contacts", "Aloqa"]];
const KIND_LABEL = { company: "Korxona", university: "Universitet" } as const;
const SLOTS: [SiteImageSlot, string, string][] = [
  ["hero", "Bosh sahifa: asosiy rasm", "Tik rasm (3:4 yoki 515×705 nisbatda), odamlar markazda"],
  ["students", "Bosh sahifa: talabalar bo'limi", "Kvadrat rasm, kamida 800×800"],
  ["about", "\"Biz haqimizda\" sahifasi", "Kvadrat rasm, kamida 800×800"],
];
const CONTACT_LABEL: Record<(typeof CONTACT_FIELDS)[number], [string, string]> = {
  email: ["Email", "info@careerup.uz"], phone: ["Telefon", "+998 90 123 45 67"], address: ["Manzil", "Toshkent, ..."],
  telegram: ["Telegram", "@careerup yoki https://t.me/..."], instagram: ["Instagram", "@careerup"], linkedin: ["LinkedIn", "https://www.linkedin.com/company/..."],
  facebook: ["Facebook", "https://facebook.com/..."], youtube: ["YouTube", "https://youtube.com/@..."],
};
const ACCEPT = "image/png,image/jpeg,image/webp";

export default function SiteContent() {
  const [data, setData] = useState<AdminSiteContent | null>(null);
  const [tab, setTab] = useState<Tab>("partners");
  const [error, setError] = useState("");
  const load = useCallback(() => api.admin.site.get().then((d) => { setData(d); setError(""); }, (e) => setError(message(e))), []);
  useEffect(() => { void load(); }, [load]);

  return (
    <div>
      <div className="card row between" style={{ gap: 12, flexWrap: "wrap" }}>
        <div className="grow" style={{ minWidth: 220 }}>
          <b>Sayt kontenti</b>
          <div className="hint">Bosh sahifadagi hamkorlar lentasi, "Biz haqimizda" sahifasidagi jamoa, rasmlar va aloqa. O'zgarishlar saytda darhol ko'rinadi.</div>
        </div>
        <a className="btn small ghost" href="/" target="_blank" rel="noopener noreferrer"><Icon name="eye" size={16} />Saytni ochish</a>
      </div>
      <div className="segmented">
        {TABS.map(([id, label]) => <button key={id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>{label}</button>)}
      </div>
      <ErrorText error={error} />
      {!data && !error && <div className="hint">Yuklanmoqda…</div>}
      {data && tab === "partners" && <Partners rows={data.partners} reload={load} />}
      {data && tab === "team" && <Team rows={data.team} reload={load} />}
      {data && tab === "images" && <Images data={data} onSaved={setData} />}
      {data && tab === "contacts" && <Contacts data={data} onSaved={setData} />}
    </div>
  );
}

// ------------------------------------------------------------------ shared bits

function Thumb({ url, name, short, round }: { url: string | null; name: string; short?: string; round?: boolean }) {
  return (
    <span className={`site-thumb ${round ? "round" : "wide"}`}>
      {url ? <img src={url} alt="" /> : <b>{initials(name, short)}</b>}
    </span>
  );
}

/** A file picker that uploads the image at once and hands back its id and address. */
function ImagePick({ label, onUploaded, small }: { label: string; onUploaded: (m: { id: number; url: string }) => void; small?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError("");
    try { onUploaded(await api.admin.site.upload(file)); } catch (e) { setError(message(e)); } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  return (
    <>
      <input ref={input} type="file" accept={ACCEPT} hidden onChange={(e) => void pick(e.target.files?.[0])} />
      <button type="button" className={`btn ghost ${small ? "small" : ""}`} style={{ width: "auto" }} disabled={busy} onClick={() => input.current?.click()}>
        <Icon name="upload" size={16} />{busy ? "Yuklanmoqda…" : label}
      </button>
      {error && <span className="error" style={{ fontSize: 13 }}>{error}</span>}
    </>
  );
}

function RowActions({ first, last, visible, onMove, onToggle, onEdit, onDelete }: {
  first: boolean; last: boolean; visible: boolean; onMove: (d: -1 | 1) => void; onToggle: () => void; onEdit: () => void; onDelete: () => void;
}) {
  return (
    <div className="row" style={{ gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
      <button className="icon-btn" title="Yuqoriga" aria-label="Yuqoriga" disabled={first} onClick={() => onMove(-1)}><Icon name="arrow" size={16} className="rot-up" /></button>
      <button className="icon-btn" title="Pastga" aria-label="Pastga" disabled={last} onClick={() => onMove(1)}><Icon name="arrow" size={16} className="rot-down" /></button>
      <button className="btn small ghost" onClick={onToggle}>{visible ? "Yashirish" : "Ko'rsatish"}</button>
      <button className="btn small ghost" onClick={onEdit}><Icon name="edit" size={15} />Tahrirlash</button>
      <button className="btn small ghost site-del" onClick={onDelete}><Icon name="trash" size={15} /></button>
    </div>
  );
}

function moved<T extends { id: number }>(rows: T[], index: number, d: -1 | 1): number[] {
  const ids = rows.map((r) => r.id);
  [ids[index], ids[index + d]] = [ids[index + d], ids[index]];
  return ids;
}

// ------------------------------------------------------------------ partners

function Partners({ rows, reload }: { rows: AdminSitePartner[]; reload: () => void }) {
  const [editing, setEditing] = useState<AdminSitePartner | "new" | null>(null);
  const [error, setError] = useState("");
  const run = async (fn: () => Promise<unknown>, done = "Saqlandi") => {
    try { await fn(); toast(done); reload(); } catch (e) { setError(message(e)); }
  };
  const input = (p: AdminSitePartner, changes: Partial<PartnerInput> = {}): PartnerInput => ({
    kind: p.kind, name: p.name, website: p.website, company_id: p.company_id, university_id: p.university_id,
    logo_media_id: p.logo_media_id, is_visible: p.is_visible, ...changes,
  });

  return (
    <>
      <div className="card">
        <div className="row between" style={{ gap: 12, flexWrap: "wrap" }}>
          <div className="grow" style={{ minWidth: 220 }}>
            <b>"Bizga ishonishadi" lentasi</b>
            <div className="hint">Bosh sahifada harakatlanib turadi. Platformadagi korxona yoki universitetni tanlang (logosi o'zi olinadi) yoki istalgan tashkilotni logosi bilan qo'shing. Logo bo'lmasa, nomning bosh harflari ko'rinadi.</div>
          </div>
          {editing !== "new" && <button className="btn small" onClick={() => setEditing("new")}><Icon name="plus" size={16} />Hamkor qo'shish</button>}
        </div>
      </div>
      {editing === "new" && <PartnerEditor onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
      <ErrorText error={error} />
      {rows.length === 0 && editing !== "new" && <div className="card hint">Hali hamkor qo'shilmagan. Lenta qo'shilgandan keyin bosh sahifada paydo bo'ladi.</div>}
      {rows.map((p, i) => editing !== "new" && editing?.id === p.id
        ? <PartnerEditor key={p.id} initial={p} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />
        : (
          <div key={p.id} className="card site-row" style={p.is_visible ? undefined : { opacity: 0.55 }}>
            <Thumb url={p.logo_url} name={p.name} short={p.short} />
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}><b>{p.name}</b><span className="badge">{KIND_LABEL[p.kind]}</span>{!p.is_visible && <span className="badge pending">Yashirilgan</span>}</div>
              <div className="hint" style={{ fontSize: 13 }}>
                {p.logo_media_id ? "Yuklangan logo" : p.linked_name ? `Platformadan: ${p.linked_name}` : "Logo yo'q: bosh harflar ko'rinadi"}
                {p.website && <> · <a href={p.website} target="_blank" rel="noopener noreferrer">{p.website.replace(/^https?:\/\//, "")}</a></>}
              </div>
            </div>
            <RowActions first={i === 0} last={i === rows.length - 1} visible={p.is_visible}
                        onMove={(d) => run(() => api.admin.site.orderPartners(moved(rows, i, d)), "Tartib saqlandi")}
                        onToggle={() => run(() => api.admin.site.editPartner(p.id, input(p, { is_visible: !p.is_visible })))}
                        onEdit={() => setEditing(p)}
                        onDelete={() => { if (window.confirm(`"${p.name}" lentadan o'chirilsinmi?`)) void run(() => api.admin.site.deletePartner(p.id), "O'chirildi"); }} />
          </div>
        ))}
    </>
  );
}

function PartnerEditor({ initial, onSaved, onCancel }: { initial?: AdminSitePartner; onSaved: () => void; onCancel: () => void }) {
  const [f, setF] = useState<PartnerInput>(() => initial
    ? { kind: initial.kind, name: initial.name, website: initial.website, company_id: initial.company_id, university_id: initial.university_id,
        logo_media_id: initial.logo_media_id, is_visible: initial.is_visible }
    : { kind: "company", name: "", website: null, company_id: null, university_id: null, logo_media_id: null, is_visible: true });
  const [source, setSource] = useState<"platform" | "upload">(initial && !(initial.company_id || initial.university_id) ? "upload" : "platform");
  const [linked, setLinked] = useState<SiteChoice | null>(initial && (initial.company_id || initial.university_id)
    ? { id: (initial.company_id ?? initial.university_id)!, name: initial.linked_name ?? initial.name, short: initial.short, logo_url: initial.logo_media_id ? null : initial.logo_url }
    : null);
  const [logoUrl, setLogoUrl] = useState<string | null>(initial?.logo_media_id ? initial.logo_url : null);
  const [q, setQ] = useState("");
  const [choices, setChoices] = useState<SiteChoice[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (changes: Partial<PartnerInput>) => setF((cur) => ({ ...cur, ...changes }));

  useEffect(() => {
    if (source !== "platform") return;
    const timer = setTimeout(() => api.admin.site.choices(f.kind, q).then(setChoices, (e) => setError(message(e))), 250);
    return () => clearTimeout(timer);
  }, [source, f.kind, q]);

  function pickKind(kind: PartnerInput["kind"]) {
    if (kind === f.kind) return;
    set({ kind, company_id: null, university_id: null });
    setLinked(null);
    setChoices(null);
  }
  function choose(c: SiteChoice) {
    setLinked(c);
    set(f.kind === "company" ? { company_id: c.id, university_id: null, name: f.name || c.name } : { university_id: c.id, company_id: null, name: f.name || c.short || c.name });
  }
  function useUpload() {
    setSource("upload");
    setLinked(null);
    set({ company_id: null, university_id: null });
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      const body = { ...f, name: f.name.trim(), website: f.website?.trim() || null };
      if (initial) await api.admin.site.editPartner(initial.id, body); else await api.admin.site.addPartner(body);
      toast("Saqlandi");
      onSaved();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  const preview = logoUrl ?? linked?.logo_url ?? null;
  const ready = f.name.trim().length > 0 && (source === "upload" || linked !== null);
  return (
    <div className="card site-editor">
      <b>{initial ? "Hamkorni tahrirlash" : "Yangi hamkor"}</b>
      <div className="segmented" style={{ marginTop: 10 }}>
        {(["company", "university"] as const).map((k) => <button key={k} className={f.kind === k ? "on" : ""} onClick={() => pickKind(k)}>{KIND_LABEL[k]}</button>)}
      </div>
      <div className="chips" style={{ marginBottom: 12 }}>
        <button className={`chip ${source === "platform" ? "on" : ""}`} onClick={() => setSource("platform")}>Platformadan tanlash</button>
        <button className={`chip ${source === "upload" ? "on" : ""}`} onClick={useUpload}>Logo yuklab qo'shish</button>
      </div>

      {source === "platform" && (
        <>
          {linked ? (
            <div className="site-row picked">
              <Thumb url={linked.logo_url} name={linked.name} short={linked.short} />
              <div className="grow"><b>{linked.name}</b><div className="hint" style={{ fontSize: 13 }}>{linked.logo_url ? "Platformadagi logosi ishlatiladi" : "Platformada logosi yo'q: bosh harflar yoki o'zingiz yuklagan logo"}</div></div>
              <button className="btn small ghost" onClick={() => { setLinked(null); set({ company_id: null, university_id: null }); }}>Boshqasini tanlash</button>
            </div>
          ) : (
            <>
              <label>{f.kind === "company" ? "Tasdiqlangan korxonalardan qidiring" : "Universitetlardan qidiring"}</label>
              <input value={q} maxLength={80} placeholder="Nomi bo'yicha qidirish" onChange={(e) => setQ(e.target.value)} />
              <div className="site-choices">
                {choices?.length === 0 && <div className="hint">Topilmadi. "Logo yuklab qo'shish"ni tanlang.</div>}
                {choices?.map((c) => (
                  <button key={c.id} className="site-choice" onClick={() => choose(c)}>
                    <Thumb url={c.logo_url} name={c.name} short={c.short} /><span className="grow">{c.name}{c.short && <small className="hint"> · {c.short}</small>}</span>
                    {!c.logo_url && <small className="hint">logosiz</small>}
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <div className="row" style={{ gap: 12, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
        <Thumb url={preview} name={f.name || "?"} short={linked?.short} />
        <ImagePick small label={logoUrl ? "Boshqa logo" : source === "upload" ? "Logo yuklash" : "O'z logongizni yuklash (ixtiyoriy)"}
                   onUploaded={(m) => { set({ logo_media_id: m.id }); setLogoUrl(m.url); }} />
        {logoUrl && <button className="btn small ghost" onClick={() => { set({ logo_media_id: null }); setLogoUrl(null); }}>Logoni olib tashlash</button>}
      </div>
      <div className="hint" style={{ fontSize: 12.5, marginTop: 4 }}>PNG, JPG yoki WEBP. Shaffof fonli, eniga cho'zilgan logo eng chiroyli ko'rinadi.</div>

      <label>Saytda ko'rinadigan nomi</label>
      <input value={f.name} maxLength={160} onChange={(e) => set({ name: e.target.value })} />
      <label>Veb-sayti (ixtiyoriy)</label>
      <input value={f.website ?? ""} maxLength={300} placeholder="https://..." onChange={(e) => set({ website: e.target.value })} />
      <label className="row" style={{ gap: 8, marginTop: 12, cursor: "pointer" }}>
        <input type="checkbox" checked={f.is_visible} style={{ width: "auto" }} onChange={(e) => set({ is_visible: e.target.checked })} />Saytda ko'rsatish
      </label>
      <ErrorText error={error} />
      <div className="row" style={{ gap: 8, marginTop: 12 }}>
        <button className="btn small" disabled={!ready || busy} onClick={save}>{busy ? "Saqlanmoqda…" : "Saqlash"}</button>
        <button className="btn small ghost" onClick={onCancel}>Bekor qilish</button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ team

function Team({ rows, reload }: { rows: AdminTeamMember[]; reload: () => void }) {
  const [editing, setEditing] = useState<AdminTeamMember | "new" | null>(null);
  const [error, setError] = useState("");
  const run = async (fn: () => Promise<unknown>, done = "Saqlandi") => {
    try { await fn(); toast(done); reload(); } catch (e) { setError(message(e)); }
  };
  const input = (m: AdminTeamMember, changes: Partial<TeamInput> = {}): TeamInput => ({
    full_name: m.full_name, role: m.role, role_ru: m.role_ru, role_en: m.role_en, link: m.link, photo_media_id: m.photo_media_id, is_visible: m.is_visible, ...changes,
  });
  return (
    <>
      <div className="card">
        <div className="row between" style={{ gap: 12, flexWrap: "wrap" }}>
          <div className="grow" style={{ minWidth: 220 }}>
            <b>Jamoa a'zolari</b>
            <div className="hint">"Biz haqimizda" sahifasida ko'rinadi. Lavozimni uch tilda yozing: rus yoki ingliz tilida bo'sh qolsa, o'zbekchasi ko'rsatiladi.</div>
          </div>
          {editing !== "new" && <button className="btn small" onClick={() => setEditing("new")}><Icon name="plus" size={16} />A'zo qo'shish</button>}
        </div>
      </div>
      {editing === "new" && <TeamEditor onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
      <ErrorText error={error} />
      {rows.length === 0 && editing !== "new" && <div className="card hint">Hali jamoa a'zosi qo'shilmagan. Bo'lim faqat a'zo qo'shilgandan keyin saytda ko'rinadi.</div>}
      {rows.map((m, i) => editing !== "new" && editing?.id === m.id
        ? <TeamEditor key={m.id} initial={m} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />
        : (
          <div key={m.id} className="card site-row" style={m.is_visible ? undefined : { opacity: 0.55 }}>
            <Thumb url={m.photo_url} name={m.full_name} round />
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}><b>{m.full_name}</b>{!m.is_visible && <span className="badge pending">Yashirilgan</span>}</div>
              <div className="hint" style={{ fontSize: 13 }}>{[m.role, m.role_ru, m.role_en].filter(Boolean).join(" · ")}</div>
            </div>
            <RowActions first={i === 0} last={i === rows.length - 1} visible={m.is_visible}
                        onMove={(d) => run(() => api.admin.site.orderTeam(moved(rows, i, d)), "Tartib saqlandi")}
                        onToggle={() => run(() => api.admin.site.editMember(m.id, input(m, { is_visible: !m.is_visible })))}
                        onEdit={() => setEditing(m)}
                        onDelete={() => { if (window.confirm(`${m.full_name} jamoadan o'chirilsinmi?`)) void run(() => api.admin.site.deleteMember(m.id), "O'chirildi"); }} />
          </div>
        ))}
    </>
  );
}

function TeamEditor({ initial, onSaved, onCancel }: { initial?: AdminTeamMember; onSaved: () => void; onCancel: () => void }) {
  const [f, setF] = useState<TeamInput>(() => initial
    ? { full_name: initial.full_name, role: initial.role, role_ru: initial.role_ru, role_en: initial.role_en, link: initial.link,
        photo_media_id: initial.photo_media_id, is_visible: initial.is_visible }
    : { full_name: "", role: "", role_ru: "", role_en: "", link: null, photo_media_id: null, is_visible: true });
  const [photo, setPhoto] = useState<string | null>(initial?.photo_url ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (changes: Partial<TeamInput>) => setF((cur) => ({ ...cur, ...changes }));

  async function save() {
    setBusy(true);
    setError("");
    try {
      const body = { ...f, full_name: f.full_name.trim(), role: f.role.trim(), link: f.link?.trim() || null };
      if (initial) await api.admin.site.editMember(initial.id, body); else await api.admin.site.addMember(body);
      toast("Saqlandi");
      onSaved();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card site-editor">
      <b>{initial ? "A'zoni tahrirlash" : "Yangi jamoa a'zosi"}</b>
      <div className="row" style={{ gap: 12, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
        <Thumb url={photo} name={f.full_name || "?"} round />
        <ImagePick small label={photo ? "Boshqa surat" : "Surat yuklash"} onUploaded={(m) => { set({ photo_media_id: m.id }); setPhoto(m.url); }} />
        {photo && <button className="btn small ghost" onClick={() => { set({ photo_media_id: null }); setPhoto(null); }}>Suratni olib tashlash</button>}
      </div>
      <div className="hint" style={{ fontSize: 12.5, marginTop: 4 }}>Kvadrat surat, yuz markazda (kamida 400×400).</div>
      <label>Ism familiya</label>
      <input value={f.full_name} maxLength={120} onChange={(e) => set({ full_name: e.target.value })} />
      <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
        <Field label="Lavozimi (o'zbekcha)"><input value={f.role} maxLength={120} placeholder="Asoschi" onChange={(e) => set({ role: e.target.value })} /></Field>
        <Field label="Ruscha"><input value={f.role_ru} maxLength={120} placeholder="Основатель" onChange={(e) => set({ role_ru: e.target.value })} /></Field>
        <Field label="Inglizcha"><input value={f.role_en} maxLength={120} placeholder="Founder" onChange={(e) => set({ role_en: e.target.value })} /></Field>
      </div>
      <label>LinkedIn yoki boshqa havola (ixtiyoriy)</label>
      <input value={f.link ?? ""} maxLength={300} placeholder="https://..." onChange={(e) => set({ link: e.target.value })} />
      <label className="row" style={{ gap: 8, marginTop: 12, cursor: "pointer" }}>
        <input type="checkbox" checked={f.is_visible} style={{ width: "auto" }} onChange={(e) => set({ is_visible: e.target.checked })} />Saytda ko'rsatish
      </label>
      <ErrorText error={error} />
      <div className="row" style={{ gap: 8, marginTop: 12 }}>
        <button className="btn small" disabled={!f.full_name.trim() || !f.role.trim() || busy} onClick={save}>{busy ? "Saqlanmoqda…" : "Saqlash"}</button>
        <button className="btn small ghost" onClick={onCancel}>Bekor qilish</button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="grow" style={{ minWidth: 180 }}><label>{label}</label>{children}</div>;
}

// ------------------------------------------------------------------ page photos

function Images({ data, onSaved }: { data: AdminSiteContent; onSaved: (d: AdminSiteContent) => void }) {
  const [error, setError] = useState("");
  async function save(slot: SiteImageSlot, mediaId: number | null) {
    try { onSaved(await api.admin.site.saveSettings({ [slot]: mediaId }, data.contacts)); toast("Rasm saqlandi"); } catch (e) { setError(message(e)); }
  }
  return (
    <>
      <div className="card hint">Rasm yuklanmagan joyda saytga o'rnatilgan asl rasm ko'rinadi. Yangi rasm yuklasangiz, u darhol saytda almashadi.</div>
      <ErrorText error={error} />
      <div className="site-images">
        {SLOTS.map(([slot, title, hint]) => {
          const current = data.images[slot];
          return (
            <div key={slot} className="card">
              <b>{title}</b>
              <div className="hint" style={{ fontSize: 13 }}>{hint}</div>
              <div className={`site-photo ${slot}`}><img src={current.url ?? DEFAULT_IMAGES[slot]} alt="" /></div>
              <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                {!current.media_id && <span className="badge">Asl rasm</span>}
                <ImagePick small label="Rasm yuklash" onUploaded={(m) => void save(slot, m.id)} />
                {current.media_id && <button className="btn small ghost" onClick={() => void save(slot, null)}>Asl rasmga qaytarish</button>}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ------------------------------------------------------------------ contacts

function Contacts({ data, onSaved }: { data: AdminSiteContent; onSaved: (d: AdminSiteContent) => void }) {
  const [f, setF] = useState<SiteContacts>(data.contacts);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    setBusy(true);
    setError("");
    try {
      const contacts = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, (v ?? "").trim()]).filter(([, v]) => v)) as SiteContacts;
      onSaved(await api.admin.site.saveSettings({}, contacts));
      toast("Saqlandi");
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="card">
      <b>Aloqa ma'lumotlari</b>
      <div className="hint">"Biz haqimizda" sahifasining oxirida ko'rinadi, email va telefon pastki qismda ham chiqadi. Bo'sh qolgan maydon saytda ko'rinmaydi.</div>
      <div className="site-contacts">
        {CONTACT_FIELDS.map((k) => (
          <div key={k}>
            <label>{CONTACT_LABEL[k][0]}</label>
            <input value={f[k] ?? ""} maxLength={200} placeholder={CONTACT_LABEL[k][1]} onChange={(e) => setF((cur) => ({ ...cur, [k]: e.target.value }))} />
          </div>
        ))}
      </div>
      <ErrorText error={error} />
      <button className="btn small" style={{ marginTop: 12 }} disabled={busy} onClick={save}>{busy ? "Saqlanmoqda…" : "Saqlash"}</button>
    </div>
  );
}
