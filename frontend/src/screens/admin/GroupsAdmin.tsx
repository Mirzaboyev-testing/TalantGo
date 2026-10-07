import { Fragment, useCallback, useEffect, useState } from "react";
import { api, type AdminGroup } from "../../api";
import { ErrorText, message } from "../../ui";

type Msg = { id: number; author: string; text: string; deleted: boolean; created_at: string };

/** All groups: open ones can be read and cleaned; private ones show only size (their messages stay private). */
export default function GroupsAdmin() {
  const [rows, setRows] = useState<AdminGroup[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [error, setError] = useState("");
  const load = useCallback(() => api.admin.groups().then(setRows, (e) => setError(message(e))), []);
  useEffect(() => { void load(); }, [load]);

  async function show(g: AdminGroup) {
    if (open === g.id) return setOpen(null);
    setOpen(g.id);
    setMsgs(g.is_private ? [] : await api.admin.groupMessages(g.id).catch((e) => { setError(message(e)); return []; }));
  }

  async function run(action: () => Promise<unknown>) {
    setError("");
    try { await action(); await load(); } catch (e) { setError(message(e)); }
  }

  return (
    <div className="panel">
      <p className="hint" style={{ marginTop: 0 }}>
        Ochiq guruhlarning xabarlarini ko'rib, keraksizini o'chirasiz. Shaxsiy guruhlar xabarlari faqat a'zolarga ko'rinadi:
        bu yerda faqat nomi va hajmi bor. Shikoyat bo'lsa, guruhni arxivlash mumkin.
      </p>
      <ErrorText error={error} />
      {rows && (
        <div className="table-scroll"><table className="data-table">
          <thead><tr><th>Guruh</th><th>Turi</th><th className="num">A'zolar</th><th className="num">Xabarlar</th><th>Holat</th><th /></tr></thead>
          <tbody>{rows.map((g) => (
            <Fragment key={g.id}>
              <tr>
                <td><a href="#groups" onClick={(e) => { e.preventDefault(); void show(g); }}><b>{g.name}</b></a></td>
                <td>{g.is_official ? "Rasmiy" : g.is_private ? "🔒 Shaxsiy" : "Ochiq"}</td>
                <td className="num">{g.members}</td><td className="num">{g.messages}</td>
                <td>{g.is_archived ? <span className="badge rejected">Arxivda</span> : <span className="badge peer_verified">Faol</span>}</td>
                <td>{!g.is_official && (
                  <button className="btn small ghost" onClick={() => run(() => api.admin.archiveGroup(g.id))}>{g.is_archived ? "Tiklash" : "Arxivlash"}</button>
                )}</td>
              </tr>
              {open === g.id && (
                <tr><td colSpan={6}>
                  {g.is_private ? <div className="hint">Shaxsiy guruh: xabarlar ko'rsatilmaydi.</div> : msgs.length === 0 ? <div className="hint">Xabar yo'q</div> : (
                    msgs.map((m) => (
                      <div key={m.id} className="row between" style={{ padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                        <div className="grow"><b>{m.author}</b> <span className="hint">{new Date(m.created_at).toLocaleString("uz")}</span>
                          <div>{m.deleted ? <i className="hint">o'chirilgan</i> : m.text}</div></div>
                        {!m.deleted && <button className="btn small ghost" onClick={() => run(async () => {
                          await api.admin.deleteGroupMessage(m.id);
                          setMsgs((cur) => cur.map((x) => (x.id === m.id ? { ...x, deleted: true } : x)));
                        })}>O'chirish</button>}
                      </div>
                    ))
                  )}
                </td></tr>
              )}
            </Fragment>
          ))}</tbody>
        </table></div>
      )}
    </div>
  );
}
