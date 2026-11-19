// "Xabarlar" for both sides (student panel v2, phase 3): the list of threads on the left, the open thread on the
// right; on a phone one at a time. A company can write only after the student applied or accepted its request;
// the student can close a thread. New messages are fetched every few seconds while a thread is open.
import { useCallback, useEffect, useRef, useState } from "react";
import { api, type ChatThread, type DirectView } from "../../api";
import { formatDateTime, t, useLang } from "../../i18n";
import { Icon } from "../../icons";
import { navigate, useSearch } from "../../router";
import { Avatar, ErrorText, autoGrow, message, sendsOnEnter } from "../../ui";
import { PageHead } from "../employer/kit";

type Side = "student" | "company";
const adapter = (side: Side) => side === "student"
  ? { list: async () => api.chats(), open: api.chat, send: api.sendChat, start: (id: number) => api.startChat(id) }
  : { list: async () => ({ threads: await api.employer.chats(), can_start: [] }), open: api.employer.chat,
      send: api.employer.sendChat, start: (id: number) => api.employer.startChat(id) };

const when = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tashkent" }) : formatDateTime(iso, false);
};

export default function DirectChat({ side, onUnread }: { side: Side; onUnread?: () => void }) {
  useLang();
  const api2 = adapter(side);
  const search = useSearch();
  const base = side === "student" ? "/talaba/xabarlar" : "/korxona/xabarlar";
  const [threads, setThreads] = useState<ChatThread[] | null>(null);
  const [canStart, setCanStart] = useState<{ id: number; name: string; logo: string | null }[]>([]);
  const [view, setView] = useState<DirectView | null>(null);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const openId = search.c ? Number(search.c) : null;

  const loadList = useCallback(() => api2.list().then((r) => { setThreads(r.threads); setCanStart(r.can_start); }, (e) => setError(message(e))),
                               [side]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void loadList(); const timer = setInterval(loadList, 30000); return () => clearInterval(timer); }, [loadList]);

  // a company opens /korxona/xabarlar?student=<id> from a student's card: the thread is opened (or created)
  const started = useRef("");
  useEffect(() => {
    const who = side === "company" ? search.student : search.company;
    if (!who || started.current === who) return;          // once per address, even when React runs effects twice
    started.current = who;
    api2.start(Number(who)).then((v) => { navigate(`${base}?c=${v.thread.id}`, { replace: true }); void loadList(); },
                                  (e) => setError(message(e)));
  }, [search.student, search.company]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadThread = useCallback(async () => {
    if (!openId) { setView(null); return; }
    try {
      const v = await api2.open(openId);
      setView(v);
      setThreads((cur) => cur?.map((x) => (x.id === v.thread.id ? { ...x, unread: 0 } : x)) ?? cur);
      onUnread?.();
    } catch (e) { setError(message(e)); }
  }, [openId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void loadThread(); }, [loadThread]);
  useEffect(() => {
    if (!openId) return;
    const timer = setInterval(() => { if (!document.hidden) void loadThread(); }, 8000);
    return () => clearInterval(timer);
  }, [openId, loadThread]);

  const shown = (threads ?? []).filter((x) => !q.trim() || (side === "student" ? x.company : x.student).toLowerCase().includes(q.trim().toLowerCase()));
  const title = (x: ChatThread) => (side === "student" ? x.company : x.student);

  return (
    <div className="co-page st-page">
      <PageHead title={t("st.msg.title")} sub={side === "student" ? t("st.msg.sub_student") : t("st.msg.sub_company")} />
      <ErrorText error={error} />
      <div className={`st-chat ${openId ? "has-open" : ""}`}>
        <aside className="st-chat-list">
          <div className="st-chat-search"><Icon name="search" size={16} /><input value={q} placeholder={t("st.msg.search")} onChange={(e) => setQ(e.target.value)} /></div>
          {!threads && <div className="hint" style={{ padding: 14 }}>{t("common.loading")}</div>}
          {threads?.length === 0 && canStart.length === 0 && (
            <div className="st-empty" style={{ margin: 12 }}>
              <Icon name="chat" size={26} />
              <b>{t("st.msg.empty")}</b>
              <span className="hint">{side === "student" ? t("st.msg.empty_student") : t("st.msg.empty_company")}</span>
            </div>
          )}
          {shown.map((x) => (
            <button key={x.id} className={`st-chat-item ${x.id === openId ? "on" : ""}`} onClick={() => navigate(`${base}?c=${x.id}`)}>
              {side === "student"
                ? <Avatar name={x.company} url={x.company_logo} className="square" />
                : <Avatar name={x.student} url={x.student_photo} />}
              <span className="st-chat-item-text">
                <span className="row between" style={{ gap: 6 }}><b className="ellipsis">{title(x)}</b><small>{when(x.last?.at ?? x.last_message_at)}</small></span>
                <span className="row between" style={{ gap: 6 }}>
                  <span className="hint ellipsis">{x.last ? `${x.last.side === side ? `${t("st.msg.you")}: ` : ""}${x.last.text}` : t("st.msg.no_messages")}</span>
                  {x.unread > 0 && <span className="dot">{x.unread}</span>}
                </span>
              </span>
            </button>
          ))}
          {side === "student" && canStart.length > 0 && (
            <div className="st-chat-start">
              <div className="side-group" style={{ padding: "10px 12px 4px" }}>{t("st.msg.start")}</div>
              {canStart.map((c) => (
                <button key={c.id} className="st-chat-item" onClick={() => api.startChat(c.id).then((v) => { navigate(`${base}?c=${v.thread.id}`); void loadList(); }, (e) => setError(message(e)))}>
                  <Avatar name={c.name} url={c.logo} className="square" />
                  <span className="st-chat-item-text"><b className="ellipsis">{c.name}</b><span className="hint">{t("st.msg.start_hint")}</span></span>
                </button>
              ))}
            </div>
          )}
        </aside>
        <section className="st-chat-thread">
          {!openId && (
            <div className="st-chat-placeholder"><Icon name="chat" size={34} /><b>{t("st.msg.pick")}</b><span className="hint">{t("st.msg.pick_hint")}</span></div>
          )}
          {openId && view && <Thread side={side} view={view} onBack={() => navigate(base)}
                                     onSent={async () => { await loadThread(); void loadList(); }} onChanged={loadThread} />}
        </section>
      </div>
    </div>
  );
}

