import { t } from "../i18n";
import { Icon } from "../icons";
import type { Panel } from "./panels";

// Pictures for the public home page, drawn in code: sharp at any size, translated, nothing to download.
// Colours follow the brand greens with one warm accent.
const G = { brand: "#16a34a", strong: "#15803d", ink: "#14532d", mint: "#bbf7d0", leaf: "#86efac", line: "#e1ebe4", pale: "#f1f7f3", sun: "#f59e0b" };

/** Hero picture: a student's profile on a phone with the three things the platform confirms around it. */
export function HeroArt() {
  return (
    <div className="hero-art" aria-hidden="true">
      <div className="art-glow" />
      <div className="art-phone">
        <div className="art-notch" />
        <div className="art-profile">
          <span className="art-avatar"><Icon name="user" size={22} /></span>
          <div className="grow"><i className="art-line w70" /><i className="art-line w45 light" /></div>
        </div>
        <div className="art-badge"><Icon name="verified" size={16} />{t("pub.art.cv")}</div>
        <div className="art-label"><span>{t("pub.art.path")}</span><b>72%</b></div>
        <div className="art-progress"><span /></div>
        <div className="art-chips"><span>Python</span><span>SQL</span><span>Excel</span></div>
        <div className="art-week">{[38, 62, 48, 80, 66, 92, 74].map((h, i) => <span key={i} style={{ height: `${h}%` }} />)}</div>
        <div className="art-tasks">
          {[true, true, false].map((done, i) => (
            <div key={i} className="art-task">
              <span className={done ? "done" : ""}>{done && <Icon name="tick" size={12} />}</span>
              <i className={`art-line ${i === 1 ? "w55" : "w70"}`} />
            </div>
          ))}
        </div>
      </div>
      <Float className="f1" icon="verified" title={t("pub.art.task_ok")} sub={t("pub.art.task_ok_sub")} />
      <Float className="f2" icon="briefcase" title={t("pub.art.offer")} sub={t("pub.art.offer_sub")} />
      <Float className="f3" icon="building" title={t("pub.art.uni_ok")} />
    </div>
  );
}

function Float({ className, icon, title, sub }: { className: string; icon: string; title: string; sub?: string }) {
  return (
    <div className={`art-float ${className}`}>
      <span className="art-ic"><Icon name={icon} size={18} /></span>
      <div><b>{title}</b>{sub && <small>{sub}</small>}</div>
    </div>
  );
}

/** University block picture: a placement chart and a ranking, illustrative only (no real figures). */
export function UniversityArt() {
  return (
    <div className="uni-art" aria-hidden="true">
      <div className="art-glow" />
      <div className="uni-art-card main">
        <div className="row between"><b>{t("pub.uni.art.title")}</b><span className="art-ic small"><Icon name="chart" size={16} /></span></div>
        <div className="uni-art-bar"><span className="s1" /><span className="s2" /><span className="s3" /></div>
        <div className="uni-art-legend">
          <span><i className="s1" />{t("emp.working")}</span>
          <span><i className="s2" />{t("emp.interned")}</span>
        </div>
        <div className="uni-art-cols">
          {[46, 68, 54, 82, 74, 92].map((h, i) => <span key={i} style={{ height: `${h}%` }} />)}
        </div>
      </div>
      <div className="uni-art-card board">
        <b>{t("pub.nav.ranking")}</b>
        {[88, 70, 56].map((w, i) => (
          <div key={i} className="uni-art-rank">
            <span className={`place p${i + 1}`}>{i + 1}</span>
            <i className="art-line" style={{ width: `${w}%` }} />
          </div>
        ))}
      </div>
      <div className="art-float f4">
        <span className="art-ic"><Icon name="verified" size={18} /></span>
        <div><b>{t("pub.uni.art.badge")}</b></div>
      </div>
    </div>
  );
}

/** A small scene on top of each panel card. */
export function PanelArt({ panel }: { panel: Panel }) {
  return (
    <svg className="panel-art" viewBox="0 0 320 168" role="img" aria-hidden="true">
      <ellipse cx="166" cy="144" rx="138" ry="7" fill={G.ink} opacity=".08" />
      {panel === "talaba" ? <StudentScene /> : panel === "korxona" ? <CompanyScene /> : <UniversityScene />}
    </svg>
  );
}

