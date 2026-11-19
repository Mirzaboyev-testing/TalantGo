// Writing or editing a post (posts feed, docs/12-talaba-postlar.md): the author's avatar, a text box that grows,
// the post kind, up to four images (uploaded as soon as they are picked, shown as thumbnails), who may see it,
// and a one-line rule. A new post is handed to the feed, which shows it at once and swaps in the saved one.
import { useEffect, useRef, useState } from "react";
import { api, type Me, type Post, type PostInput, type PostKind, type PostVisibility } from "../../api";
import { t, useLang, type MsgKey } from "../../i18n";
import { Icon } from "../../icons";
import { haptic } from "../../tg";
import { Avatar, ErrorText, autoGrow, message, toast } from "../../ui";
import { KIND_ICON, MAX_IMAGES, MAX_TEXT, identityOf, kindLabel, kindsFor } from "./feedKit";

type Img = { key: string; url: string; id: number | null; local: boolean };
export type ComposerPreset = { kind?: PostKind; text?: string; n: number };

// a student starts from a familiar first line instead of a blank box (2026-11-19: posting made quicker)
const STARTERS: PostKind[] = ["experience", "project", "achievement", "question"];
const draftKey = (userId: number) => `cf_post_draft_${userId}`;
function readDraft(userId: number): { text: string; kind: PostKind } | null {
  try { const raw = localStorage.getItem(draftKey(userId)); return raw ? JSON.parse(raw) : null; } catch { return null; }
}