function Thread({ side, view, onBack, onSent, onChanged }: {
  side: Side; view: DirectView; onBack: () => void; onSent: () => Promise<void>; onChanged: () => void;
}) {
  useLang();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const list = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const th = view.thread;
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight }); }, [view.messages.length, th.id]);

  async function send() {
    const body = text.trim();
    if (!body) return;
    setBusy(true); setError("");
    try {
      await (side === "student" ? api.sendChat(th.id, body) : api.employer.sendChat(th.id, body));
      setText("");
      if (box.current) box.current.style.height = "auto";
      await onSent();
    } catch (e) { setError(message(e)); }
    finally { setBusy(false); }
  }
  async function toggleClose() {
    try { await api.closeChat(th.id, !th.closed); onChanged(); } catch (e) { setError(message(e)); }
  }

  let lastDay = "";
  return (
    <>
      <header className="st-chat-head">
        <button className="icon-btn st-chat-back" aria-label={t("common.back")} onClick={onBack}><Icon name="back" size={18} /></button>
        {side === "student"
          ? <Avatar name={th.company} url={th.company_logo} className="square" />
          : <Avatar name={th.student} url={th.student_photo} />}
        <div className="grow" style={{ minWidth: 0 }}>
          <b className="ellipsis" style={{ display: "block" }}>{side === "student" ? th.company : th.student}</b>
          <span className="hint ellipsis" style={{ display: "block" }}>{side === "student" ? t("st.msg.company_hint") : th.student_study}</span>
        </div>
        {side === "student" && (
          <button className="btn small ghost" style={{ width: "auto" }} onClick={toggleClose}>{th.closed ? t("st.msg.reopen") : t("st.msg.close")}</button>
        )}
      </header>
      <div ref={list} className="st-chat-messages">
        {view.messages.length === 0 && <div className="st-chat-hello hint">{side === "student" ? t("st.msg.hello_student") : t("st.msg.hello_company")}</div>}
        {view.messages.map((m) => {
          const day = formatDateTime(m.at, false);
          const sep = day !== lastDay ? <div className="st-chat-day" key={`d-${m.id}`}><span>{day}</span></div> : null;
          lastDay = day;
          return (
            <div key={m.id} style={{ display: "contents" }}>
              {sep}
              <div className={`bubble ${m.side === side ? "mine" : ""}`}>
                {m.side !== side && side === "student" && m.sender && <div className="bubble-author">{m.sender}</div>}
                <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{m.text}</div>
                <div className="st-chat-time">{when(m.at)}</div>
              </div>
            </div>
          );
        })}
      </div>
      {th.closed && <div className="co-note" style={{ margin: "0 14px 8px" }}>{side === "student" ? t("st.msg.closed_student") : t("st.msg.closed_company")}</div>}
      <ErrorText error={error} />
      {view.can_write && (
        <form className="st-chat-compose" onSubmit={(e) => { e.preventDefault(); void send(); }}>
          <textarea ref={box} rows={1} value={text} maxLength={2000} placeholder={t("st.msg.write")}
                    onChange={(e) => { setText(e.target.value); autoGrow(e.target); }}
                    onKeyDown={(e) => { if (sendsOnEnter(e)) { e.preventDefault(); void send(); } }} />
          <button className="btn" type="submit" disabled={busy || !text.trim()} aria-label={t("s.common.send")}><Icon name="send" size={18} /></button>
        </form>
      )}
    </>
  );
}
