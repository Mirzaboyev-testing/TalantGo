// "Postlar" (called "Lenta" until 2026-11-19): the posts of Hamjamiyat (docs/12-talaba-postlar.md, phase 1: text and
// up to 4 images). ?yoz=<kind>&matn=<text> opens the composer prefilled (e.g. "share" on an accepted company task);
// on a phone a round button opens the composer full screen.
// Students, companies and universities post; everyone on the platform reads. A centred column with the composer,
// scope chips and the posts (20 at a time, "Ko'proq yuklash"); on a computer a right column with ideas and rules.
// A link /talaba/hamjamiyat?post=<id> (from a notification) shows that post on top with its comments open.
// UserPosts is the profile's "Faoliyat" block: a person's latest posts.
import { useCallback, useEffect, useRef, useState } from "react";
import { api, type FeedScope, type Me, type Post, type PostInput, type PostKind } from "../../api";
import { t, useLang, type MsgKey } from "../../i18n";
import { Icon } from "../../icons";
import { navigate, useSearch } from "../../router";
import { ErrorText, Sheet, message } from "../../ui";
import PostCard, { type PostPatch } from "./PostCard";
import PostComposer, { type ComposerPreset } from "./PostComposer";
import { KIND_ICON, KindChip, TimeAgo, identityOf, kindsFor } from "./feedKit";

const PAGE = 20;
const FEED_PATH = "/talaba/hamjamiyat";

function scopesFor(me: Me): FeedScope[] {
  if (me.account_type === "student") return ["all", "students", "university", "fields"];
  if (me.account_type === "university") return ["all", "students", "university"];
  return ["all", "students"];
}

const withoutDupes = (rows: Post[]) => rows.filter((p, i) => rows.findIndex((x) => x.id === p.id) === i);

function SkeletonPost() {
  return (
    <div className="fd-card fd-skel" aria-hidden="true">
      <div className="fd-skel-head"><span className="fd-skel-avatar" /><span className="fd-skel-lines"><i /><i /></span></div>
      <i /><i /><i className="short" />
    </div>
  );
}

