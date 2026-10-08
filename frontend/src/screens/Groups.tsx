import { useCallback, useEffect, useRef, useState } from "react";
import { api, type ChatMessage, type GroupCard, type GroupDetail } from "../api";
import { ask, backButton, BOT_URL, haptic, openLink } from "../tg";
import { Avatar, ErrorText, message } from "../ui";
import { Icon } from "../icons";

const POLL_MS = 3000;
const time = (s: string) => new Date(s).toLocaleTimeString("uz", { hour: "2-digit", minute: "2-digit" });
// Browsers often lack Uzbek month names ("M10"), so they are spelled out here.
const MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
const day = (s: string) => { const d = new Date(s); return `${d.getDate()}-${MONTHS[d.getMonth()]}`; };

/** Group list: my groups (community, my track, private ones), open groups to join, create, join by code. */
export default function Groups({ joinCode, onUnreadChange }: { joinCode?: string | null; onUnreadChange?: () => void }) {
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
        <h1 style={{ margin: "4px 0 12px" }}>Guruhlar</h1>
        <button className="btn small" onClick={() => setCreating(!creating)}>{creating ? "Bekor qilish" : <><Icon name="plus" size={16} />Guruh ochish</>}</button>
      </div>
      {creating && <CreateGroup onCreated={(g) => { setCreating(false); void load(); setOpen(g.id); }} />}
      {joinCode && code && (
        <div className="card" style={{ border: "2px solid var(--btn)" }}>
          <b>Sizni guruhga taklif qilishdi</b>
          <p className="hint">Qo'shilsangiz, guruh a'zolari ismingiz va xabarlaringizni ko'radi.</p>
          <button className="btn" onClick={() => join(() => api.groups.joinByCode(code))}>Guruhga qo'shilish</button>
        </div>
      )}
      <ErrorText error={error} />
      {!data && !error && <div className="hint">Yuklanmoqda…</div>}
      {data?.mine.map((g) => <GroupRow key={g.id} g={g} onOpen={() => setOpen(g.id)} />)}

      {data && data.discover.length > 0 && (
        <>
          <h2>Boshqa ochiq guruhlar</h2>
          {data.discover.map((g) => (
            <div key={g.id} className="card row between">
              <div className="grow"><b>{g.name}</b><div className="hint">{g.members} a'zo</div></div>
              <button className="btn small ghost" onClick={() => join(() => api.groups.joinPublic(g.id))}>Qo'shilish</button>
            </div>
          ))}
        </>
      )}

      <h2>Kod bilan qo'shilish</h2>
      <form className="row" onSubmit={(e) => { e.preventDefault(); if (code.trim()) void join(() => api.groups.joinByCode(code.trim())); }}>
        <input className="grow" value={code} placeholder="Shaxsiy guruh kodi" onChange={(e) => setCode(e.target.value)} />
        <button className="btn small" type="submit" disabled={!code.trim()}>Qo'shilish</button>
      </form>
      <p className="hint">Shaxsiy guruhlar boshqalarga ko'rinmaydi. Ularga faqat egasi yuborgan havola yoki kod orqali kiriladi.</p>
    </div>
  );
}

function GroupRow({ g, onOpen }: { g: GroupCard; onOpen: () => void }) {
  return (
    <div className="card tap row" onClick={onOpen}>
      <div className="avatar"><Icon name={g.is_private ? "lock" : g.is_official ? "globe" : "chat"} /></div>
      <div className="grow">
        <div className="row between"><b style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</b>
          {g.last_message && <span className="hint">{time(g.last_message.created_at)}</span>}</div>
        <div className="row between">
          <span className="hint" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {g.last_message ? `${g.last_message.author.split(" ")[0]}: ${g.last_message.text}` : `${g.members} a'zo · hali xabar yo'q`}
          </span>
          {g.unread > 0 && <span className="dot">{g.unread}</span>}
        </div>
      </div>
    </div>
  );
}

function CreateGroup({ onCreated }: { onCreated: (g: GroupCard) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  return (
    <div className="card">
      <b>Yangi shaxsiy guruh</b>
      <p className="hint">Guruh faqat siz taklif qilganlarga ko'rinadi. Masalan: kursdoshlar, loyiha jamoasi, o'qish guruhi.</p>
      <label>Nomi</label>
      <input value={name} maxLength={80} placeholder="Masalan: SQL'ni birga o'rganamiz" onChange={(e) => setName(e.target.value)} />
      <label>Tavsif (ixtiyoriy)</label>
      <input value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} />
      <ErrorText error={error} />
      <button className="btn" style={{ marginTop: 10 }} disabled={name.trim().length < 2}
              onClick={() => api.groups.create(name.trim(), description.trim()).then(onCreated, (e) => setError(message(e)))}>Ochish</button>
    </div>
  );
}

// --------------------------------------------------------------------------- chat

