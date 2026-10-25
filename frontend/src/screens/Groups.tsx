import { useCallback, useEffect, useRef, useState } from "react";
import { api, type ChatMessage, type GroupCard, type GroupDetail } from "../api";
import { t, useLang } from "../i18n";
import { ask, backButton, BOT_URL, haptic, openLink } from "../tg";
import { Avatar, ErrorText, message, sendsOnEnter } from "../ui";
import { Icon } from "../icons";

const POLL_MS = 3000;
const time = (s: string) => new Date(s).toLocaleTimeString("uz", { hour: "2-digit", minute: "2-digit" });
// Browsers often lack Uzbek month names ("M10"), so they are spelled out in the texts.
const day = (s: string) => {
  const d = new Date(s);
  return t("s.groups.day", { d: d.getDate(), month: t("s.groups.months").split(",")[d.getMonth()] });
};

/** Group list: my groups (community, my track, private ones), open groups to join, create, join by code. */
export default function Groups({ joinCode, onUnreadChange }: { joinCode?: string | null; onUnreadChange?: () => void }) {
  useLang();
  const [data, setData] = useState<{ mine: GroupCard[]; discover: GroupCard[] } | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [code, setCode] = useState(joinCode ?? "");
  const [error, setError] = useState("");

  const load = useCallback(() => api.groups.list().then(setData, (e) => setError(message(e))), []);
  useEffect(() => { void load(); }, [load]);

  async function join(action: () => Promise<GroupCard>) {
    setError("");
    try {
      const g = await action();
      haptic("success");
      setCode("");
      await load();
      setOpen(g.id);
    } catch (e) {
      setError(message(e));
    }
  }

  if (open !== null) {
    return <Chat groupId={open} onBack={() => { setOpen(null); void load(); onUnreadChange?.(); }} />;
  }

  return (
    <div>
      <div className="row between">
        <h1 style={{ margin: "4px 0 12px" }}>{t("s.community.groups")}</h1>
        <button className="btn small" onClick={() => setCreating(!creating)}>{creating ? t("common.cancel") : <><Icon name="plus" size={16} />{t("s.groups.create")}</>}</button>
      </div>
      {creating && <CreateGroup onCreated={(g) => { setCreating(false); void load(); setOpen(g.id); }} />}
      {joinCode && code && (
        <div className="card" style={{ border: "2px solid var(--btn)" }}>
          <b>{t("s.groups.invited")}</b>
          <p className="hint">{t("s.groups.invited_hint")}</p>
          <button className="btn" onClick={() => join(() => api.groups.joinByCode(code))}>{t("s.groups.join_group")}</button>
        </div>
      )}
      <ErrorText error={error} />
      {!data && !error && <div className="hint">{t("common.loading")}</div>}
      {data?.mine.map((g) => <GroupRow key={g.id} g={g} onOpen={() => setOpen(g.id)} />)}

      {data && data.discover.length > 0 && (
        <>
          <h2>{t("s.groups.discover")}</h2>
          {data.discover.map((g) => (
            <div key={g.id} className="card row between">
              <div className="grow"><b>{g.name}</b><div className="hint">{t("s.groups.members", { n: g.members })}</div></div>
              <button className="btn small ghost" onClick={() => join(() => api.groups.joinPublic(g.id))}>{t("s.groups.join")}</button>
            </div>
          ))}
        </>
      )}

      <h2>{t("s.groups.by_code")}</h2>
      <form className="row" onSubmit={(e) => { e.preventDefault(); if (code.trim()) void join(() => api.groups.joinByCode(code.trim())); }}>
        <input className="grow" value={code} placeholder={t("s.groups.code_ph")} onChange={(e) => setCode(e.target.value)} />
        <button className="btn small" type="submit" disabled={!code.trim()}>{t("s.groups.join")}</button>
      </form>
      <p className="hint">{t("s.groups.private_hint")}</p>
    </div>
  );
}

function GroupRow({ g, onOpen }: { g: GroupCard; onOpen: () => void }) {
  useLang();
  return (
    <div className="card tap row" onClick={onOpen}>
      <div className="avatar"><Icon name={g.is_private ? "lock" : g.is_official ? "globe" : "chat"} /></div>
      <div className="grow">
        <div className="row between"><b style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</b>
          {g.last_message && <span className="hint">{time(g.last_message.created_at)}</span>}</div>
        <div className="row between">
          <span className="hint" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {g.last_message ? `${g.last_message.author.split(" ")[0]}: ${g.last_message.text}`
              : `${t("s.groups.members", { n: g.members })} · ${t("s.groups.no_messages")}`}
          </span>
          {g.unread > 0 && <span className="dot">{g.unread}</span>}
        </div>
      </div>
    </div>
  );
}

