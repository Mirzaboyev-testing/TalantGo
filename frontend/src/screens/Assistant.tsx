import { useEffect, useRef, useState } from "react";
import { api, type AiMessage } from "../api";
import { t, useLang, type MsgKey } from "../i18n";
import { Icon } from "../icons";
import { autoGrow, message, sendsOnEnter } from "../ui";

export type AiAudience = "student" | "employer" | "signup";

const STARTERS: Record<AiAudience, MsgKey[]> = {
  student: ["s.ai.student1", "s.ai.student2", "s.ai.student3", "s.ai.student4"],
  employer: ["s.ai.employer1", "s.ai.employer2", "s.ai.employer3", "s.ai.employer4", "s.ai.employer5"],
  signup: ["s.ai.signup1", "s.ai.signup2", "s.ai.signup3", "s.ai.signup4"],
};
const INTRO: Record<AiAudience, MsgKey> = {
  student: "s.ai.intro.student",
  employer: "s.ai.intro.employer",
  signup: "s.ai.intro.signup",
};

/** A small "TalantGo AI" button in the corner; the chat opens over the app and keeps its history until reload. */
export default function Assistant({ audience = "student" }: { audience?: AiAudience }) {
  useLang();
  const [available, setAvailable] = useState(false);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  const [loaded, setLoaded] = useState(false);
  useEffect(() => { api.assistantStatus().then((s) => setAvailable(s.available), () => {}); }, []);
  // while the person types anywhere in the app, the corner button steps aside so it never covers the field
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const update = () => {
      const el = document.activeElement;
      setTyping(!!el && ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) && !el.closest(".ai-panel"));
    };
    const later = () => setTimeout(update, 0);        // focus has not moved yet during focusout
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", later);
    return () => { document.removeEventListener("focusin", update); document.removeEventListener("focusout", later); };
  }, []);
  // the conversation is kept on the server: load it the first time the chat is opened
  useEffect(() => {
    if (open && !loaded) api.assistantMessages().then((m) => { setMessages(m); setLoaded(true); }, (e) => setError(message(e)));
  }, [open, loaded]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [messages, busy, open]);

  async function send(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    const pending: AiMessage = { id: -Date.now(), role: "user", text: q, created_at: new Date().toISOString() };
    setMessages((cur) => [...cur, pending]);
    setText("");
    if (box.current) box.current.style.height = "";
    setBusy(true);
    setError("");
    try {
      const { question: saved, answer } = await api.assistantChat(q);
      setMessages((cur) => [...cur.filter((m) => m.id !== pending.id), saved, answer]);
    } catch (e) {
      setMessages((cur) => cur.filter((m) => m.id !== pending.id));
      setText(q);                           // nothing is lost when the answer fails
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  if (!available) return null;
  if (!open) {
    if (typing) return null;
    return (
      <button className="ai-fab" onClick={() => setOpen(true)} aria-label={t("s.ai.open")}>
        <Icon name="spark" size={18} />TalantGo AI
      </button>
    );
  }

  return (
    <div className="ai-panel" role="dialog" aria-label="TalantGo AI">
      <div className="ai-head">
        <span className="ai-mark"><Icon name="spark" size={18} /></span>
        <div className="grow">
          <b>TalantGo AI</b>
          <div className="hint">{t("s.ai.privacy")}</div>
        </div>
        <button className="icon-btn" aria-label={t("common.close")} onClick={() => setOpen(false)}><Icon name="close" size={20} /></button>
      </div>
      <div className="ai-body">
        {loaded && messages.length === 0 && (
          <div className="ai-intro">
            <p>{t(INTRO[audience])}</p>
            <div className="ai-starters">
              {STARTERS[audience].map((k) => <button key={k} className="chip" onClick={() => send(t(k))}>{t(k)}</button>)}
            </div>
          </div>
        )}
        {messages.map((m) => <div key={m.id} className={`ai-msg ${m.role === "user" ? "me" : "bot"}`}>{m.role === "model" ? <Rich text={m.text} /> : m.text}</div>)}
        {busy && <div className="ai-msg bot typing"><span /><span /><span /></div>}
        {error && <div className="error" style={{ alignSelf: "stretch" }}>{error}</div>}
        <div ref={end} />
      </div>
      <form className="ai-input" onSubmit={(e) => { e.preventDefault(); void send(text); }}>
        <textarea ref={box} value={text} rows={1} maxLength={2000} placeholder={t("s.ai.ph")} enterKeyHint="enter"
                  onChange={(e) => { setText(e.target.value); autoGrow(e.target); }}
                  onKeyDown={(e) => { if (sendsOnEnter(e)) { e.preventDefault(); void send(text); } }} />
        <button className="icon-btn send" type="submit" disabled={busy || !text.trim()} aria-label={t("s.common.send")}><Icon name="send" size={20} /></button>
      </form>
    </div>
  );
}

/** The model sometimes marks words with **bold** despite being asked for plain text: show it as bold, never as stars. */
function Rich({ text }: { text: string }) {
  const clean = text.replace(/^#{1,6}\s*/gm, "").replace(/^\s*\*\s+/gm, "- ");
  return <>{clean.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <b key={i}>{part}</b> : part))}</>;
}