export default function Feed({ me }: { me: Me }) {
  useLang();
  const scopes = scopesFor(me);
  const [scope, setScope] = useState<FeedScope>("all");
  const [items, setItems] = useState<Post[] | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [preset, setPreset] = useState<ComposerPreset | null>(null);
  const request = useRef(0);

  // a shared or notified post: /talaba/hamjamiyat?post=<id>
  const search = useSearch();
  const focusId = Number(search.post) || null;
  const [focused, setFocused] = useState<Post | null>(null);
  const [focusError, setFocusError] = useState("");
  useEffect(() => {
    setFocused(null); setFocusError("");
    if (!focusId) return;
    let live = true;
    api.feed.post(focusId).then((p) => { if (live) setFocused(p); }, (e) => { if (live) setFocusError(message(e)); });
    return () => { live = false; };
  }, [focusId]);
  const closeFocus = () => navigate(window.location.pathname, { replace: true });

  const load = useCallback(async (s: FeedScope) => {
    const id = ++request.current;
    setItems(null); setNext(null); setError("");
    try {
      const page = await api.feed.list(s, null, PAGE);
      if (id !== request.current) return;
      setItems(page?.items ?? []); setNext(page?.next ?? null);
    } catch (e) { if (id === request.current) setError(message(e)); }
  }, []);
  useEffect(() => { void load(scope); }, [scope, load]);

  async function loadMore() {
    if (!next || loadingMore) return;
    const id = request.current;
    setLoadingMore(true); setError("");
    try {
      const page = await api.feed.list(scope, next, PAGE);
      if (id !== request.current) return;
      setItems((cur) => withoutDupes([...(cur ?? []), ...(page?.items ?? [])]));
      setNext(page?.next ?? null);
    } catch (e) { setError(message(e)); }
    finally { setLoadingMore(false); }
  }

  const patch = useCallback((id: number, p: PostPatch) => {
    const apply = (x: Post) => (x.id === id ? { ...x, ...(typeof p === "function" ? p(x) : p) } : x);
    setItems((cur) => cur?.map(apply) ?? cur);
    setFocused((cur) => (cur ? apply(cur) : cur));
  }, []);
  const replace = useCallback((post: Post) => {
    setItems((cur) => cur?.map((x) => (x.id === post.id ? post : x)) ?? cur);
    setFocused((cur) => (cur?.id === post.id ? post : cur));
  }, []);
  const remove = useCallback((id: number) => {
    setItems((cur) => cur?.filter((x) => x.id !== id) ?? cur);
    setFocused((cur) => (cur?.id === id ? null : cur));
  }, []);

  // the new post shows at once (marked as being posted) and is swapped for the saved one
  const create = useCallback(async (input: PostInput, media: { id: number; url: string }[]) => {
    const who = identityOf(me);
    const tempId = -Date.now();
    const temp: Post = {
      id: tempId, kind: input.kind, text: input.text, media, visibility: input.visibility,
      author: { kind: who.kind, user_id: me.id, name: who.name, photo_url: who.org ? null : who.photo, subtitle: who.subtitle,
                verified: me.account_type === "student" ? me.verification === "verified" : me.account_type === "employer" ? me.company?.status === "approved" : true,
                company_id: me.company?.id ?? null, company_logo: who.kind === "company" ? who.photo : null,
                university_id: (me.staff_university ?? me.university_ref)?.id ?? null },
      created_at: new Date().toISOString(), edited_at: null, reactions: { like: 0, congrats: 0 }, my_reaction: null,
      comments_n: 0, mine: true, status: "visible",
    };
    setItems((cur) => [temp, ...(cur ?? [])]);
    try {
      const saved = await api.feed.create(input);
      setItems((cur) => withoutDupes((cur ?? []).map((x) => (x.id === tempId ? saved : x))));
    } catch (e) {
      setItems((cur) => cur?.filter((x) => x.id !== tempId) ?? cur);
      throw e;
    }
  }, [me]);

  const startPost = (kind?: PostKind, text?: string) => setPreset((p) => ({ kind, text, n: (p?.n ?? 0) + 1 }));
  const org = identityOf(me).org;
  const [phoneComposer, setPhoneComposer] = useState(false);
  const [composerKey, setComposerKey] = useState(0);          // a post from the phone sheet empties the page box too

  // a "share" link from elsewhere in the app: /talaba/hamjamiyat?yoz=achievement&matn=...
  useEffect(() => {
    const kind = search.yoz as PostKind | undefined;
    if (!kind && !search.matn) return;
    startPost(kind && kindsFor(me).includes(kind) ? kind : undefined, search.matn);
    navigate(window.location.pathname, { replace: true });
  }, [search.yoz, search.matn]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = (items ?? []).filter((p) => p.id !== focused?.id);
  const card = (p: Post, extra: { highlight?: boolean; openComments?: boolean } = {}) => (
    <PostCard key={p.id} post={p} me={me} onPatch={patch} onReplace={replace} onRemove={remove} {...extra} />
  );

  return (
    <div className="fd-layout">
      <div className="fd-main">
        {focusId && (
          <section className="fd-focus" aria-label={t("fd.single.title")}>
            <div className="fd-focus-head">
              <b><Icon name="link" size={15} />{t("fd.single.title")}</b>
              <button type="button" className="btn small ghost" onClick={closeFocus}><Icon name="close" size={15} />{t("fd.single.close")}</button>
            </div>
            {focused ? card(focused, { highlight: true, openComments: true })
              : focusError ? <div className="fd-card fd-focus-missing"><Icon name="help" size={20} /><span>{t("fd.single.not_found")}</span></div>
              : <SkeletonPost />}
          </section>
        )}

        <PostComposer key={composerKey} me={me} preset={preset} onCreate={create} />

        <div className="fd-scopes" role="group" aria-label={t("fd.title")}>
          {scopes.map((s) => (
            <button key={s} type="button" aria-pressed={scope === s} className={scope === s ? "on" : ""} onClick={() => setScope(s)}>
              {t(`fd.scope.${s}` as MsgKey)}
            </button>
          ))}
        </div>

        {error && (
          <div className="fd-error">
            <ErrorText error={error} />
            <button type="button" className="btn small ghost" onClick={() => (items ? loadMore() : load(scope))}>{t("fd.retry")}</button>
          </div>
        )}
        {!items && !error && <><SkeletonPost /><SkeletonPost /><SkeletonPost /></>}
        {items && items.length === 0 && (
          <div className="fd-empty">
            <span className="fd-empty-icon"><Icon name="megaphone" size={26} /></span>
            <b>{t(`fd.empty.${scope}` as MsgKey)}</b>
            <span className="hint">{t("fd.empty.hint")}</span>
            <button type="button" className="btn small" onClick={() => startPost()}><Icon name="edit" size={16} />{t("fd.empty.cta")}</button>
          </div>
        )}
        {shown.map((p) => card(p))}
        {items && next && (
          <button type="button" className="btn ghost fd-load-more" disabled={loadingMore} onClick={loadMore}>
            {loadingMore ? t("common.loading") : t("fd.load_more")}
          </button>
        )}
        {items && !next && shown.length > 3 && <div className="fd-end hint">{t("fd.end")}</div>}
      </div>

      {/* phones: one tap to a full-screen composer, wherever the reader is in the list */}
      <button type="button" className="fd-fab" aria-label={t("fd.fab")} onClick={() => setPhoneComposer(true)}>
        <Icon name="edit" size={20} /><span>{t("fd.fab")}</span>
      </button>
      {phoneComposer && (
        <Sheet onClose={() => setPhoneComposer(false)}>
          <PostComposer me={me} autoFocus plain onCreate={async (input, media) => { await create(input, media); setPhoneComposer(false); setComposerKey((k) => k + 1); }} />
        </Sheet>
      )}

      <aside className="fd-side">
        <div className="co-card fd-tips">
          <b>{t("fd.side.title")}</b>
          <p className="hint">{t(org ? "fd.side.sub_org" : "fd.side.sub")}</p>
          {kindsFor(me).map((k) => (
            <button key={k} type="button" className={`fd-tip k-${k}`} onClick={() => startPost(k)}>
              <span className="fd-tip-icon"><Icon name={KIND_ICON[k]} size={17} /></span>
              <span className="fd-tip-text"><b>{t(`fd.tip.${k}` as MsgKey)}</b>
                <small>{t((org && k !== "news" ? `fd.tip.org.${k}_d` : `fd.tip.${k}_d`) as MsgKey)}</small></span>
            </button>
          ))}
        </div>
        <div className="co-card fd-rules">
          <b>{t("fd.rules.title")}</b>
          <ul>
            {(["fd.rules.1", "fd.rules.2", "fd.rules.3", "fd.rules.4"] as const).map((k) => <li key={k}>{t(k)}</li>)}
          </ul>
        </div>
      </aside>
    </div>
  );
}

/**
 * A person's latest posts for the profile's "Faoliyat" section: three short rows that open the post in the feed,
 * and "Hammasi" to the feed. `mine` reads /me/posts (hidden posts included, with their notice).
 * `bare` drops the card and heading when the page already has its own.
 */
export function UserPosts({ userId, mine, bare, limit = 3, feedPath = FEED_PATH }: {
  userId: number; mine?: boolean; bare?: boolean; limit?: number; feedPath?: string;
}) {
  useLang();
  const [rows, setRows] = useState<Post[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    setRows(null); setError("");
    (mine ? api.feed.myPosts(null, limit) : api.feed.userPosts(userId, null, limit))
      .then((page) => { if (live) setRows(page.items.slice(0, limit)); }, (e) => { if (live) setError(message(e)); });
    return () => { live = false; };
  }, [userId, mine, limit]);

  const open = (to: string) => navigate(to);
  const body = (
    <div className="fd-mini-list">
      <ErrorText error={error} />
      {!rows && !error && <div className="fd-mini-skel" aria-hidden="true"><span /><span /></div>}
      {rows?.length === 0 && (
        <div className="fd-mini-empty">
          <span className="hint">{mine ? t("fd.activity.empty_mine") : t("fd.activity.empty")}</span>
          {mine && <button type="button" className="btn small soft" onClick={() => open(feedPath)}><Icon name="edit" size={15} />{t("fd.activity.write")}</button>}
        </div>
      )}
      {rows?.map((p) => (
        <button key={p.id} type="button" className="fd-mini" onClick={() => open(`${feedPath}?post=${p.id}`)}>
          <span className="fd-mini-main">
            <span className="fd-mini-meta">
              <KindChip kind={p.kind} /><span className="hint"><TimeAgo iso={p.created_at} /></span>
              {p.status !== "visible" && <span className="fd-mini-hidden"><Icon name="eye" size={12} /></span>}
            </span>
            {p.text && <span className="fd-mini-text">{p.text}</span>}
            <span className="fd-mini-stats">
              <span><Icon name="heart" size={13} />{p.reactions.like + p.reactions.congrats}</span>
              <span><Icon name="chat" size={13} />{p.comments_n}</span>
            </span>
          </span>
          {p.media[0] && <img className="fd-mini-thumb" src={p.media[0].url} alt="" loading="lazy" />}
        </button>
      ))}
    </div>
  );
  if (bare) return body;
  return (
    <div className="co-card fd-activity">
      <div className="co-card-head">
        <b>{t("fd.activity")}</b>
        <a href={feedPath} onClick={(e) => { e.preventDefault(); open(feedPath); }}>{t("fd.activity.all")}</a>
      </div>
      {body}
    </div>
  );
}
