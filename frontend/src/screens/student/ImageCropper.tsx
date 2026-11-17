// Crops a picked photo before upload: drag to move, slider to zoom. The profile photo is square (512 px),
// the cover 4:1 (1584×396, LinkedIn's size). The result is a JPEG uploaded like any other file.
import { useEffect, useRef, useState } from "react";
import { api, type SubmittedFile } from "../../api";
import { t, useLang } from "../../i18n";
import { ErrorText, Sheet, message } from "../../ui";

export default function ImageCropper({ file, aspect, outWidth, round = false, onDone, onClose }: {
  file: File; aspect: number; outWidth: number; round?: boolean;
  onDone: (uploaded: SubmittedFile) => Promise<void> | void; onClose: () => void;
}) {
  useLang();
  const [src, setSrc] = useState("");
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });          // offset of the image centre from the frame centre, in frame px
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    const im = new Image();
    im.onload = () => setImg(im);
    im.onerror = () => setError(t("st.crop.bad_image"));
    im.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // the image covers the frame at zoom 1; returns its drawn size and the allowed offset
  const geometry = () => {
    const box = frame.current?.getBoundingClientRect();
    if (!img || !box) return null;
    const cover = Math.max(box.width / img.width, box.height / img.height) * zoom;
    const w = img.width * cover, h = img.height * cover;
    return { box, w, h, maxX: (w - box.width) / 2, maxY: (h - box.height) / 2, scale: cover };
  };
  const clamp = (x: number, y: number) => {
    const g = geometry();
    if (!g) return { x, y };
    return { x: Math.max(-g.maxX, Math.min(g.maxX, x)), y: Math.max(-g.maxY, Math.min(g.maxY, y)) };
  };
  useEffect(() => { setPos((p) => clamp(p.x, p.y)); }, [zoom, img]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    const g = geometry();
    if (!g || !img) return;
    setBusy(true); setError("");
    try {
      const outH = Math.round(outWidth / aspect);
      const canvas = document.createElement("canvas");
      canvas.width = outWidth; canvas.height = outH;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, outWidth, outH);
      // the frame's top-left corner in image pixels
      const left = (g.w / 2 - pos.x - g.box.width / 2) / g.scale;
      const top = (g.h / 2 - pos.y - g.box.height / 2) / g.scale;
      ctx.drawImage(img, left, top, g.box.width / g.scale, g.box.height / g.scale, 0, 0, outWidth, outH);
      const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.9));
      if (!blob) throw new Error(t("st.crop.bad_image"));
      const uploaded = await api.upload(new File([blob], `${round ? "photo" : "cover"}.jpg`, { type: "image/jpeg" }));
      await onDone(uploaded);
    } catch (e) {
      setError(message(e));
      setBusy(false);
    }
  }

  const g = geometry();
  return (
    <Sheet onClose={onClose}>
      <h2 style={{ marginTop: 0 }}>{round ? t("st.crop.photo") : t("st.crop.cover")}</h2>
      <p className="hint" style={{ marginTop: 0 }}>{t("st.crop.hint")}</p>
      <div ref={frame} className={`st-crop ${round ? "round" : ""}`} style={{ aspectRatio: String(aspect) }}
           onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y }; }}
           onPointerMove={(e) => { if (drag.current) setPos(clamp(drag.current.px + e.clientX - drag.current.x, drag.current.py + e.clientY - drag.current.y)); }}
           onPointerUp={() => { drag.current = null; }}>
        {src && img && g && (
          <img src={src} alt="" draggable={false}
               style={{ width: g.w, height: g.h, transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px))` }} />
        )}
      </div>
      <label className="st-crop-zoom">
        <span>{t("st.crop.zoom")}</span>
        <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
      </label>
      <ErrorText error={error} />
      <div className="row" style={{ gap: 8, marginTop: 12 }}>
        <button className="btn ghost" onClick={onClose}>{t("common.cancel")}</button>
        <button className="btn" disabled={busy || !img} onClick={save}>{busy ? t("s.common.saving") : t("common.save")}</button>
      </div>
    </Sheet>
  );
}
