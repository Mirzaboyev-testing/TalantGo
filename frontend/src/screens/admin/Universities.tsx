import { useCallback, useEffect, useState } from "react";
import { api, type University } from "../../api";
import { ErrorText, message } from "../../ui";

type Row = University & { is_active: boolean; students: number };

export default function Universities() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [f, setF] = useState({ name: "", short_name: "", city: "" });
  const [error, setError] = useState("");
  const load = useCallback(() => api.admin.universities().then(setRows, (e) => setError(message(e))), []);
  useEffect(() => { void load(); }, [load]);

  async function add() {
    try {
      await api.admin.addUniversity({ name: f.name.trim(), short_name: f.short_name.trim(), city: f.city.trim() });
      setF({ name: "", short_name: "", city: "" });
      void load();
    } catch (e) {
      setError(message(e));
    }
  }

  async function toggle(u: Row) {
    try {
      await api.admin.editUniversity(u.id, { is_active: !u.is_active });
      void load();
    } catch (e) {
      setError(message(e));
    }
  }

  return (
    <div>
      <div className="card">
        <b>Universitet qo'shish</b>
        <label>To'liq nomi</label>
        <input value={f.name} maxLength={200} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <div className="row">
          <div className="grow"><label>Qisqa nomi</label><input value={f.short_name} maxLength={40} placeholder="TDIU" onChange={(e) => setF({ ...f, short_name: e.target.value })} /></div>
          <div className="grow"><label>Shahar</label><input value={f.city} maxLength={60} onChange={(e) => setF({ ...f, city: e.target.value })} /></div>
        </div>
        <ErrorText error={error} />
        <button className="btn small" style={{ marginTop: 8 }} disabled={f.name.trim().length < 3 || f.short_name.trim().length < 2} onClick={add}>Qo'shish</button>
      </div>
      {rows?.map((u) => (
        <div key={u.id} className="card" style={u.is_active ? undefined : { opacity: 0.5 }}>
          <div className="row between">
            <div className="grow"><b>{u.short_name}</b> <span className="hint">{u.city}</span><div className="hint">{u.name} · {u.students} talaba</div></div>
            <button className="btn small ghost" style={{ width: "auto" }} onClick={() => toggle(u)}>{u.is_active ? "Yashirish" : "Ko'rsatish"}</button>
          </div>
          <Faculties uni={u} onSaved={load} onError={setError} />
        </div>
      ))}
    </div>
  );
}

/** The faculty list students pick from at sign-up: one per line (the university's staff can edit it too). */
function Faculties({ uni, onSaved, onError }: { uni: Row; onSaved: () => void; onError: (e: string) => void }) {
  const [text, setText] = useState((uni.faculties ?? []).join("\n"));
  const [busy, setBusy] = useState(false);
  const list = text.split("\n").map((x) => x.trim()).filter((x) => x.length >= 2);
  async function save() {
    setBusy(true);
    try { await api.admin.editUniversity(uni.id, { faculties: list }); onSaved(); }
    catch (e) { onError(message(e)); }
    finally { setBusy(false); }
  }
  return (
    <details style={{ marginTop: 8 }}>
      <summary className="hint" style={{ cursor: "pointer" }}>Fakultetlar: {(uni.faculties ?? []).length} ta</summary>
      <textarea value={text} rows={Math.min(14, Math.max(4, list.length + 1))} placeholder="Har qatorda bitta fakultet"
                onChange={(e) => setText(e.target.value)} style={{ marginTop: 6 }} />
      <button className="btn small" style={{ marginTop: 6, width: "auto" }} disabled={busy} onClick={save}>{busy ? "Saqlanmoqda…" : "Saqlash"}</button>
    </details>
  );
}
