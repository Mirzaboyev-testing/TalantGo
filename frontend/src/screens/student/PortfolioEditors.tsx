// Add / edit sheets of the profile: a project or a certificate (portfolio items) and an experience entry
// (an employment outcome; a company on the platform is asked to confirm it).
import { useEffect, useRef, useState } from "react";
import { api, type MyOutcome, type OutcomeKind, type Portfolio, type PortfolioInput, type PortfolioItem,
         type PublicCompany, type SubmittedFile } from "../../api";
import { Field } from "../../form";
import { t, useLang } from "../../i18n";
import { Icon } from "../../icons";
import { haptic, ask } from "../../tg";
import { ErrorText, Sheet, message, toast } from "../../ui";
import Combo from "./Combo";

const MAX_FILES = 6;
export const OUTCOME_KINDS: OutcomeKind[] = ["internship", "part_time", "full_time", "dual_education"];

/** Comma or Enter adds a tag; a tag can be removed. */
export function TagInput({ id, value, onChange, max, placeholder, suggestions = [] }: {
  id?: string; value: string[]; onChange: (v: string[]) => void; max: number; placeholder?: string; suggestions?: string[];
}) {
  const [text, setText] = useState("");
  const add = (raw: string) => {
    const parts = raw.split(",").map((x) => x.trim().replace(/\s+/g, " ")).filter((x) => x.length >= 2 && x.length <= 40);
    const next = [...value];
    for (const p of parts) if (!next.some((x) => x.toLowerCase() === p.toLowerCase())) next.push(p);
    onChange(next.slice(0, max));
    setText("");
  };
  return (
    <div className="st-tags">
      <div className="st-tags-box" onClick={() => document.getElementById(id ?? "")?.focus()}>
        {value.map((x) => (
          <span key={x} className="st-tag">{x}
            <button type="button" aria-label={t("st.pf.remove")} onClick={() => onChange(value.filter((y) => y !== x))}><Icon name="close" size={13} /></button>
          </span>
        ))}
        {value.length < max && (
          <input id={id} value={text} placeholder={value.length ? "" : placeholder}
                 onChange={(e) => (e.target.value.endsWith(",") ? add(e.target.value) : setText(e.target.value))}
                 onKeyDown={(e) => {
                   if (e.key === "Enter") { e.preventDefault(); if (text.trim()) add(text); }
                   if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1));
                 }}
                 onBlur={() => { if (text.trim()) add(text); }} />
        )}
      </div>
      {suggestions.filter((s) => !value.includes(s)).length > 0 && value.length < max && (
        <div className="chips" style={{ marginTop: 6 }}>
          {suggestions.filter((s) => !value.includes(s)).slice(0, 6).map((s) => (
            <button key={s} type="button" className="chip" onClick={() => add(s)}>+ {s}</button>
          ))}
        </div>
      )}
    </div>
  );
}

const blank = (kind: "project" | "certificate"): PortfolioInput => ({
  kind, title: "", org: "", date_from: null, date_to: null, description: "", link: "", credential_id: "", skills: [],
  cover_id: null, file_ids: [],
});

