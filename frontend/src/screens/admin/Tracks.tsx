import { useCallback, useEffect, useState } from "react";
import { api, type AdminTask, type AdminTrack } from "../../api";
import { ErrorText, message } from "../../ui";

export default function Tracks() {
  const [tracks, setTracks] = useState<AdminTrack[] | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => api.admin.tracks().then(setTracks, (e) => setError(message(e))), []);
  useEffect(() => { void load(); }, [load]);

  return (
    <div>
      <button className="btn" onClick={() => setAdding(!adding)}>{adding ? "Bekor qilish" : "+ Yangi yo'nalish"}</button>
      {adding && <TrackForm onSaved={() => { setAdding(false); void load(); }} />}
      <p className="hint">Yashirilgan yo'nalish yangi talabalarga ko'rinmaydi va unga yangi ish qabul qilinmaydi. Eski tasdiqlangan ishlar CV'da qoladi.</p>
      <ErrorText error={error} />
      {!tracks && !error && <div className="hint">Yuklanmoqda…</div>}
      {tracks?.map((t) => (
        <div key={t.id} className="card" style={t.is_active ? undefined : { opacity: 0.6 }}>
          <div className="row between">
            <div className="grow">
              <b>{t.icon} {t.title}</b>
              <div className="hint">{t.student_count} talaba · {t.task_count} topshiriq{t.is_active ? "" : " · yashirilgan"}</div>
            </div>
            <button className="btn small ghost" onClick={() => setOpenId(openId === t.id ? null : t.id)}>{openId === t.id ? "Yopish" : "Ochish"}</button>
          </div>
          {openId === t.id && <TrackDetail track={t} onChanged={load} />}
        </div>
      ))}
    </div>
  );
}

function TrackForm({ track, onSaved }: { track?: AdminTrack; onSaved: () => void }) {
  const [title, setTitle] = useState(track?.title ?? "");
  const [icon, setIcon] = useState(track?.icon ?? "📘");
  const [description, setDescription] = useState(track?.description ?? "");
  const [error, setError] = useState("");

  async function save() {
    try {
      if (track) await api.admin.updateTrack(track.id, { title, icon, description });
      else await api.admin.createTrack({ title, icon, description });
      onSaved();
    } catch (e) {
      setError(message(e));
    }
  }

  return (
    <div className="card" style={{ marginTop: 8, background: "var(--bg2)" }}>
      <div className="row">
        <div style={{ width: 70 }}><label>Belgi</label><input value={icon} maxLength={8} onChange={(e) => setIcon(e.target.value)} /></div>
        <div className="grow"><label>Nomi</label><input value={title} maxLength={120} placeholder="Masalan: Marketing va SMM" onChange={(e) => setTitle(e.target.value)} /></div>
      </div>
      <label>Qisqa tavsif</label>
      <textarea value={description} maxLength={600} onChange={(e) => setDescription(e.target.value)} />
      <ErrorText error={error} />
      <button className="btn small" style={{ marginTop: 8 }} disabled={title.trim().length < 3} onClick={save}>Saqlash</button>
    </div>
  );
}

function TrackDetail({ track, onChanged }: { track: AdminTrack; onChanged: () => void }) {
  const [tasks, setTasks] = useState<AdminTask[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [taskForm, setTaskForm] = useState<AdminTask | "new" | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => api.admin.tasks(track.id).then(setTasks, (e) => setError(message(e))), [track.id]);
  useEffect(() => { void load(); }, [load]);

  async function toggleTrack() {
    try {
      await api.admin.updateTrack(track.id, { is_active: !track.is_active });
      onChanged();
    } catch (e) {
      setError(message(e));
    }
  }

  async function toggleTask(t: AdminTask) {
    try {
      await api.admin.updateTask(t.id, { is_active: !t.is_active });
      void load();
    } catch (e) {
      setError(message(e));
    }
  }

  return (
    <div style={{ marginTop: 8 }}>
      {track.description && <p className="hint">{track.description}</p>}
      <div className="row wrap">
        <button className="btn small ghost" onClick={() => setEditing(!editing)}>Tahrirlash</button>
        <button className="btn small ghost" onClick={toggleTrack}>{track.is_active ? "Yashirish" : "Qayta ko'rsatish"}</button>
        <button className="btn small" onClick={() => setTaskForm(taskForm === "new" ? null : "new")}>+ Topshiriq</button>
      </div>
      {editing && <TrackForm track={track} onSaved={() => { setEditing(false); onChanged(); }} />}
      {taskForm && (
        <TaskForm trackId={track.id} task={taskForm === "new" ? undefined : taskForm}
                  nextWeek={Math.max(0, ...(tasks ?? []).map((t) => t.week)) + 1}
                  onSaved={() => { setTaskForm(null); void load(); onChanged(); }} />
      )}
      <ErrorText error={error} />
      <h2>Topshiriqlar</h2>
      {tasks?.length === 0 && <div className="hint">Hali topshiriq yo'q</div>}
      {tasks?.map((t) => (
        <div key={t.id} className="review" style={t.is_active ? undefined : { opacity: 0.5 }}>
          <div className="row between">
            <div className="grow"><span className="hint">{t.week}-hafta · {t.points} ball</span><div>{t.title}</div></div>
            <button className="btn small ghost" onClick={() => setTaskForm(t)}>✎</button>
            <button className="btn small ghost" onClick={() => toggleTask(t)}>{t.is_active ? "Yashirish" : "Ko'rsatish"}</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function TaskForm({ trackId, task, nextWeek, onSaved }: { trackId: number; task?: AdminTask; nextWeek: number; onSaved: () => void }) {
  const [f, setF] = useState({
    week: String(task?.week ?? nextWeek), title: task?.title ?? "", description: task?.description ?? "",
    proof_hint: task?.proof_hint ?? "", points: String(task?.points ?? 10),
  });
  const [error, setError] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  async function save() {
    const body = { week: Number(f.week), title: f.title.trim(), description: f.description.trim(), proof_hint: f.proof_hint.trim(), points: Number(f.points) };
    try {
      if (task) await api.admin.updateTask(task.id, body);
      else await api.admin.createTask({ track_id: trackId, ...body });
      onSaved();
    } catch (e) {
      setError(message(e));
    }
  }

  return (
    <div className="card" style={{ marginTop: 8, background: "var(--bg2)" }}>
      <b>{task ? "Topshiriqni tahrirlash" : "Yangi topshiriq"}</b>
      <div className="row">
        <div style={{ width: 90 }}><label>Hafta</label><input value={f.week} inputMode="numeric" onChange={set("week")} /></div>
        <div style={{ width: 90 }}><label>Ball</label><input value={f.points} inputMode="numeric" onChange={set("points")} /></div>
      </div>
      <label>Nomi</label>
      <input value={f.title} maxLength={160} onChange={set("title")} />
      <label>Nima qilish kerak</label>
      <textarea value={f.description} onChange={set("description")} />
      <label>Isbot sifatida nima topshiriladi</label>
      <input value={f.proof_hint} placeholder="Masalan: GitHub repo havolasi" onChange={set("proof_hint")} />
      <ErrorText error={error} />
      <button className="btn small" style={{ marginTop: 8 }} disabled={f.title.trim().length < 3 || f.description.trim().length < 10} onClick={save}>Saqlash</button>
    </div>
  );
}
