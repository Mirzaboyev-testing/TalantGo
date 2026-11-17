# Careerup brend fayllari

Logo brend doskasidagi belgidan (G/C yoyi va yuqoriga o'q) SVG qilib qayta chizilgan. Asl manba SVG:
qolgan hamma fayl shulardan olinadi.

| Fayl | Qayerda ishlatiladi |
|---|---|
| `frontend/public/brand/careerup-mark.svg` | belgi, oq va och fonda (sidebar, sarlavhalar, kirish sahifalari) |
| `frontend/public/brand/careerup-mark-light.svg` | belgi, to'q fonda |
| `frontend/public/brand/careerup-icon.svg`, `frontend/public/favicon.svg` | to'q kvadrat ichidagi belgi: brauzer tabi, ilova ikonkasi |
| `frontend/public/brand/careerup-logo.svg`, `docs/brand/careerup-logo.svg` | belgi va "Careerup" yozuvi (taqdimot, hujjatlar) |
| `frontend/public/apple-touch-icon.png` (180), `icon-192.png`, `icon-512.png` | telefon bosh ekrani, `manifest.webmanifest` |
| `backend/app/assets/welcome.jpg` (1280×640) | Telegram bot xush kelibsiz banneri (`/media/welcome.jpg`) |
| `docs/brand/careerup-avatar.png` (640×640) | bot avatari: BotFather → `/setuserpic` |

Ranglar: yashil `#00C853`, to'q `#0B1F17`, oq `#F8FAFC`. Saytdagi tugmalar `#16a34a` da qoladi: oq matn bilan
kontrast yetarli (`#00C853` da yetmaydi). Yozuv: Inter 800, "Career" to'q, "up" yashil.

PNG'lar SVG'dan brauzerda (canvas) eksport qilingan. Kodda nom va logo bitta joyda: `frontend/src/brand.tsx`
(`BRAND`, `AI_NAME`, `BrandMark`, `BrandLogo`) va `backend/app/core/brand.py`.