function Spark({ x, y, r, fill }: { x: number; y: number; r: number; fill: string }) {
  return <path d={`M${x} ${y - r}Q${x} ${y} ${x + r} ${y}Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}Q${x} ${y} ${x} ${y - r}Z`} fill={fill} />;
}

function Tick({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return (
    <>
      <circle cx={cx} cy={cy} r={r} fill={G.brand} />
      <path d={`M${cx - r * .45} ${cy}l${r * .32} ${r * .32} ${r * .6}-${r * .62}`} stroke="#fff" strokeWidth={r * .26} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </>
  );
}

function StudentScene() {
  return (
    <g>
      {/* plant */}
      <path d="M22 70c-8-10-6-24 4-30 4 12 2 22-4 30Z" fill={G.leaf} />
      <path d="M26 84c10-6 22-4 26 6-12 4-20 2-26-6Z" fill={G.brand} />
      <path d="M24 92c-6-14 0-28 14-32 2 14-4 26-14 32Z" fill={G.strong} />
      <path d="M14 104h28l-4 30H18z" fill={G.sun} />
      {/* laptop */}
      <rect x="64" y="34" width="140" height="90" rx="8" fill={G.ink} />
      <rect x="71" y="41" width="126" height="76" rx="4" fill="#fff" />
      <rect x="79" y="49" width="44" height="6" rx="3" fill={G.mint} />
      <circle cx="183" cy="52" r="3" fill={G.line} />
      <circle cx="173" cy="52" r="3" fill={G.line} />
      {[64, 82, 100].map((y, i) => (
        <g key={y}>
          {i < 2 ? <Tick cx={85} cy={y + 3} r={5.5} /> : <circle cx="85" cy={y + 3} r="5" fill="#fff" stroke={G.brand} strokeWidth="1.6" />}
          <rect x="96" y={y} width={i === 1 ? 62 : 80} height="6" rx="3" fill={G.line} />
          <rect x="96" y={y + 9} width="44" height="3.5" rx="1.75" fill={G.pale} />
        </g>
      ))}
      <rect x="48" y="124" width="172" height="9" rx="4.5" fill={G.strong} />
      <rect x="118" y="124" width="32" height="3" rx="1.5" fill={G.ink} />
      {/* books with a graduation cap on top */}
      <rect x="226" y="119" width="74" height="14" rx="3" fill={G.ink} />
      <rect x="232" y="105" width="62" height="14" rx="3" fill={G.brand} />
      <rect x="228" y="91" width="58" height="14" rx="3" fill={G.sun} />
      <rect x="236" y="125" width="52" height="2" rx="1" fill="#fff" opacity=".35" />
      <rect x="240" y="111" width="44" height="2" rx="1" fill="#fff" opacity=".45" />
      <rect x="236" y="97" width="40" height="2" rx="1" fill="#fff" opacity=".5" />
      <path d="M243 76v9c7 5 25 5 32 0v-9l-16 6z" fill={G.strong} />
      <path d="M231 70l28-10 28 10-28 10z" fill={G.ink} />
      <path d="M281 72v16" stroke={G.sun} strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="281" cy="90" r="3" fill={G.sun} />
      {/* confirmed */}
      <circle cx="204" cy="36" r="20" fill="#fff" />
      <Tick cx={204} cy={36} r={16} />
      <Spark x={52} y={26} r={7} fill={G.brand} />
      <Spark x={300} y={40} r={6} fill={G.sun} />
      <Spark x={246} y={36} r={4} fill={G.leaf} />
    </g>
  );
}

function Person({ cx, cy, on }: { cx: number; cy: number; on?: boolean }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r="9" fill={on ? G.brand : G.mint} />
      <circle cx={cx} cy={cy - 2.5} r="3.2" fill={on ? "#fff" : G.strong} />
      <path d={`M${cx - 5.5} ${cy + 6}a5.5 5 0 0 1 11 0`} fill={on ? "#fff" : G.strong} />
    </g>
  );
}