function CreateGroup({ onCreated }: { onCreated: (g: GroupCard) => void }) {
  useLang();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  return (
    <div className="card">
      <b>{t("s.groups.new_title")}</b>
      <p className="hint">{t("s.groups.new_hint")}</p>
      <label>{t("s.groups.name")}</label>
      <input value={name} maxLength={80} placeholder={t("s.groups.name_ph")} onChange={(e) => setName(e.target.value)} />
      <label>{t("s.groups.desc")}</label>
      <input value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} />
      <ErrorText error={error} />
      <button className="btn" style={{ marginTop: 10 }} disabled={name.trim().length < 2}
              onClick={() => api.groups.create(name.trim(), description.trim()).then(onCreated, (e) => setError(message(e)))}>{t("s.groups.open")}</button>
    </div>
  );
}

// --------------------------------------------------------------------------- chat

function Chat({ groupId, onBack }: { groupId: number; onBack: () => void }) {
  useLang();
  const [info, setInfo] = useState<GroupDetail | null>(null);
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [showInfo, setShowInfo] = useState(false);
  const [hasOlder, setHasOlder] = useState(true);
  const [error, setError] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const lastId = useRef(0);

  useEffect(() => backButton(showInfo ? () => setShowInfo(false) : onBack), [showInfo, onBack]);

  const loadInfo = useCallback(() => api.groups.detail(groupId).then(setInfo, (e) => setError(message(e))), [groupId]);

  useEffect(() => {
    void loadInfo();
    api.groups.messages(groupId, {}).then((m) => {
      setMsgs(m);
      setHasOlder(m.length >= 50);
      lastId.current = m.at(-1)?.id ?? 0;
      setTimeout(() => bottom.current?.scrollIntoView(), 50);
    }, (e) => setError(message(e)));
    const timer = setInterval(async () => {
      try {
        const fresh = await api.groups.messages(groupId, { after: lastId.current });
        if (fresh.length) {
          lastId.current = fresh.at(-1)!.id;
          setMsgs((cur) => [...cur, ...fresh.filter((f) => !cur.some((c) => c.id === f.id))]);
          setTimeout(() => bottom.current?.scrollIntoView({ behavior: "smooth" }), 50);
        }
      } catch { /* the next poll retries */ }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [groupId, loadInfo]);

  async function older() {
    const first = msgs[0]?.id;
    if (!first) return;
    const prev = await api.groups.messages(groupId, { before: first });
    setHasOlder(prev.length >= 50);
    setMsgs((cur) => [...prev, ...cur]);
  }

  async function send() {
    const body = text.trim();
    if (!body) return;
    setText("");
    try {
      const m = await api.groups.send(groupId, body);
      lastId.current = Math.max(lastId.current, m.id);
      setMsgs((cur) => [...cur, m]);
      setTimeout(() => bottom.current?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch (e) {
      setText(body);
      setError(message(e));
    }
  }

  async function remove(m: ChatMessage) {
    if (!(await ask(t("s.groups.delete_msg_confirm")))) return;
    try {
      await api.groups.deleteMessage(groupId, m.id);
      setMsgs((cur) => cur.map((x) => (x.id === m.id ? { ...x, deleted: true, text: null } : x)));
    } catch (e) {
      setError(message(e));
    }
  }

  if (showInfo && info) return <GroupInfo info={info} onChanged={loadInfo} onBack={() => setShowInfo(false)} onGone={onBack} />;

  let lastDay = "";
  return (
    <div className="chat">
      <div className="chat-head">
        <button className="icon-btn" onClick={onBack} aria-label={t("common.back")}><Icon name="back" /></button>
        <div className="avatar"><Icon name={info?.is_private ? "lock" : "globe"} /></div>
        <div className="grow" style={{ cursor: "pointer", minWidth: 0 }} onClick={() => setShowInfo(true)}>
          <b>{info?.name ?? "…"}</b>
          <div className="hint">
            {info ? `${t("s.groups.members", { n: info.members })}${info.is_private ? ` · ${t("s.groups.private")}` : ""} · ${t("s.groups.tap_info")}` : ""}
          </div>
        </div>
      </div>
      <div className="chat-body">
        {hasOlder && msgs.length > 0 && <button className="btn small ghost" style={{ alignSelf: "center" }} onClick={older}>{t("s.groups.older")}</button>}
        {msgs.length === 0 && <div className="center hint">{t("s.groups.empty_chat")}</div>}
        {msgs.map((m) => {
          const d = day(m.created_at);
          const sep = d !== lastDay ? <div key={`d${m.id}`} className="chat-day">{d}</div> : null;
          lastDay = d;
          return (
            <div key={m.id} style={{ display: "contents" }}>
              {sep}
              <div className={`bubble ${m.mine ? "mine" : ""}`} onContextMenu={(e) => { e.preventDefault(); if (!m.deleted && (m.mine || info?.my_role === "owner")) void remove(m); }}>
                {!m.mine && <div className="bubble-author">{m.author}{m.badge && <span> · {m.badge}</span>}</div>}
                {m.deleted ? <i className="hint">{t("s.groups.deleted")}</i> : <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.text}</div>}
                <div className="bubble-time">
                  {time(m.created_at)}
                  {!m.deleted && (m.mine || info?.my_role === "owner") && <button className="bubble-del" onClick={() => remove(m)} aria-label={t("s.common.delete")}><Icon name="trash" size={13} /></button>}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>
      <ErrorText error={error} />
      <form className="chat-input" onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <textarea value={text} rows={1} maxLength={2000} placeholder={t("s.groups.msg_ph")}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => { if (sendsOnEnter(e)) { e.preventDefault(); void send(); } }} />
        <button className="btn small" type="submit" disabled={!text.trim()} aria-label={t("s.common.send")}><Icon name="send" size={18} /></button>
      </form>
    </div>
  );
}

function GroupInfo({ info, onChanged, onBack, onGone }: { info: GroupDetail; onChanged: () => void; onBack: () => void; onGone: () => void }) {
  useLang();
  const [error, setError] = useState("");
  const isOwner = info.my_role === "owner";
  const link = info.invite_code ? `${BOT_URL}?start=g${info.invite_code}` : "";

  async function run(action: () => Promise<unknown>, after: () => void = onChanged) {
    setError("");
    try { await action(); after(); } catch (e) { setError(message(e)); }
  }

  return (
    <div className="chat-page">
      <div className="chat-head" style={{ marginBottom: 8 }}>
        <button className="icon-btn" onClick={onBack} aria-label={t("common.back")}><Icon name="back" /></button>
        <b>{t("s.groups.about")}</b>
      </div>
      <h1>{info.name}</h1>
      {info.description && <p className="hint">{info.description}</p>}
      {info.is_private && link && (
        <div className="card">
          <b>{t("s.groups.invite_link")}</b>
          <p className="hint">{t("s.groups.invite_hint")}</p>
          <div className="row wrap">
            <button className="btn small" onClick={() => openLink(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(t("s.groups.share_text", { name: info.name }))}`)}>{t("s.common.share")}</button>
            <button className="btn small ghost" onClick={() => navigator.clipboard.writeText(link).catch(() => {})}>{t("s.groups.copy")}</button>
            {isOwner && <button className="btn small ghost" onClick={() => run(() => api.groups.resetInvite(info.id))}>{t("s.groups.new_link")}</button>}
          </div>
          <div className="hint" style={{ marginTop: 6 }}>{t("s.groups.code", { code: info.invite_code ?? "" })}</div>
        </div>
      )}
      <div className="card">
        <b>{t("s.groups.members_title", { n: info.members })}</b>
        {info.member_list.map((m) => (
          <div key={m.user_id} className="row" style={{ marginTop: 10 }}>
            <Avatar name={m.name} />
            <div className="grow">{m.name}{m.role === "owner" && <span className="badge peer_verified" style={{ marginLeft: 6 }}>{t("s.groups.owner")}</span>}
              {m.badge && <div className="hint">{m.badge}</div>}</div>
            {m.username && <button className="btn small ghost" onClick={() => openLink(`https://t.me/${m.username}`)}>{t("s.common.write")}</button>}
            {isOwner && m.role !== "owner" && (
              <button className="btn small ghost" onClick={async () => { if (await ask(t("s.groups.remove_confirm", { name: m.name }))) void run(() => api.groups.removeMember(info.id, m.user_id)); }} aria-label={t("s.groups.remove")}><Icon name="close" size={16} /></button>
            )}
          </div>
        ))}
      </div>
      <ErrorText error={error} />
      {!info.is_official && !isOwner && (
        <button className="btn ghost" onClick={async () => { if (await ask(t("s.groups.leave_confirm"))) void run(() => api.groups.leave(info.id), onGone); }}>{t("s.groups.leave")}</button>
      )}
      {isOwner && (
        <button className="btn bad" onClick={async () => { if (await ask(t("s.groups.delete_confirm"))) void run(() => api.groups.remove(info.id), onGone); }}>{t("s.groups.delete")}</button>
      )}
    </div>
  );
}
