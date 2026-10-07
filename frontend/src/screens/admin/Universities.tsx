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
        <div key={u.id} className="card row between" style={u.is_active ? undefined : { opacity: 0.5 }}>
          <div className="grow"><b>{u.short_name}</b> <span className="hint">{u.city}</span><div className="hint">{u.name} · {u.students} talaba</div></div>
          <button className="btn small ghost" onClick={() => toggle(u)}>{u.is_active ? "Yashirish" : "Ko'rsatish"}</button>
        </div>
      ))}
    </div>
  );
}
