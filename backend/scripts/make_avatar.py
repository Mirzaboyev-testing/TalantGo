"""Profile picture for the TalantGo bot (BotFather /setuserpic): 640x640 PNG in the banner's colours.
Telegram crops it to a circle, so the mark stays well inside the middle. Run on Windows (Montserrat)."""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

S = 640
OUT = Path(__file__).resolve().parent.parent.parent / "docs" / "brand" / "talantgo-avatar.png"
FONTS = Path("C:/Windows/Fonts")

top, bottom = (12, 22, 52), (36, 92, 205)
img = Image.new("RGB", (S, S))
px = img.load()
for y in range(S):
    for x in range(S):
        t = min(1.0, 0.6 * y / S + 0.4 * x / S)
        px[x, y] = tuple(round(a + (b - a) * t) for a, b in zip(top, bottom))

d = ImageDraw.Draw(img)
d.rounded_rectangle((170, 150, 470, 450), radius=70, fill=(255, 209, 102))
d.text((S / 2, 300), "T", font=ImageFont.truetype(str(FONTS / "Montserrat-Black.ttf"), 230), fill=(12, 22, 52), anchor="mm")
d.text((S / 2, 520), "TalantGo", font=ImageFont.truetype(str(FONTS / "Montserrat-Bold.ttf"), 54), fill=(255, 255, 255), anchor="mm")

OUT.parent.mkdir(parents=True, exist_ok=True)
img.save(OUT, optimize=True)
print(OUT)