export function ItemEditor({ kind, item, onSaved, onClose }: {
  kind: "project" | "certificate"; item?: PortfolioItem; onSaved: (p: Portfolio) => void; onClose: () => void;
}) {
  useLang();
  const [f, setF] = useState<PortfolioInput>(item ? {
    kind: item.kind, title: item.title, org: item.org, date_from: item.date_from, date_to: item.date_to,
    description: item.description, link: item.link, credential_id: item.credential_id, skills: item.skills,
    cover_id: item.cover_id, file_ids: item.files.map((x) => x.id),
  } : blank(kind));
  const [cover, setCover] = useState<string | null>(item?.cover_url ?? null);
  const [files, setFiles] = useState<{ id: number; name: string; mime: string; url: string }[]>(item?.files ?? []);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const coverInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const isProject = kind === "project";
  const set = <K extends keyof PortfolioInput>(k: K, v: PortfolioInput[K]) => setF((cur) => ({ ...cur, [k]: v }));

  async function upload(list: FileList | null, asCover: boolean) {
    if (!list?.length) return;
    setError("");
    try {
      for (const file of Array.from(list)) {
        if (asCover && !file.type.startsWith("image/")) { setError(t("st.pf.image_only")); continue; }
        if (!asCover && files.length >= MAX_FILES) { setError(t("st.pf.max_files", { n: MAX_FILES })); break; }
        setBusy(t("co.file.uploading"));
        const up: SubmittedFile = await api.upload(file);
        if (asCover) { set("cover_id", up.id); setCover(up.url); }
        else { setFiles((cur) => [...cur, { id: up.id, name: up.name, mime: up.mime, url: up.url }]); }
      }
    } catch (e) { setError(message(e)); }
    finally { setBusy(""); if (coverInput.current) coverInput.current.value = ""; if (fileInput.current) fileInput.current.value = ""; }
  }

  async function save() {
    if (f.title.trim().length < 2) { setError(isProject ? t("st.pf.title_err") : t("st.pf.cert_title_err")); return; }
    setBusy(t("s.common.saving")); setError("");
    try {
      const body = { ...f, file_ids: files.map((x) => x.id), date_from: f.date_from || null, date_to: f.date_to || null };
      const saved = item ? await api.editPortfolio(item.id, body) : await api.addPortfolio(body);
      haptic("success");
      toast(t("s.common.saved_ok"));
      onSaved(saved);
      onClose();
    } catch (e) { setError(message(e)); setBusy(""); }
  }

  async function remove() {
    if (!item || !(await ask(t("st.pf.delete_confirm")))) return;
    try { onSaved(await api.deletePortfolio(item.id)); onClose(); } catch (e) { setError(message(e)); }
  }

  return (
    <Sheet onClose={onClose}>
      <h2 style={{ marginTop: 0 }}>{item ? t(isProject ? "st.pf.edit_project" : "st.pf.edit_cert") : t(isProject ? "st.pf.add_project" : "st.pf.add_cert")}</h2>
      {isProject && (
        <div className={`st-cover-pick ${cover ? "has" : ""}`} style={cover ? { backgroundImage: `url(${cover})` } : undefined}
             role="button" onClick={() => coverInput.current?.click()}>
          <input ref={coverInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => upload(e.target.files, true)} />
          {!cover && <><Icon name="image" size={26} /><b>{t("st.pf.cover")}</b><span className="hint">{t("st.pf.cover_hint")}</span></>}
          {cover && <span className="st-cover-change"><Icon name="camera" size={16} />{t("st.pf.cover_change")}</span>}
        </div>
      )}
      <Field id="pi-title" label={isProject ? t("st.pf.title") : t("st.pf.cert_title")} required>
        <input id="pi-title" value={f.title} maxLength={160} placeholder={isProject ? t("st.pf.title_ph") : t("st.pf.cert_title_ph")}
               onChange={(e) => set("title", e.target.value)} />
      </Field>
      <Field id="pi-org" label={isProject ? t("st.pf.org") : t("st.pf.issuer")}>
        <input id="pi-org" value={f.org} maxLength={160} placeholder={isProject ? t("st.pf.org_ph") : t("st.pf.issuer_ph")}
               onChange={(e) => set("org", e.target.value)} />
      </Field>
      <div className="u-form-grid two st-two">
        <Field id="pi-from" label={isProject ? t("st.pf.from") : t("st.pf.issued")}>
          <input id="pi-from" type="date" value={f.date_from ?? ""} onChange={(e) => set("date_from", e.target.value || null)} />
        </Field>
        <Field id="pi-to" label={isProject ? t("st.pf.to") : t("st.pf.expires")}>
          <input id="pi-to" type="date" value={f.date_to ?? ""} onChange={(e) => set("date_to", e.target.value || null)} />
        </Field>
      </div>
      {!isProject && (
        <Field id="pi-cred" label={t("st.pf.credential")}>
          <input id="pi-cred" value={f.credential_id} maxLength={120} onChange={(e) => set("credential_id", e.target.value)} />
        </Field>
      )}
      <Field id="pi-link" label={isProject ? t("st.pf.link") : t("st.pf.verify_link")}>
        <input id="pi-link" value={f.link} inputMode="url" placeholder="github.com/…" onChange={(e) => set("link", e.target.value)} />
      </Field>
      {isProject && (
        <>
          <Field id="pi-desc" label={t("st.pf.desc")} hint={t("st.pf.desc_hint")}>
            <textarea id="pi-desc" value={f.description} maxLength={3000} rows={5} onChange={(e) => set("description", e.target.value)} />
          </Field>
          <Field id="pi-skills" label={t("st.pf.skills")}>
            <TagInput id="pi-skills" value={f.skills} max={12} placeholder={t("st.pf.skills_ph")} onChange={(v) => set("skills", v)} />
          </Field>
        </>
      )}
      <label>{isProject ? t("st.pf.files") : t("st.pf.cert_file")}</label>
      <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" multiple hidden onChange={(e) => upload(e.target.files, false)} />
      <div className="st-file-row">
        {files.map((x) => (
          <span key={x.id} className="file-chip">
            <span className="file-ext">{x.mime === "application/pdf" ? "PDF" : "IMG"}</span>
            <span className="file-name">{x.name}</span>
            <button className="file-remove" aria-label={t("st.pf.remove")} onClick={() => setFiles(files.filter((y) => y.id !== x.id))}><Icon name="close" size={16} /></button>
          </span>
        ))}
        {files.length < MAX_FILES && (
          <button type="button" className="btn small ghost" style={{ width: "auto" }} onClick={() => fileInput.current?.click()}>
            <Icon name="upload" size={16} />{t("st.pf.add_file")}
          </button>
        )}
      </div>
      <div className="hint">{t("st.pf.files_hint", { n: MAX_FILES })}</div>
      <ErrorText error={error} />
      <div className="row" style={{ gap: 8, marginTop: 14 }}>
        {item && <button className="btn bad" style={{ width: "auto" }} onClick={remove}><Icon name="trash" size={16} /></button>}
        <button className="btn ghost" onClick={onClose}>{t("common.cancel")}</button>
        <button className="btn" disabled={!!busy} onClick={save}>{busy || t("common.save")}</button>
      </div>
    </Sheet>
  );
}

