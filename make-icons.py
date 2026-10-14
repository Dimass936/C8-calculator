"""Генерирует иконки приложения для «Добавить на экран Домой».

Иконка — квадрат с диагональным градиентом в цветах интерфейса и надписью «С8».
Углы НЕ скругляем: iOS и Android накладывают свою маску сами.

Запуск: python3 tools/C8Calculations-web/make-icons.py
"""
from PIL import Image, ImageDraw, ImageFont

OUT_DIR = __import__("os").path.dirname(__import__("os").path.abspath(__file__))

# Цвета взяты из градиента интерфейса: #6d4bff → #b84bff → #ff5fa2
STOPS = [(0.0, (0x6D, 0x4B, 0xFF)), (0.5, (0xB8, 0x4B, 0xFF)), (1.0, (0xFF, 0x5F, 0xA2))]

FONT_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
]


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def gradient_at(t):
    for i in range(len(STOPS) - 1):
        t0, c0 = STOPS[i]
        t1, c1 = STOPS[i + 1]
        if t0 <= t <= t1:
            return lerp(c0, c1, (t - t0) / (t1 - t0))
    return STOPS[-1][1]


def make_background(size):
    """Градиент считаем в низком разрешении и растягиваем — так быстро и гладко."""
    small = 64
    low = Image.new("RGB", (small, small))
    px = low.load()
    for y in range(small):
        for x in range(small):
            px[x, y] = gradient_at((x + y) / (2 * (small - 1)))
    return low.resize((size, size), Image.Resampling.BICUBIC)


def load_font(size):
    for path in FONT_CANDIDATES:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def make_icon(size):
    img = make_background(size)
    draw = ImageDraw.Draw(img)

    text = "С8"
    font = load_font(int(size * 0.46))

    box = draw.textbbox((0, 0), text, font=font)
    w = box[2] - box[0]
    h = box[3] - box[1]

    x = (size - w) / 2 - box[0]
    y = (size - h) / 2 - box[1] - size * 0.01  # чуть выше — так ровнее на глаз

    # лёгкая тень под текстом, чтобы читалось на градиенте
    draw.text((x, y + max(1, size // 90)), text, font=font, fill=(90, 30, 140))
    draw.text((x, y), text, font=font, fill="white")
    return img


def main():
    base = make_icon(512)
    for size in (512, 192, 180, 32):
        name = f"icon-{size}.png"
        path = f"{OUT_DIR}/{name}"
        base.resize((size, size), Image.Resampling.LANCZOS).save(path, "PNG")
        print("saved", name)


if __name__ == "__main__":
    main()
