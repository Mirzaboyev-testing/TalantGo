import { useEffect, useRef, useState } from "react";
import { api, type AiMessage } from "../api";
import { Icon } from "../icons";
import { autoGrow, message, sendsOnEnter } from "../ui";

const STARTERS = [
  "Bu ilova qanday ishlaydi?",
  "Keyingi qadamim nima?",
  "Topshiriqni qanday topshiraman?",
  "Ball va reyting qanday hisoblanadi?",
];

/** A small "CareerFlow.ai" button in the corner; the chat opens over the app and keeps its history until reload. */
export default function Assistant() {
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
      <button className="ai-fab" onClick={() => setOpen(true)} aria-label="CareerFlow.ai yordamchisini ochish">
        <Icon name="spark" size={18} />CareerFlow.ai
      </button>
    );
  }

  return (
    <div className="ai-panel" role="dialog" aria-label="CareerFlow.ai">
      <div className="ai-head">
        <span className="ai-mark"><Icon name="spark" size={18} /></span>
        <div className="grow">
          <b>CareerFlow.ai</b>
          <div className="hint">Suhbatingizni faqat siz va platforma admini ko'radi</div>
        </div>
        <button className="icon-btn" aria-label="Yopish" onClick={() => setOpen(false)}><Icon name="close" size={20} /></button>
      </div>
      <div className="ai-body">
        {loaded && messages.length === 0 && (
          <div className="ai-intro">
            <p>Salom! Men CareerFlow.ai. Ilovadan qanday foydalanish, keyingi qadamingiz, topshiriqlar, Excel, SQL, Power BI va CV haqida so'rashingiz mumkin.</p>
            <div className="ai-starters">
              {STARTERS.map((s) => <button key={s} className="chip" onClick={() => send(s)}>{s}</button>)}
            </div>
          </div>
        )}
        {messages.map((m) => <div key={m.id} className={`ai-msg ${m.role === "user" ? "me" : "bot"}`}>{m.role === "model" ? <Rich text={m.text} /> : m.text}</div>)}
        {busy && <div className="ai-msg bot typing"><span /><span /><span /></div>}
        {error && <div className="error" style={{ alignSelf: "stretch" }}>{error}</div>}
        <div ref={end} />
      </div>
      <form className="ai-input" onSubmit={(e) => { e.preventDefault(); void send(text); }}>
        <textarea ref={box} value={text} rows={1} maxLength={2000} placeholder="Savolingizni yozing…" enterKeyHint="enter"
                  onChange={(e) => { setText(e.target.value); autoGrow(e.target); }}
                  onKeyDown={(e) => { if (sendsOnEnter(e)) { e.preventDefault(); void send(text); } }} />
        <button className="icon-btn send" type="submit" disabled={busy || !text.trim()} aria-label="Yuborish"><Icon name="send" size={20} /></button>
      </form>
    </div>
  );
}

/** The model sometimes marks words with **bold** despite being asked for plain text: show it as bold, never as stars. */
function Rich({ text }: { text: string }) {
  const clean = text.replace(/^#{1,6}\s*/gm, "").replace(/^\s*\*\s+/gm, "- ");
  return <>{clean.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <b key={i}>{part}</b> : part))}</>;
}
