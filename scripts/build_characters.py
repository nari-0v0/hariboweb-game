"""나리님이 준 캐릭터 그림(assets/characters/*.png)에서 캐릭터를 하나씩 잘라
public/char/<이름>-<색>.png 로 저장하고, src/characters.ts 목록을 만들어요.
그림 목록과 이름은 assets/characters/sheets.json 에 있어요.

캐릭터는 모두 다른 디자인이에요. 색 0이 원래 그림이고, 1~3은 멤버 수가 디자인 수보다 많을 때만 쓰는
여분이에요(대표 옷 색만 돌린 버전). 새 그림을 넣으면 여분을 쓰던 멤버가 새 디자인으로 옮겨 가요.

사용법: python3 scripts/build_characters.py
"""
import colorsys
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets" / "characters"
OUT = ROOT / "public" / "char"
VARIANTS = 4
# 몸 전체가 살구색 털이라 피부 보호를 끄는 캐릭터
FUR_SKIN = {"sheep", "bear"}


def foreground(img):
    """배경이 아닌 곳. 투명 배경이면 알파로, 아니면 가장자리에서 이어진 검은 배경을 빼요."""
    alpha = img[..., 3]
    if (alpha < 16).mean() > 0.1:
        return alpha > 128, alpha > 200
    mx = img[..., :3].astype(int).max(-1)

    def outside(t):
        lab, _ = ndimage.label(mx <= t)
        border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
        return np.isin(lab, list(border))

    # 느슨한 기준(6)은 테두리까지 살리고, 빡빡한 기준(20)은 붙어 있는 캐릭터를 떼어 놓아요
    return ~outside(6), ~outside(20)


def cut_sheet(path, count, columns):
    img = np.array(Image.open(path).convert("RGBA"))
    fg, strict = foreground(img)
    fg = ndimage.binary_opening(fg, iterations=1)
    seeds, n = ndimage.label(ndimage.binary_opening(strict, iterations=2))
    sizes = ndimage.sum(np.ones_like(seeds), seeds, range(1, n + 1))
    big = [i + 1 for i in np.argsort(sizes)[::-1][:count]]
    assert sizes[big[-1] - 1] > 5000 and (n <= count or sorted(sizes)[-count - 1] < 2000), f"{path.name}: 캐릭터 {count}명을 못 찾았어요"
    # 캐릭터 순서: 위에서부터 한 줄(columns명)씩, 줄 안에서는 왼쪽부터
    cents = {i: ndimage.center_of_mass(seeds == i) for i in big}
    by_y = sorted(big, key=lambda i: cents[i][0])
    order = [i for r in range(0, count, columns) for i in sorted(by_y[r:r + columns], key=lambda i: cents[i][1])]
    # 느슨한 테두리 픽셀은 가장 가까운 캐릭터에 붙여요
    seed_map = np.where(np.isin(seeds, big), seeds, 0)
    dist, (iy, ix) = ndimage.distance_transform_edt(seed_map == 0, return_indices=True)
    owner = np.where(fg & (dist <= 12), seed_map[iy, ix], 0)
    out = []
    for i in order:
        m = ndimage.binary_fill_holes(owner == i)
        lab, k = ndimage.label(m)
        if k > 1:  # 떨어진 부스러기는 버리고 큰 조각만 남겨요
            sz = ndimage.sum(m, lab, range(1, k + 1))
            m = np.isin(lab, [j + 1 for j, v in enumerate(sz) if v >= 60])
        ys, xs = np.where(m)
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        a = img[y0:y1, x0:x1].copy()
        alpha = m[y0:y1, x0:x1]
        # 가장자리에 남은 어두운 배경, 붉은 번짐을 한 겹 정리해요
        c = a[..., :3].astype(int)
        edge = alpha & ~ndimage.binary_erosion(alpha)
        alpha &= ~(edge & ((c.max(-1) < 12) | (a[..., 3] < 160)))
        a[..., 3] = np.where(alpha, 255, 0)
        a[..., :3][~alpha] = 0
        out.append(a)
    return out


def cut_characters():
    spec = json.loads((SRC / "sheets.json").read_text())
    names, sprites, seen = [], [], set()
    for sheet in spec["sheets"]:
        chars = sheet["characters"]
        for key, _ in chars:
            assert key not in seen, f"이름이 겹쳐요: {key}"
            seen.add(key)
        sprites += cut_sheet(SRC / sheet["file"], len(chars), sheet["columns"])
        names += [tuple(c) for c in chars]
    return names, sprites


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
    names, sprites = cut_characters()
    sizes = {}
    for (key, _), a in zip(names, sprites):
        sizes[key] = [int(a.shape[1]), int(a.shape[0])]
        hue = main_color(a)
        for v in range(VARIANTS):
            b = recolor(a, v * 360 // VARIANTS, hue, key not in FUR_SKIN)
            # 색 128개 팔레트로 줄여서 파일을 가볍게 (도감에 100장 넘게 뜨니까요)
            Image.fromarray(b).quantize(128, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).save(OUT / f"{key}-{v}.png", optimize=True)
    entries = ",\n".join(f"  {{ id: '{k}', name: '{n}', w: {sizes[k][0]}, h: {sizes[k][1]} }}" for k, n in names)
    (ROOT / "src" / "characters.ts").write_text(
        "// scripts/build_characters.py가 만든 파일이에요. 직접 고치지 마세요.\n"
        f"export const CHARACTER_VARIANTS = {VARIANTS};\n\n"
        f"export const CHARACTERS = [\n{entries},\n] as const;\n"
    )
    print(len(sprites), "characters ×", VARIANTS, "colors")


if __name__ == "__main__":
    main()
