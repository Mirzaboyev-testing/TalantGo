// The comments under a post (posts feed, docs/12-talaba-postlar.md): oldest first, one level of replies shown
// indented under their comment, delete where allowed, report for others' comments, and the input
// (Enter sends on a computer, Shift+Enter starts a new line).
import { useEffect, useMemo, useRef, useState } from "react";
import { api, type PostComment } from "../../api";
import { t, useLang } from "../../i18n";
import { Icon } from "../../icons";
import { ask } from "../../tg";
import { ErrorText, autoGrow, message, sendsOnEnter, toast } from "../../ui";
import { AuthorAvatar, ReportSheet, TimeAgo, Verified, linkify } from "./feedKit";

const MAX_COMMENT = 1000;

/** Top-level comments, each with its replies (a reply to a reply sits under the same top comment). */
function threadsOf(rows: PostComment[]): { root: PostComment; replies: PostComment[] }[] {
  const byId = new Map(rows.map((c) => [c.id, c]));
  const rootOf = (c: PostComment): PostComment => {
    let cur = c;
    for (let hops = 0; cur.parent_id && byId.has(cur.parent_id) && hops < 20; hops += 1) cur = byId.get(cur.parent_id)!;
    return cur;
  };
  const threads = new Map<number, { root: PostComment; replies: PostComment[] }>();
  for (const c of rows) {
    const root = rootOf(c);
    if (!threads.has(root.id)) threads.set(root.id, { root, replies: [] });
    if (root.id !== c.id) threads.get(root.id)!.replies.push(c);
  }
  return [...threads.values()];
}

export default function PostComments({ postId, onCount }: { postId: number; onCount: (delta: number) => void }) {
  useLang();
  const [rows, setRows] = useState<PostComment[] | null>(null);
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<{ id: number; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [reporting, setReporting] = useState<number | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let live = true;
    api.feed.comments(postId).then((r) => live && setRows(r ?? []), (e) => live && setError(message(e)));
    return () => { live = false; };
  }, [postId]);
  const threads = useMemo(() => threadsOf(rows ?? []), [rows]);

  function startReply(rootId: number, name: string) {
    setReplyTo({ id: rootId, name });
    box.current?.focus();
  }

  async function send() {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true); setError("");
    try {
      const c = await api.feed.comment(postId, body, replyTo?.id);
      setRows((cur) => [...(cur ?? []), c]);
      setText(""); setReplyTo(null);
      if (box.current) box.current.style.height = "";
      onCount(1);
    } catch (e) { setError(message(e)); }
    finally { setBusy(false); }
  }

  async function remove(c: PostComment) {
    if (!(await ask(t("fd.cm.delete_confirm")))) return;
    try {
      await api.feed.removeComment(c.id);
      // a top comment takes its replies with it
      const thread = threads.find((th) => th.root.id === c.id);
      const gone = new Set([c.id, ...(thread?.replies ?? []).map((x) => x.id)]);
      setRows((cur) => cur?.filter((x) => !gone.has(x.id)) ?? cur);
      onCount(-gone.size);
    } catch (e) { toast(message(e), "error"); }
  }

  const item = (c: PostComment, rootId: number, reply: boolean) => (
    <div key={c.id} className={`fd-cm ${reply ? "reply" : ""}`}>
      <AuthorAvatar author={c.author} className="fd-cm-avatar" />
      <div className="fd-cm-body">
        <div className="fd-cm-bubble">
          <div className="fd-cm-head">
            <b className="fd-cm-name">{c.author.name}</b>{c.author.verified && <Verified />}
            <span className="fd-cm-time"><TimeAgo iso={c.created_at} /></span>
          </div>
          {c.author.subtitle && <div className="fd-cm-sub">{c.author.subtitle}</div>}
          <div className="fd-cm-text">{linkify(c.text)}</div>
        </div>
        <div className="fd-cm-actions">
          <button type="button" onClick={() => startReply(rootId, c.author.name)}>{t("fd.cm.reply")}</button>
          {c.can_delete && <button type="button" onClick={() => remove(c)}>{t("fd.cm.delete")}</button>}
          {!c.mine && <button type="button" onClick={() => setReporting(c.id)}>{t("fd.cm.report")}</button>}
        </div>
      </div>
    </div>
  );

  return (
    <div className="fd-comments">
      {!rows && !error && <div className="fd-cm-skeleton"><span /><span /></div>}
      {rows && rows.length === 0 && <div className="hint fd-cm-empty">{t("fd.cm.empty")}</div>}
      {threads.map(({ root, replies }) => (
        <div key={root.id} className="fd-thread">
          {item(root, root.id, false)}
          {replies.map((r) => item(r, root.id, true))}
        </div>
      ))}
      <div className="fd-cm-input">
        {replyTo && (
          <div className="fd-replying">
            <span className="ellipsis">{t("fd.cm.replying", { name: replyTo.name })}</span>
            <button type="button" aria-label={t("fd.cm.cancel_reply")} title={t("fd.cm.cancel_reply")} onClick={() => setReplyTo(null)}><Icon name="close" size={14} /></button>
          </div>
        )}
        <div className="fd-cm-row">
          <textarea ref={box} rows={1} value={text} maxLength={MAX_COMMENT} placeholder={replyTo ? t("fd.cm.reply_ph") : t("fd.cm.ph")}
                    aria-label={replyTo ? t("fd.cm.reply_ph") : t("fd.cm.ph")}
                    onChange={(e) => { setText(e.target.value); autoGrow(e.target); }}
                    onKeyDown={(e) => { if (sendsOnEnter(e)) { e.preventDefault(); void send(); } }} />
          <button type="button" className="fd-send" disabled={!text.trim() || busy} aria-label={t("fd.cm.send")} title={t("fd.cm.send")} onClick={send}>
            <Icon name="send" size={18} />
          </button>
        </div>
        <ErrorText error={error} />
      </div>
      {reporting !== null && <ReportSheet target={{ kind: "comment", id: reporting }} onClose={() => setReporting(null)} />}
    </div>
  );
}
