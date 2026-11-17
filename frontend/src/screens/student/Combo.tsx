// A searchable picker: type to filter, or open it and pick from the list below. Used for the university
// (with Latin/Cyrillic and old-name aliases) and for a long faculty list. Keyboard: ↑ ↓ Enter Esc.
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import type { University } from "../../api";
import { t, useLang } from "../../i18n";
import { Icon } from "../../icons";

export interface ComboItem { value: string; label: string; hint?: string; keys?: string }

const CYR: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", ғ: "g", д: "d", е: "e", ё: "yo", ж: "j", з: "z", и: "i", й: "y", к: "k", қ: "q",
  л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ў: "o", ф: "f", х: "x", ҳ: "h", ц: "s",
  ч: "ch", ш: "sh", щ: "sh", ъ: "", ы: "i", ь: "", э: "e", ю: "yu", я: "ya",
};

/** Lower case, Cyrillic spelled in Latin, apostrophes and punctuation dropped: "ТАТУ", "tatu", "Tatu'" all match. */
export function normalize(text: string): string {
  return text.toLowerCase().split("").map((ch) => CYR[ch] ?? ch).join("")
    .replace(/[ʻʼ'`’‘"«»]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

// names students actually type for a university: the Russian abbreviation, the English one, the old name
const UNI_ALIASES: Record<string, string> = {
  TATU: "tuit туит тату ait axborot texnologiyalari",
  TDIU: "tgeu тгэу tsue iqtisodiyot",
  "O'zMU": "nuuz нууз milliy universitet national university",
  TDTU: "tstu тгту texnika politexnika",
  JIDU: "uwed уммд diplomatiya",
  TDYU: "tsul тгюу yuridik",
  "O'zDJTU": "uzswlu уздмту jahon tillari",
  TDPU: "tdpu тгпу pedagogika ozmpu npuu milliy pedagogika",
  TDShU: "tsuos тгуво sharqshunoslik",
  BMA: "bfa банковско финансовая bank moliya",
  WIUT: "westminster вестминстер",
  IUT: "inha инха",
  TTPU: "turin турин politexnika",
  NewUU: "new uzbekistan university yangi",
  CAU: "central asian",
  SamDU: "samgu самгу samarqand",
  BuxDU: "bukhara бухара buxoro",
  FarDU: "fergana фергана",
  AnDU: "andijan андижан",
  NamDU: "namangan наманган",
  QarDU: "karshi карши",
  UrDU: "urgench ургенч",
  QDU: "karakalpak каракалпак nukus",
};

// with an empty search the best-known universities (those with a faculty list) come first, then the rest A–Z
export const uniItems = (unis: University[]): ComboItem[] => [...unis].sort((a, b) =>
  Number(Boolean(b.faculties?.length)) - Number(Boolean(a.faculties?.length)) || a.name.localeCompare(b.name)).map((u) => ({
  value: String(u.id),
  // a real abbreviation goes first ("TATU · ..."); universities without one carry a cut name there
  label: u.short_name && u.short_name !== u.name && u.short_name.length <= 16 ? `${u.short_name} · ${u.name}` : u.name,
  hint: u.city,
  keys: UNI_ALIASES[u.short_name] ?? "",
}));

/** The matched part of `label` in bold (on the normalized text, so "tatu" finds "TATU"). */
function Highlight({ label, query }: { label: string; query: string }): ReactNode {
  const q = query.trim().toLowerCase();
  if (!q) return label;
  const at = label.toLowerCase().indexOf(q);
  if (at < 0) return label;
  return <>{label.slice(0, at)}<mark>{label.slice(at, at + q.length)}</mark>{label.slice(at + q.length)}</>;
}

export default function Combo({ id, items, value, customValue = "", onChange, placeholder, customLabel, invalid, limit = 8,
                                icon = "search" }: {
  id: string; items: ComboItem[]; value: string; customValue?: string;
  /** a picked item, or (custom = true) the typed text when the list has no match */
  onChange: (value: string, custom: boolean) => void;
  placeholder?: string; customLabel?: (q: string) => string; invalid?: boolean; limit?: number;
  icon?: "search" | "school";
}) {
  useLang();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const selected = items.find((i) => i.value === value);
  const shown = selected?.label ?? customValue;

  const matches = useMemo(() => {
    const q = normalize(query);
    if (!q) return items.slice(0, limit);
    const words = q.split(" ");
    const scored = items.map((item) => {
      const hay = normalize(`${item.label} ${item.hint ?? ""} ${item.keys ?? ""}`);
      if (!words.every((w) => hay.includes(w))) return null;
      // the short name or the start of the name first
      const head = normalize(item.label);
      return { item, rank: head.startsWith(q) ? 0 : hay.split(" ").some((w) => w.startsWith(words[0])) ? 1 : 2 };
    }).filter((x): x is { item: ComboItem; rank: number } => x !== null);
    return scored.sort((a, b) => a.rank - b.rank).slice(0, limit).map((x) => x.item);
  }, [items, query, limit]);
  const canAdd = Boolean(customLabel) && query.trim().length >= 2;
  const options = matches.length + (canAdd ? 1 : 0);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  useEffect(() => setActive(0), [query]);

  function pick(index: number) {
    if (index < matches.length) onChange(matches[index].value, false);
    else if (canAdd) onChange(query.trim().replace(/\s+/g, " "), true);
    setOpen(false);
    setQuery("");
    input.current?.blur();
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, options - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter" && open && options > 0) { e.preventDefault(); pick(active); }
    else if (e.key === "Escape") { setOpen(false); setQuery(""); }
  }

  return (
    <div ref={box} className={`st-combo ${open ? "open" : ""}`}>
      <div className={`st-combo-field ${invalid ? "invalid" : ""}`}>
        <Icon name={icon} size={18} />
        <input id={id} ref={input} role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list"
               autoComplete="off" value={open ? query : shown} placeholder={open && shown ? shown : placeholder}
               onFocus={() => { setOpen(true); setQuery(""); }} onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
               onKeyDown={onKey} />
        {shown && !open && <span className="st-combo-ok"><Icon name="tick" size={16} /></span>}
        <span className="st-combo-caret" aria-hidden="true">▾</span>
      </div>
      {open && (
        <ul id={listId} role="listbox" className="st-combo-list">
          {matches.map((item, i) => (
            <li key={item.value} role="option" aria-selected={item.value === value}
                className={`${i === active ? "active" : ""} ${item.value === value ? "chosen" : ""}`}
                onMouseEnter={() => setActive(i)} onMouseDown={(e) => { e.preventDefault(); pick(i); }}>
              <span className="st-combo-label"><Highlight label={item.label} query={query} /></span>
              {item.hint && <span className="st-combo-hint">{item.hint}</span>}
            </li>
          ))}
          {matches.length === 0 && !canAdd && <li className="st-combo-empty">{t("st.combo.nothing")}</li>}
          {canAdd && (
            <li role="option" aria-selected={false} className={`st-combo-add ${active === matches.length ? "active" : ""}`}
                onMouseEnter={() => setActive(matches.length)} onMouseDown={(e) => { e.preventDefault(); pick(matches.length); }}>
              <Icon name="plus" size={16} />{customLabel!(query.trim())}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
