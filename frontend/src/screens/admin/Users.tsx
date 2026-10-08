import { useCallback, useEffect, useState } from "react";
import { api, type AdminTrack, type AdminUser } from "../../api";
import { ask } from "../../tg";
import { ErrorText, message } from "../../ui";
import type { AdminCtx } from "./AdminSite";

// Telegram users are students or mentors; admins are separate website accounts ("Adminlar").
type Level = "student" | "mentor";
const LEVEL_LABEL: Record<Level, string> = { student: "Talaba", mentor: "Mentor" };
const levelOf = (u: AdminUser): Level => (u.role === "student" ? "student" : "mentor");

function ago(iso: string | null): string {
  if (!iso) return "hali kirmagan";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return days <= 0 ? "bugun kirgan" : `${days} kun oldin kirgan`;
}

export default function Users({ ctx, onShowWork }: { ctx: AdminCtx; onShowWork: (u: { id: number; name: string }) => void }) {
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [tracks, setTracks] = useState<AdminTrack[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    const params: Record<string, string> = {};
    if (q.trim()) params.q = q.trim();
    if (role === "blocked") params.blocked = "true";
    else if (role) params.role = role;
    setUsers(null);
    api.admin.users(params).then(setUsers, (e) => setError(message(e)));
  }, [q, role]);

  useEffect(() => { load(); }, [role]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { api.admin.tracks().then(setTracks, () => {}); }, []);

  const replace = (u: AdminUser) => setUsers((cur) => cur?.map((x) => (x.id === u.id ? u : x)) ?? null);

  return (
    <div>
      <form className="row" onSubmit={(e) => { e.preventDefault(); load(); }}>
        <input className="grow" value={q} placeholder="Ism, @username yoki guruh" onChange={(e) => setQ(e.target.value)} />
        <button className="btn small" type="submit">Qidirish</button>
      </form>
      <div className="chips" style={{ margin: "8px 0" }}>
        {[["", "Hammasi"], ["student", "Talabalar"], ["mentor", "Mentorlar"], ["blocked", "Bloklangan"]].map(([id, label]) => (
          <button key={id} className={`chip ${role === id ? "on" : ""}`} onClick={() => setRole(id)}>{label}</button>
        ))}
        <button className="chip" onClick={load}>Yangilash</button>
      </div>
      <p className="hint">
        Mentorlar tengdoshlar tasdiqlagan ishlarni yakuniy tasdiqlaydi.
        {" "}Sayt adminlari «Adminlar» bo'limida boshqariladi.
      </p>
      <ErrorText error={error} />
      {!users && !error && <div className="hint">Yuklanmoqda…</div>}
      {users?.length === 0 && <div className="hint">Hech kim topilmadi</div>}
      {users?.map((u) => (
        <UserCard key={u.id} user={u} ctx={ctx} track={tracks.find((t) => t.id === u.track_id)}
                  onChanged={replace} onShowWork={() => onShowWork({ id: u.id, name: u.full_name })} />
      ))}
    </div>
  );
}

function UserCard({ user, ctx, track, onChanged, onShowWork }: {
  user: AdminUser; ctx: AdminCtx; track?: AdminTrack; onChanged: (u: AdminUser) => void; onShowWork: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pointsOpen, setPointsOpen] = useState(false);
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const level = levelOf(user);
  const levels: Level[] = ["student", "mentor"];

  async function run(action: () => Promise<AdminUser>) {
    setBusy(true); setError("");
    try { onChanged(await action()); } catch (e) { setError(message(e)); } finally { setBusy(false); }
  }

  async function setLevel(next: Level) {
    if (next === level) return;
    if (next === "mentor" && !(await ask(`${user.full_name} mentor bo'lsinmi? U ishlarni yakuniy tasdiqlay oladi.`))) return;
    void run(() => api.admin.updateUser(user.id, { role: next }));
  }

  async function adjust() {
    setBusy(true); setError("");
    try {
      const r = await api.admin.adjustPoints(user.id, Number(delta), reason.trim());
      onChanged({ ...user, points: r.points });
      setPointsOpen(false); setDelta(""); setReason("");
    } catch (e) { setError(message(e)); } finally { setBusy(false); }
  }

  return (
    <div className="card" style={user.is_blocked ? { opacity: 0.6 } : undefined}>
      <div className="row between">
        <div className="grow">
          <b>{user.full_name}</b>{user.is_blocked && <span className="badge rejected" style={{ marginLeft: 6 }}>bloklangan</span>}
          <div className="hint">
            {[user.username && `@${user.username}`, user.group_name, track && `${track.icon} ${track.title}`].filter(Boolean).join(" · ")}
          </div>
          <div className="hint">{user.points} ball · {user.verified_tasks} tasdiqlangan ish · {ago(user.last_seen_at)}</div>
        </div>
        <select value={level} disabled={busy} style={{ width: "auto" }} onChange={(e) => void setLevel(e.target.value as Level)}>
          {levels.map((l) => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}
        </select>
      </div>
      <div className="row wrap" style={{ marginTop: 8 }}>
        <button className="btn small ghost" onClick={onShowWork}>Ishlari</button>
        {user.username && <a className="btn small ghost" href={`https://t.me/${user.username}`} target="_blank" rel="noreferrer">Yozish</a>}
        {(
          <button className="btn small ghost" disabled={busy}
                  onClick={async () => (user.is_blocked || (await ask(`${user.full_name} bloklansinmi? U ilovaga kira olmaydi.`))) &&
                    run(() => api.admin.updateUser(user.id, { is_blocked: !user.is_blocked }))}>
            {user.is_blocked ? "Blokdan chiqarish" : "Bloklash"}
          </button>
        )}
        {ctx.isOwner && <button className="btn small ghost" onClick={() => setPointsOpen(!pointsOpen)}>Ball tuzatish</button>}
      </div>
      {pointsOpen && (
        <div style={{ marginTop: 8 }}>
          <div className="row">
            <input style={{ width: 110 }} value={delta} placeholder="+10 yoki -5" inputMode="numeric"
                   onChange={(e) => setDelta(e.target.value.replace(/[^\d-]/g, ""))} />
            <input className="grow" value={reason} placeholder="Sabab (jurnalga yoziladi)" onChange={(e) => setReason(e.target.value)} />
          </div>
          <button className="btn small" style={{ marginTop: 6 }} disabled={busy || !Number(delta) || reason.trim().length < 5} onClick={adjust}>Saqlash</button>
        </div>
      )}
      <ErrorText error={error} />
    </div>
  );
}
