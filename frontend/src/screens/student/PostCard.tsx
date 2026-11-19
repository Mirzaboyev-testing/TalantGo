// One post in the feed (docs/12-talaba-postlar.md): author, time and kind, the text with "Ko'proq", 1–4 images,
// "Yoqdi" / "Tabriklayman" (one reaction per person; tapping the other one switches), the comments panel and
// the "⋯" menu: edit or delete one's own post, report someone else's.
import { useCallback, useRef, useState } from "react";
import { api, type Me, type Post, type ReactionKind } from "../../api";
import { t, useLang } from "../../i18n";
import { Icon } from "../../icons";
import { ask, haptic } from "../../tg";
import { Sheet, message, toast } from "../../ui";
import PostComments from "./PostComments";
import PostComposer from "./PostComposer";
import { AuthorAvatar, KindChip, OverflowMenu, PostMedia, PostText, ReportSheet, SheetHead, TimeAgo, Verified, type MenuItem } from "./feedKit";

export type PostPatch = Partial<Post> | ((p: Post) => Partial<Post>);

export default function PostCard({ post, me, onPatch, onReplace, onRemove, highlight, openComments }: {
  post: Post;
  me: Me;
  onPatch: (id: number, patch: PostPatch) => void;
  onReplace: (post: Post) => void;
  onRemove: (id: number) => void;
  highlight?: boolean;
  openComments?: boolean;
}) {
  useLang();
  const [comments, setComments] = useState(Boolean(openComments));
  const [editing, setEditing] = useState(false);
  const [reporting, setReporting] = useState(false);
  const reacting = useRef(false);
  const pending = post.id < 0;            // shown at once, not saved yet
  const a = post.author;

  async function react(kind: ReactionKind) {
    if (pending || reacting.current) return;
    reacting.current = true;
    const before = { reactions: post.reactions, my_reaction: post.my_reaction };
    const counts = { ...post.reactions };
    if (post.my_reaction) counts[post.my_reaction] = Math.max(0, counts[post.my_reaction] - 1);
    const mine = post.my_reaction === kind ? null : kind;
    if (mine) counts[mine] += 1;
    onPatch(post.id, { reactions: counts, my_reaction: mine });
    haptic("light");
    try {
      const r = mine ? await api.feed.react(post.id, mine) : await api.feed.unreact(post.id);
      if (r?.reactions) onPatch(post.id, { reactions: r.reactions, my_reaction: r.my_reaction });
    } catch (e) {
      onPatch(post.id, before);
      toast(message(e), "error");
    } finally { reacting.current = false; }
  }

  async function remove() {
    if (!(await ask(t("fd.delete_confirm")))) return;
    try {
      await api.feed.remove(post.id);
      onRemove(post.id);
      toast(t("fd.deleted"));
    } catch (e) { toast(message(e), "error"); }
  }

  const onCount = useCallback((d: number) => onPatch(post.id, (p) => ({ comments_n: Math.max(0, p.comments_n + d) })), [onPatch, post.id]);
  const closeEdit = useCallback(() => setEditing(false), []);
  const menu: MenuItem[] = post.mine
    ? [{ label: t("fd.edit"), icon: "edit", onClick: () => setEditing(true) },
       { label: t("fd.delete"), icon: "trash", onClick: remove, danger: true }]
    : [{ label: t("fd.report"), icon: "flag", onClick: () => setReporting(true) }];
  const { like, congrats } = post.reactions;

  return (
    <article className={`fd-card ${pending ? "pending" : ""} ${highlight ? "highlight" : ""}`} aria-busy={pending || undefined}>
      {post.mine && post.status !== "visible" && (
        <div className="fd-notice"><Icon name="eye" size={16} /><span>{post.status === "hidden" ? t("fd.hidden_notice") : t("fd.removed_notice")}</span></div>
      )}
      <header className="fd-head">
        <AuthorAvatar author={a} className="fd-avatar" />
        <div className="fd-who">
          <div className="fd-name"><b>{a.name}</b>{a.verified && <Verified />}</div>
          {a.subtitle && <div className="fd-sub">{a.subtitle}</div>}
          <div className="fd-meta">
            {pending ? <span>{t("fd.pending")}</span> : <TimeAgo iso={post.created_at} />}
            {post.edited_at && <span>· {t("fd.edited")}</span>}
            {post.visibility === "university" && <span className="fd-vis"><Icon name="lock" size={12} />{t("fd.vis_university")}</span>}
          </div>
        </div>
        {!pending && <OverflowMenu items={menu} label={t("fd.menu")} />}
      </header>

      <div className="fd-kind-row"><KindChip kind={post.kind} /></div>
      {post.text && <PostText text={post.text} />}
      <PostMedia media={post.media} />

      <footer className="fd-actions">
        <button type="button" className={`fd-act like ${post.my_reaction === "like" ? "on" : ""}`} aria-pressed={post.my_reaction === "like"}
                disabled={pending} onClick={() => react("like")} title={t("fd.likes_n", { n: like })}>
          <Icon name="heart" size={18} /><span className="fd-act-label">{t("fd.like")}{like > 0 && <span className="fd-act-n">{like}</span>}</span>
        </button>
        <button type="button" className={`fd-act congrats ${post.my_reaction === "congrats" ? "on" : ""}`} aria-pressed={post.my_reaction === "congrats"}
                disabled={pending} onClick={() => react("congrats")} title={t("fd.congrats_n", { n: congrats })}>
          <Icon name="spark" size={18} /><span className="fd-act-label">{t("fd.congrats")}{congrats > 0 && <span className="fd-act-n">{congrats}</span>}</span>
        </button>
        <button type="button" className={`fd-act ${comments ? "on" : ""}`} aria-expanded={comments} disabled={pending}
                onClick={() => setComments((c) => !c)}>
          <Icon name="chat" size={18} /><span className="fd-act-label">{post.comments_n > 0 ? t("fd.comments_n", { n: post.comments_n }) : t("fd.comments")}</span>
        </button>
      </footer>

      {comments && !pending && <PostComments postId={post.id} onCount={onCount} />}

      {editing && (
        <Sheet onClose={closeEdit}>
          <SheetHead title={t("fd.edit.title")} onClose={closeEdit} />
          <PostComposer me={me} editing={post} onCancel={closeEdit} onSaved={(p) => { onReplace(p); setEditing(false); }} />
        </Sheet>
      )}
      {reporting && <ReportSheet target={{ kind: "post", id: post.id }} onClose={() => setReporting(false)} onSent={() => onRemove(post.id)} />}
    </article>
  );
}