function CompanyScene() {
  return (
    <g>
      {/* growth bars */}
      <rect x="18" y="114" width="10" height="22" rx="3" fill={G.leaf} />
      <rect x="32" y="100" width="10" height="36" rx="3" fill={G.brand} />
      <rect x="46" y="84" width="10" height="52" rx="3" fill={G.ink} />
      <path d="M16 92l14-12 10 6 16-16" stroke={G.sun} strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M50 68h7v7" stroke={G.sun} strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {/* candidates board */}
      <rect x="66" y="24" width="150" height="114" rx="10" fill="#fff" stroke={G.line} strokeWidth="2" />
      <rect x="78" y="36" width="60" height="7" rx="3.5" fill={G.ink} />
      <circle cx="200" cy="39.5" r="3.5" fill={G.line} />
      <rect x="72" y="74" width="138" height="24" rx="8" fill="#eaf7ef" stroke={G.brand} strokeWidth="1.6" />
      {[58, 86, 114].map((y, i) => (
        <g key={y}>
          <Person cx={90} cy={y} on={i === 1} />
          <rect x="106" y={y - 6} width={i === 1 ? 64 : 56} height="6" rx="3" fill={i === 1 ? G.mint : G.line} />
          <rect x="106" y={y + 3} width="38" height="3.5" rx="1.75" fill={G.pale} />
          {i === 1 ? <Tick cx={194} cy={y} r={7.5} /> : <rect x="184" y={y - 4} width="20" height="8" rx="4" fill={G.pale} />}
        </g>
      ))}
      {/* magnifier */}
      <circle cx="212" cy="116" r="19" fill="#fff" fillOpacity=".75" stroke={G.ink} strokeWidth="6" />
      <path d="M226 130l16 16" stroke={G.ink} strokeWidth="9" strokeLinecap="round" />
      {/* briefcase */}
      <path d="M254 42v-6a4 4 0 0 1 4-4h16a4 4 0 0 1 4 4v6" stroke={G.ink} strokeWidth="4" fill="none" />
      <rect x="234" y="42" width="64" height="46" rx="7" fill={G.brand} />
      <rect x="234" y="58" width="64" height="4" fill={G.strong} />
      <rect x="261" y="55" width="10" height="10" rx="2" fill={G.sun} />
      <Spark x={300} y={108} r={6} fill={G.leaf} />
      <Spark x={240} y={22} r={5} fill={G.sun} />
    </g>
  );
}

function UniversityScene() {
  return (
    <g>
      {/* flag */}
      <path d="M160 26V6" stroke={G.ink} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M160 6h22l-5 5.5 5 5.5h-22z" fill={G.brand} />
      {/* building */}
      <path d="M70 62L160 24l90 38z" fill={G.ink} />
      <circle cx="160" cy="48" r="7" fill={G.sun} />
      <rect x="76" y="62" width="168" height="10" fill={G.strong} />
      {[88, 118, 186, 216].map((x) => (
        <g key={x}>
          <rect x={x} y="74" width="16" height="50" fill="#fff" />
          <rect x={x + 10} y="74" width="6" height="50" fill="#dcefe3" />
        </g>
      ))}
      <path d="M148 124V100a12 12 0 0 1 24 0v24z" fill={G.brand} />
      <rect x="72" y="124" width="176" height="8" fill={G.strong} />
      <rect x="64" y="132" width="192" height="8" rx="2" fill={G.ink} />
      {/* tossed cap */}
      <g transform="rotate(-16 40 40)">
        <path d="M24 44v7c6 4 20 4 26 0v-7l-13 5z" fill={G.strong} />
        <path d="M14 39l23-8 23 8-23 8z" fill={G.ink} />
        <path d="M55 41v12" stroke={G.sun} strokeWidth="2" strokeLinecap="round" />
      </g>
      {/* results card */}
      <rect x="262" y="72" width="48" height="60" rx="8" fill="#fff" stroke={G.line} strokeWidth="2" />
      <rect x="271" y="106" width="8" height="16" rx="2" fill={G.leaf} />
      <rect x="282" y="96" width="8" height="26" rx="2" fill={G.brand} />
      <rect x="293" y="84" width="8" height="38" rx="2" fill={G.ink} />
      <Spark x={30} y={110} r={6} fill={G.brand} />
      <Spark x={290} y={44} r={7} fill={G.sun} />
      <Spark x={110} y={30} r={4} fill={G.leaf} />
    </g>
  );
}
