"""나리님이 준 캐릭터 목록 그림(assets/characters-source.png)에서 캐릭터를 잘라
public/char/<이름>-<색>.png 로 저장하고, src/characters.ts 목록을 만들어요.

색 0은 원래 색이고, 1~11은 대표 옷 색(후드, 로브 등)을 색상환에서 30도씩 돌린 버전이에요.
흰 옷은 연한 파스텔로 물들이고, 얼굴과 검은 테두리는 그대로 둬요. 그래서 캐릭터 21종 × 12색 = 252가지가 나와요.

사용법: python3 scripts/build_characters.py
"""
import colorsys
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets" / "characters-source.png"
OUT = ROOT / "public" / "char"
VARIANTS = 12
# 몸 전체가 살구색 털이라 피부 보호를 끄는 캐릭터
FUR_SKIN = {"puppy", "kitty"}

# 그림 속 순서대로 (왼쪽 위부터)
NAMES = [
    ("basic-boy", "기본 캐릭터 1"), ("basic-girl", "기본 캐릭터 2"), ("student", "학생"), ("student-girl", "학생(여)"),
    ("frog", "개구리 후드"), ("cat-hood", "고양이 후드"), ("rabbit", "토끼 후드"), ("bear", "곰 후드"), ("dino", "공룡 후드"),
    ("wolf", "늑대 후드"), ("wizard", "마법사"), ("knight", "기사"), ("astronaut", "우주인"), ("penguin", "펭귄"),
    ("panda", "판다"), ("puppy", "강아지"), ("kitty", "고양이"), ("soccer", "스포츠(축구)"), ("basketball", "스포츠(농구)"),
    ("hiphop", "힙합"), ("glasses", "안경 캐릭터"),
]


def cut_characters():
    img = np.array(Image.open(SRC).convert("RGBA"))
    rgb = img[..., :3].astype(int)
    mx, mn = rgb.max(-1), rgb.min(-1)
    # 밝은 회색 배경을 가장자리부터 채워서, 닿지 않는 덩어리를 캐릭터로 봐요
    bgish = (mn > 185) & (mx - mn < 22)
    lab, _ = ndimage.label(bgish)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    fg = ndimage.binary_opening(~np.isin(lab, list(border)), iterations=1)
    cl, _ = ndimage.label(fg)
    boxes = []
    for i, s in enumerate(ndimage.find_objects(cl)):
        h, w = s[0].stop - s[0].start, s[1].stop - s[1].start
        if h > 35 and w > 25:  # 글자는 작아서 빠져요
            boxes.append((s[0].start, s[1].start, i + 1))
    boxes.sort(key=lambda b: (b[0] // 60, b[1]))
    assert len(boxes) == len(NAMES), f"캐릭터 {len(boxes)}개를 찾았어요 (예상 {len(NAMES)})"
    out = []
    for (_, _, i) in boxes:
        m = ndimage.binary_fill_holes(cl == i)
        ys, xs = np.where(m)
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        a = img[y0:y1, x0:x1].copy()
        alpha = m[y0:y1, x0:x1]
        c = a[..., :3].astype(int)
        cmx, cmn = c.max(-1), c.min(-1)
        # 가장자리의 밝은 번짐과 발밑 회색 그림자를 지워요
        edge = alpha & ~ndimage.binary_erosion(alpha)
        alpha &= ~(edge & (cmn > 170) & (cmx - cmn < 30))
        ys2 = np.arange(alpha.shape[0])[:, None]
        alpha &= ~((ys2 > alpha.shape[0] * 0.86) & (cmx - cmn < 18) & (cmn > 110))
        a[..., 3] = np.where(alpha, 255, 0)
        out.append(a)
    return out


def to_hsv(a):
    rgb = a[..., :3].astype(float) / 255
    return np.array([colorsys.rgb_to_hsv(*p) for p in rgb.reshape(-1, 3)]).reshape(rgb.shape)


def face_mask(shape):
    # 눈, 볼, 입이 있는 자리. 여기는 색을 바꾸지 않아요.
    ys = np.linspace(0, 1, shape[0])[:, None]
    xs = np.linspace(0, 1, shape[1])[None, :]
    return ((xs - 0.5) / 0.27) ** 2 + ((ys - 0.46) / 0.13) ** 2 <= 1


def main_color(a):
    """캐릭터의 대표 옷 색(색상)을 찾아요. 흰 옷이 더 많으면 None."""
    hsv = to_hsv(a)
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    body = (a[..., 3] > 0) & ~face_mask(a.shape)
    colored = body & (s > 0.2) & (v > 0.3)
    white = body & (s < 0.12) & (v > 0.75)
    if white.sum() > colored.sum():
        return None
    hist, edges = np.histogram(h[colored], bins=36, range=(0, 1))
    k = int(hist.argmax())
    return (edges[k] + edges[k + 1]) / 2


def recolor(a, shift, hue, protect_skin=True):
    if shift == 0:
        return a
    hsv = to_hsv(a)
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    keep = face_mask(a.shape) | (v < 0.22) | (a[..., 3] == 0)
    if protect_skin:
        # 손이나 얼굴처럼 밝은 살구색은 그대로 (강아지, 고양이처럼 몸 전체가 살구색이면 빼요)
        keep |= (h > 5 / 360) & (h < 42 / 360) & (s > 0.08) & (s < 0.42) & (v > 0.8)
    if hue is None:
        # 흰 옷은 연한 파스텔로 물들여요
        target = ~keep & (s < 0.15) & (v > 0.55)
        h = np.where(target, shift / 360, h)
        s = np.where(target, np.maximum(s, 0.24), s)
    else:
        # 대표 색과 비슷한 색만 돌려서 옷(과 후드)만 바뀌게 해요
        d = np.abs(((h - hue) + 0.5) % 1 - 0.5)
        target = ~keep & (d < 0.11) & (s > 0.12)
        h = np.where(target, (h + shift / 360) % 1, h)
    out = np.array([colorsys.hsv_to_rgb(*p) for p in np.stack([h, s, v], -1).reshape(-1, 3)]).reshape(h.shape + (3,))
    b = a.copy()
    b[..., :3] = np.clip(out * 255 + 0.5, 0, 255).astype(np.uint8)
    return b


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for f in OUT.glob("*.png"):
        f.unlink()
    sprites = cut_characters()
    sizes = {}
    for (key, _), a in zip(NAMES, sprites):
        sizes[key] = [int(a.shape[1]), int(a.shape[0])]
        hue = main_color(a)
        for v in range(VARIANTS):
            Image.fromarray(recolor(a, v * 360 // VARIANTS, hue, key not in FUR_SKIN)).save(OUT / f"{key}-{v}.png", optimize=True)
    entries = ",\n".join(f"  {{ id: '{k}', name: '{n}', w: {sizes[k][0]}, h: {sizes[k][1]} }}" for k, n in NAMES)
    (ROOT / "src" / "characters.ts").write_text(
        "// scripts/build_characters.py가 만든 파일이에요. 직접 고치지 마세요.\n"
        f"export const CHARACTER_VARIANTS = {VARIANTS};\n\n"
        f"export const CHARACTERS = [\n{entries},\n] as const;\n"
    )
    print(len(sprites), "characters ×", VARIANTS, "colors")


if __name__ == "__main__":
    main()
