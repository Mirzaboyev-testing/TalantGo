"""Welcome banner for the CareerFlow bot: 1280x640 PNG. Run on Windows (uses Montserrat from C:/Windows/Fonts)."""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1280, 640
OUT = Path(__file__).resolve().parent.parent / "app" / "assets" / "welcome.png"
FONTS = Path("C:/Windows/Fonts")
font = lambda name, size: ImageFont.truetype(str(FONTS / name), size)  # noqa: E731

# diagonal gradient: deep navy to Telegram-like blue
top, bottom = (12, 22, 52), (36, 92, 205)
img = Image.new("RGB", (W, H))
px = img.load()
for y in range(H):
    for x in range(W):
        t = min(1.0, (0.75 * y / H + 0.25 * x / W) * 1.05)
        px[x, y] = tuple(round(a + (b - a) * t) for a, b in zip(top, bottom))

# soft glow behind the growth bars
glow = Image.new("L", (W, H), 0)
ImageDraw.Draw(glow).ellipse((820, 120, 1300, 600), fill=120)
glow = glow.filter(ImageFilter.GaussianBlur(90))
img = Image.composite(Image.new("RGB", (W, H), (90, 150, 255)), img, glow)

d = ImageDraw.Draw(img)

# rising bars: study -> practice -> job
bars = [(900, 430), (985, 360), (1070, 270), (1155, 170)]
for i, (x, y) in enumerate(bars):
    shade = 255 if i == len(bars) - 1 else 160 + i * 25
    fill = (255, 209, 102) if i == len(bars) - 1 else (shade, shade, 255)
    d.rounded_rectangle((x, y, x + 62, 520), radius=14, fill=fill)
d.line([(931, 400), (1016, 330), (1101, 240), (1186, 140)], fill=(255, 255, 255), width=5)
for cx, cy in [(931, 400), (1016, 330), (1101, 240), (1186, 140)]:
    d.ellipse((cx - 9, cy - 9, cx + 9, cy + 9), fill=(255, 255, 255))

# brand mark
d.rounded_rectangle((80, 56, 132, 108), radius=14, fill=(255, 209, 102))
d.text((106, 82), "C", font=font("Montserrat-Black.ttf", 34), fill=(12, 22, 52), anchor="mm")
d.text((150, 82), "CareerFlow", font=font("Montserrat-Bold.ttf", 34), fill=(255, 255, 255), anchor="lm")

# headline
big = font("Montserrat-Black.ttf", 104)
d.text((78, 250), "Kelajagingni", font=big, fill=(255, 255, 255), anchor="ls")
d.text((78, 365), "biz bilan ", font=big, fill=(255, 255, 255), anchor="ls")
w = d.textlength("biz bilan ", font=big)
d.text((78 + w, 365), "qur", font=big, fill=(255, 209, 102), anchor="ls")

# path chips
chip = font("Montserrat-Bold.ttf", 28)
x = 80
for i, label in enumerate(["Tajriba", "Amaliyot", "Ish"]):
    tw = d.textlength(label, font=chip)
    d.rounded_rectangle((x, 410, x + tw + 44, 462), radius=26, fill=(52, 92, 190), outline=(255, 255, 255), width=2)
    d.text((x + 22, 436), label, font=chip, fill=(255, 255, 255), anchor="lm")
    x += tw + 44
    if i < 2:
        d.text((x + 22, 436), "→", font=chip, fill=(255, 209, 102), anchor="mm")
        x += 44

d.text((80, 545), "O'qish davomida haqiqiy tajriba. Tasdiqlangan portfolio. Birinchi ish.",
       font=font("Montserrat-Medium.ttf", 26), fill=(205, 220, 255), anchor="lm")

OUT.parent.mkdir(parents=True, exist_ok=True)
img.save(OUT, optimize=True)
print(OUT, OUT.stat().st_size // 1024, "KB")
