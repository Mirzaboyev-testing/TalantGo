import { useCallback, useEffect, useState } from "react";
import { api, uzDate, type AdminChallenge } from "../../api";
import { ErrorText, message } from "../../ui";

/** Every mentor's challenges; archiving hides one from students. */
export default function ChallengesAdmin() {
  const [rows, setRows] = useState<AdminChallenge[] | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => api.admin.challenges().then(setRows, (e) => setError(message(e))), []);
  useEffect(() => { void load(); }, [load]);
  const now = Date.now();

  return (
    <div className="panel">
      <p className="hint" style={{ marginTop: 0 }}>Chellenjlarni mentorlar ilovadagi «Mentor» bo'limidan tashkil qiladi. Bu yerda hammasini ko'rasiz va kerak bo'lsa arxivlaysiz.</p>
      <ErrorText error={error} />
      {rows?.length === 0 && <div className="hint">Hali chellenj yo'q</div>}
      {rows && rows.length > 0 && (
        <div className="table-scroll"><table className="data-table">
          <thead><tr><th>Chellenj</th><th>Kimlar uchun</th><th>Mentor</th><th className="num">Ishtirokchi</th><th>Muddat</th><th>Holat</th><th /></tr></thead>
          <tbody>{rows.map((c) => {
            const state = c.is_archived ? ["Arxivda", "rejected"] : new Date(c.ends_at).getTime() < now ? ["Tugagan", "todo"] : ["Faol", "peer_verified"];
            return (
              <tr key={c.id}>
                <td><b>{c.title}</b>{c.prize && <div className="hint">Sovrin: {c.prize}</div>}</td>
                <td>{c.track.split(":")[0]}</td><td>{c.mentor ?? "—"}</td><td className="num">{c.entries}</td>
                <td>{uzDate(c.starts_at)} – {uzDate(c.ends_at)}</td>
                <td><span className={`badge ${state[1]}`}>{state[0]}</span></td>
                <td><button className="btn small ghost" onClick={() => api.admin.archiveChallenge(c.id).then(load, (e) => setError(message(e)))}>
                  {c.is_archived ? "Tiklash" : "Arxivlash"}</button></td>
              </tr>
            );
          })}</tbody>
        </table></div>
      )}
    </div>
  );
}