export default function PostComposer({ me, editing, preset, onCreate, onSaved, onCancel, autoFocus, plain }: {
  me: Me;
  autoFocus?: boolean;                     // opened from the phone button or a "share" link: write straight away
  plain?: boolean;                         // already inside a card (the home page): no card of its own
  editing?: Post;
  preset?: ComposerPreset | null;          // a tip or the empty state asks to start a post (with a kind)
  onCreate?: (input: PostInput, media: { id: number; url: string }[]) => Promise<void>;
  onSaved?: (post: Post) => void;
  onCancel?: () => void;
}) {
  useLang();
  const who = identityOf(me);
  const kinds = kindsFor(me);
  // "only my university" needs a university: students with one and university staff; a company posts to all
  const canLimit = me.account_type === "student" ? Boolean(me.university_ref)
    : me.account_type === "university" ? Boolean(me.staff_university ?? me.university_ref) : false;

  // an unsent post survives a reload or a closed tab (text and kind; images are re-picked)
  const [draft] = useState(() => (editing ? null : readDraft(me.id)));
  const [text, setText] = useState(editing?.text ?? draft?.text ?? "");
  const [kind, setKind] = useState<PostKind>(editing?.kind ?? (draft && kinds.includes(draft.kind) ? draft.kind : kinds[0]));
  const [vis, setVis] = useState<PostVisibility>(editing?.visibility ?? "all");
  const [imgs, setImgs] = useState<Img[]>(() => (editing?.media ?? []).map((m) => ({ key: `m${m.id}`, url: m.url, id: m.id, local: false })));
  const [active, setActive] = useState(Boolean(editing) || Boolean(autoFocus) || Boolean(draft?.text));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const area = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const card = useRef<HTMLDivElement>(null);

  useEffect(() => { if (editing && area.current) autoGrow(area.current); }, [editing]);
  useEffect(() => { if (autoFocus) area.current?.focus(); }, [autoFocus]);
  useEffect(() => {
    if (editing) return;
    try {
      if (text.trim()) localStorage.setItem(draftKey(me.id), JSON.stringify({ text, kind }));
      else localStorage.removeItem(draftKey(me.id));
    } catch { /* storage blocked: the draft simply is not kept */ }
  }, [text, kind, editing, me.id]);

  function start(k: PostKind) {
    setKind(k);
    setActive(true);
    const opening = t(`fd.start.${k}_t` as MsgKey);
    setText((cur) => (cur.trim() ? cur : opening));
    requestAnimationFrame(() => {
      const el = area.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
      autoGrow(el);
    });
  }
  useEffect(() => {
    if (!preset) return;
    setActive(true);
    if (preset.kind && kinds.includes(preset.kind)) setKind(preset.kind);
    if (preset.text) setText((cur) => (cur.trim() ? cur : preset.text!));
    card.current?.scrollIntoView({ block: "center" });
    area.current?.focus({ preventScroll: true });
  }, [preset?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  async function pick(list: FileList | null) {
    if (!list?.length) return;
    setError("");
    const files = Array.from(list);
    const room = MAX_IMAGES - imgs.length;
    if (files.length > room) setError(t("fd.compose.max_images", { n: MAX_IMAGES }));
    const chosen = files.slice(0, Math.max(0, room));
    if (chosen.some((f) => !f.type.startsWith("image/"))) setError(t("fd.compose.only_images"));
    const added = chosen.filter((f) => f.type.startsWith("image/"))
      .map((file) => ({ file, img: { key: `${Date.now()}-${Math.random()}`, url: URL.createObjectURL(file), id: null, local: true } as Img }));
    if (fileInput.current) fileInput.current.value = "";
    if (!added.length) return;
    setImgs((cur) => [...cur, ...added.map((a) => a.img)]);
    await Promise.all(added.map(async ({ file, img }) => {
      try {
        const up = await api.upload(file);
        setImgs((cur) => cur.map((x) => (x.key === img.key ? { ...x, id: up.id } : x)));
      } catch (e) {
        setImgs((cur) => cur.filter((x) => x.key !== img.key));
        URL.revokeObjectURL(img.url);
        setError(message(e));
      }
    }));
  }

  function removeImg(img: Img) {
    setImgs((cur) => cur.filter((x) => x.key !== img.key));
    if (img.local) URL.revokeObjectURL(img.url);
  }

  const body = text.trim();
  const uploading = imgs.some((i) => i.id == null);
  const over = text.length > MAX_TEXT;
  const ready = (body.length > 0 || imgs.length > 0) && !uploading && !over;

  async function submit() {
    if (busy) return;
    if (uploading) { setError(t("fd.compose.wait_upload")); return; }
    if (over) { setError(t("fd.compose.too_long", { n: MAX_TEXT })); return; }
    if (!ready) return;
    setError("");
    const input: PostInput = { kind, text: body, media_ids: imgs.map((i) => i.id!), visibility: canLimit ? vis : "all" };
    if (editing) {
      setBusy(true);
      try {
        const saved = await api.feed.edit(editing.id, input);
        toast(t("fd.edit.saved"));
        onSaved?.(saved);
      } catch (e) { setError(message(e)); }
      finally { setBusy(false); }
      return;
    }
    // the feed shows the post at once; the box empties and comes back filled if the server says no
    const before = { text, kind, vis, imgs };
    setText(""); setImgs([]); setActive(false);
    if (area.current) area.current.style.height = "";
    setBusy(true);
    try {
      await onCreate?.(input, imgs.map((i) => ({ id: i.id!, url: i.url })));
      try { localStorage.removeItem(draftKey(me.id)); } catch { /* storage blocked */ }
      haptic("success");
      toast(t("fd.compose.posted"));
    } catch (e) {
      setText(before.text); setKind(before.kind); setVis(before.vis); setImgs(before.imgs); setActive(true);
      setError(message(e));
      haptic("error");
    } finally { setBusy(false); }
  }

  const placeholder = who.org ? t("fd.compose.ph_org") : t("fd.compose.ph_student");
  const showStarters = !editing && !who.org && !text.trim();
  return (
    <div ref={card} className={`fd-composer ${editing ? "editing" : plain ? "plain" : "co-card"} ${active ? "active" : ""}`}>
      <div className="fd-compose-top">
        <Avatar name={who.name} url={who.photo} className={who.org ? "square" : ""} />
        <div className="fd-compose-field">
          {who.org && <div className="fd-as">{t("fd.compose.as", { name: who.name })}</div>}
          <textarea ref={area} rows={active ? 3 : 1} value={text} placeholder={placeholder} aria-label={placeholder}
                    maxLength={MAX_TEXT + 200} onFocus={() => setActive(true)}
                    onChange={(e) => { setText(e.target.value); autoGrow(e.target); }} />
        </div>
      </div>

      {showStarters && (
        <div className="fd-starters" role="group" aria-label={t("fd.start.title")}>
          {STARTERS.map((k) => (
            <button key={k} type="button" className={`fd-starter k-${k}`} onClick={() => start(k)}>
              <Icon name={KIND_ICON[k]} size={14} />{t(`fd.start.${k}` as MsgKey)}
            </button>
          ))}
        </div>
      )}

      {active && (
        <>
          <div className="fd-kinds" role="radiogroup" aria-label={t("fd.compose.kind")}>
            {kinds.map((k) => (
              <button key={k} type="button" role="radio" aria-checked={kind === k} className={`fd-kind-chip k-${k} ${kind === k ? "on" : ""}`}
                      onClick={() => setKind(k)}>
                <Icon name={KIND_ICON[k]} size={15} />{kindLabel(k)}
              </button>
            ))}
          </div>
          {imgs.length > 0 && (
            <div className="fd-thumbs">
              {imgs.map((img) => (
                <div key={img.key} className={`fd-thumb ${img.id == null ? "loading" : ""}`}>
                  <img src={img.url} alt="" />
                  {img.id == null && <span className="fd-thumb-progress" role="status" aria-label={t("fd.compose.uploading")}><span /></span>}
                  <button type="button" className="fd-thumb-x" aria-label={t("fd.compose.remove_image")} title={t("fd.compose.remove_image")}
                          onClick={() => removeImg(img)}><Icon name="close" size={14} /></button>
                </div>
              ))}
            </div>
          )}
          <p className="fd-rule"><Icon name="lock" size={14} />{t("fd.compose.rule")}</p>
        </>
      )}

      <div className="fd-compose-bar">
        <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(e) => pick(e.target.files)} />
        <button type="button" className="fd-tool" disabled={imgs.length >= MAX_IMAGES}
                title={t("fd.compose.add_image_hint", { n: imgs.length, max: MAX_IMAGES })}
                aria-label={t("fd.compose.add_image_hint", { n: imgs.length, max: MAX_IMAGES })}
                onClick={() => { setActive(true); fileInput.current?.click(); }}>
          <Icon name="image" size={18} /><span>{t("fd.compose.add_image")}</span>
          {imgs.length > 0 && <span className="fd-tool-n">{imgs.length}/{MAX_IMAGES}</span>}
        </button>
        {canLimit && (
          <label className="fd-vis-select">
            <Icon name={vis === "all" ? "globe" : "lock"} size={16} />
            <select value={vis} aria-label={t("fd.compose.vis_label")} onChange={(e) => setVis(e.target.value as PostVisibility)}>
              <option value="all">{t("fd.compose.vis.all")}</option>
              <option value="university">{t("fd.compose.vis.university")}</option>
            </select>
          </label>
        )}
        <span className="fd-bar-gap" />
        {text.length > MAX_TEXT - 200 && <span className={`fd-left ${over ? "bad" : ""}`}>{MAX_TEXT - text.length}</span>}
        {editing && onCancel && <button type="button" className="btn small ghost" onClick={onCancel}>{t("common.cancel")}</button>}
        <button type="button" className="btn small fd-post" disabled={!ready || busy} onClick={submit}>
          {busy ? t("fd.compose.posting") : editing ? t("fd.compose.save") : t("fd.compose.post")}
        </button>
      </div>
      <ErrorText error={error} />
    </div>
  );
}