function Chat({ groupId, onBack }: { groupId: number; onBack: () => void }) {
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
    const t = text.trim();
    if (!t) return;
    setText("");
    try {
      const m = await api.groups.send(groupId, t);
      lastId.current = Math.max(lastId.current, m.id);
      setMsgs((cur) => [...cur, m]);
      setTimeout(() => bottom.current?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch (e) {
      setText(t);
      setError(message(e));
    }
  }

  async function remove(m: ChatMessage) {
    if (!(await ask("Xabar o'chirilsinmi?"))) return;
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
        <button className="icon-btn" onClick={onBack} aria-label="Orqaga"><Icon name="back" /></button>
        <div className="avatar"><Icon name={info?.is_private ? "lock" : "globe"} /></div>
        <div className="grow" style={{ cursor: "pointer", minWidth: 0 }} onClick={() => setShowInfo(true)}>
          <b>{info?.name ?? "…"}</b>
          <div className="hint">{info ? `${info.members} a'zo${info.is_private ? " · shaxsiy" : ""} · ma'lumot uchun bosing` : ""}</div>
        </div>
      </div>
      <div className="chat-body">
        {hasOlder && msgs.length > 0 && <button className="btn small ghost" style={{ alignSelf: "center" }} onClick={older}>Oldingi xabarlar</button>}
        {msgs.length === 0 && <div className="center hint">Hali xabar yo'q. Birinchi bo'lib salom bering.</div>}
        {msgs.map((m) => {
          const d = day(m.created_at);
          const sep = d !== lastDay ? <div key={`d${m.id}`} className="chat-day">{d}</div> : null;
          lastDay = d;
          return (
            <div key={m.id} style={{ display: "contents" }}>
              {sep}
              <div className={`bubble ${m.mine ? "mine" : ""}`} onContextMenu={(e) => { e.preventDefault(); if (!m.deleted && (m.mine || info?.my_role === "owner")) void remove(m); }}>
                {!m.mine && <div className="bubble-author">{m.author}{m.badge && <span> · {m.badge}</span>}</div>}
                {m.deleted ? <i className="hint">Xabar o'chirildi</i> : <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.text}</div>}
                <div className="bubble-time">
                  {time(m.created_at)}
                  {!m.deleted && (m.mine || info?.my_role === "owner") && <button className="bubble-del" onClick={() => remove(m)} aria-label="O'chirish"><Icon name="trash" size={13} /></button>}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>
      <ErrorText error={error} />
      <form className="chat-input" onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <textarea value={text} rows={1} maxLength={2000} placeholder="Xabar yozing…"
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} />
        <button className="btn small" type="submit" disabled={!text.trim()} aria-label="Yuborish"><Icon name="send" size={18} /></button>
      </form>
    </div>
  );
}

function GroupInfo({ info, onChanged, onBack, onGone }: { info: GroupDetail; onChanged: () => void; onBack: () => void; onGone: () => void }) {
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
        <button className="icon-btn" onClick={onBack} aria-label="Orqaga"><Icon name="back" /></button>
        <b>Guruh haqida</b>
      </div>
      <h1>{info.name}</h1>
      {info.description && <p className="hint">{info.description}</p>}
      {info.is_private && link && (
        <div className="card">
          <b>Taklif havolasi</b>
          <p className="hint">Havolani olgan kishi guruhga qo'shila oladi. Boshqalar guruhni ko'rmaydi.</p>
          <div className="row wrap">
            <button className="btn small" onClick={() => openLink(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(`«${info.name}» guruhiga qo'shil`)}`)}>Ulashish</button>
            <button className="btn small ghost" onClick={() => navigator.clipboard.writeText(link).catch(() => {})}>Nusxalash</button>
            {isOwner && <button className="btn small ghost" onClick={() => run(() => api.groups.resetInvite(info.id))}>Yangi havola</button>}
          </div>
          <div className="hint" style={{ marginTop: 6 }}>Kod: {info.invite_code}</div>
        </div>
      )}
      <div className="card">
        <b>A'zolar ({info.members})</b>
        {info.member_list.map((m) => (
          <div key={m.user_id} className="row" style={{ marginTop: 10 }}>
            <Avatar name={m.name} />
            <div className="grow">{m.name}{m.role === "owner" && <span className="badge peer_verified" style={{ marginLeft: 6 }}>ega</span>}
              {m.badge && <div className="hint">{m.badge}</div>}</div>
            {m.username && <button className="btn small ghost" onClick={() => openLink(`https://t.me/${m.username}`)}>Yozish</button>}
            {isOwner && m.role !== "owner" && (
              <button className="btn small ghost" onClick={async () => { if (await ask(`${m.name} guruhdan chiqarilsinmi?`)) void run(() => api.groups.removeMember(info.id, m.user_id)); }} aria-label="Chiqarish"><Icon name="close" size={16} /></button>
            )}
          </div>
        ))}
      </div>
      <ErrorText error={error} />
      {!info.is_official && !isOwner && (
        <button className="btn ghost" onClick={async () => { if (await ask("Guruhdan chiqasizmi?")) void run(() => api.groups.leave(info.id), onGone); }}>Guruhdan chiqish</button>
      )}
      {isOwner && (
        <button className="btn bad" onClick={async () => { if (await ask("Guruh hamma uchun o'chirilsinmi?")) void run(() => api.groups.remove(info.id), onGone); }}>Guruhni o'chirish</button>
      )}
    </div>
  );
}