const OTHER = "other";

export function ExperienceEditor({ item, onSaved, onClose }: { item?: MyOutcome; onSaved: () => void; onClose: () => void }) {
  useLang();
  const [companies, setCompanies] = useState<PublicCompany[]>([]);
  const [f, setF] = useState({
    company: item?.company_id ? String(item.company_id) : item ? OTHER : "", company_name: item && !item.company_id ? item.company : "",
    position: item?.position ?? "", kind: (item?.kind ?? "internship") as OutcomeKind, started_on: item?.started_on ?? "",
    ended_on: item?.ended_on ?? "", current: item ? !item.ended_on : true, description: item?.description ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { api.public.companies({ limit: "100" }).then((r) => setCompanies(r.items), () => {}); }, []);
  const locked = Boolean(item?.confirmed);

  async function save() {
    const name = f.company === OTHER ? f.company_name.trim() : "";
    if (!item && !(f.company && f.company !== OTHER) && name.length < 2) { setError(t("st.pf.company_err")); return; }
    setBusy(true); setError("");
    try {
      const ended = f.current ? null : f.ended_on || null;
      if (item) {
        await api.editOutcome(item.id, { description: f.description.trim(), ended_on: ended,
                                         ...(locked ? {} : { position: f.position.trim(), started_on: f.started_on || null }) });
      } else {
        await api.addOutcome({ company_id: f.company && f.company !== OTHER ? Number(f.company) : null, company_name: name,
                               position: f.position.trim(), kind: f.kind, started_on: f.started_on || null, ended_on: ended,
                               description: f.description.trim() });
      }
      haptic("success");
      toast(item ? t("s.common.saved_ok") : t("st.pf.exp_added"));
      onSaved();
      onClose();
    } catch (e) { setError(message(e)); setBusy(false); }
  }
  async function remove() {
    if (!item || !(await ask(t("st.pf.delete_confirm")))) return;
    try { await api.deleteOutcome(item.id); onSaved(); onClose(); } catch (e) { setError(message(e)); }
  }

  return (
    <Sheet onClose={onClose}>
      <h2 style={{ marginTop: 0 }}>{item ? t("st.pf.edit_exp") : t("st.pf.add_exp")}</h2>
      {locked && <div className="notice" style={{ marginBottom: 10 }}>{t("st.pf.exp_locked")}</div>}
      {!item ? (
        <Field id="ex-company" label={t("my.company_pick")} required hint={t("st.pf.company_hint")}>
          <Combo id="ex-company" items={companies.map((c) => ({ value: String(c.id), label: c.name, hint: c.city }))}
                 value={f.company === OTHER ? "" : f.company} customValue={f.company === OTHER ? f.company_name : ""}
                 icon="search" placeholder={t("st.pf.company_ph")} customLabel={(q) => t("st.pf.company_add", { name: q })}
                 onChange={(v, custom) => setF({ ...f, company: custom ? OTHER : v, company_name: custom ? v : "" })} />
        </Field>
      ) : (
        <div className="st-exp-company"><Icon name="building" size={18} /><b>{item.company}</b></div>
      )}
      <Field id="ex-position" label={t("my.position")}>
        <input id="ex-position" value={f.position} maxLength={160} disabled={locked} placeholder={t("st.pf.position_ph")}
               onChange={(e) => setF({ ...f, position: e.target.value })} />
      </Field>
      {!item && (
        <>
          <label>{t("my.kind")}</label>
          <div className="st-seg">
            {OUTCOME_KINDS.map((k) => (
              <button key={k} type="button" className={f.kind === k ? "on" : ""} onClick={() => setF({ ...f, kind: k })}>{t(`outcome.kind.${k}`)}</button>
            ))}
          </div>
        </>
      )}
      <div className="u-form-grid two st-two">
        <Field id="ex-start" label={t("my.started")}>
          <input id="ex-start" type="date" value={f.started_on ?? ""} disabled={locked} onChange={(e) => setF({ ...f, started_on: e.target.value })} />
        </Field>
        <Field id="ex-end" label={t("st.pf.ended")}>
          <input id="ex-end" type="date" value={f.ended_on ?? ""} disabled={f.current} onChange={(e) => setF({ ...f, ended_on: e.target.value })} />
        </Field>
      </div>
      <label className="u-check-line" style={{ marginTop: 6 }}>
        <input type="checkbox" checked={f.current} onChange={(e) => setF({ ...f, current: e.target.checked })} />
        <span>{t("st.pf.current")}</span>
      </label>
      <Field id="ex-desc" label={t("st.pf.exp_desc")} hint={t("st.pf.exp_desc_hint")}>
        <textarea id="ex-desc" value={f.description} maxLength={2000} rows={4} onChange={(e) => setF({ ...f, description: e.target.value })} />
      </Field>
      <ErrorText error={error} />
      <div className="row" style={{ gap: 8, marginTop: 14 }}>
        {item && item.source === "self" && <button className="btn bad" style={{ width: "auto" }} onClick={remove}><Icon name="trash" size={16} /></button>}
        <button className="btn ghost" onClick={onClose}>{t("common.cancel")}</button>
        <button className="btn" disabled={busy} onClick={save}>{busy ? t("s.common.saving") : t("common.save")}</button>
      </div>
    </Sheet>
  );
}
