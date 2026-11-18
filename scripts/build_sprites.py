"""나리님이 준 낱개 그림을 웹에서 쓸 크기로 맞춰요. (시트 자르기는 이제 안 해요)

python3 scripts/build_sprites.py <그림 폴더>         # assets/sprites/images.json 순서대로 저장
python3 scripts/build_sprites.py --bg <배경파일들...> # 배경: 이름=파일 (예: journey/bg/meadow=a.png)
끝나면 src/sprites.gen.ts 를 public/journey, public/case 안 그림 크기로 다시 만들어요.
"""
import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"


def fit(src: Path, dst: Path, limit: int) -> None:
    img = Image.open(src).convert("RGBA")
    alpha = img.getchannel("A").point(lambda v: 255 if v > 16 else 0)
    box = alpha.getbbox()
    if box:
        img = img.crop(box)
    s = min(1.0, limit / max(img.size))
    if s < 1:
        img = img.resize((max(1, round(img.width * s)), max(1, round(img.height * s))), Image.LANCZOS)
    dst.parent.mkdir(parents=True, exist_ok=True)
    img.save(dst, quality=88, method=6)


def pictures(folder: Path) -> None:
    conf = json.loads((ROOT / "assets" / "sprites" / "images.json").read_text(encoding="utf-8"))
    for g in conf["groups"]:
        files = sorted((folder / g["dir"]).glob("*.png"))
        if len(files) != len(g["names"]):
            raise SystemExit(f"{g['dir']}: 그림 {len(files)}개, 이름 {len(g['names'])}개")
        for f, name in zip(files, g["names"]):
            fit(f, PUBLIC / g["out"] / f"{name}.webp", g.get("big", {}).get(name, g["max"]))
            print(f"{g['out']}/{name}.webp <- {f.name}")


def backgrounds(pairs: list[str]) -> None:
    for p in pairs:
        name, src = p.split("=", 1)
        img = Image.open(src).convert("RGB")
        # 사건파일 방은 눌러서 크게 확대해 보므로 더 크게 둬요.
        w = 1500 if name.startswith("case/room/") else 1200 if img.width / img.height > 2 else 1000
        img = img.resize((w, round(img.height * w / img.width)), Image.LANCZOS)
        dst = PUBLIC / f"{name}.webp"
        dst.parent.mkdir(parents=True, exist_ok=True)
        img.save(dst, quality=82, method=6)
        print(f"{name}.webp {img.size}")


def room_variants() -> None:
    """사건파일 방: 휴대폰용 작은 그림(-m.webp)과, 그림이 오기 전 먼저 보이는 흐린 미리보기(src/room-blur.gen.ts)."""
    import base64, io
    blur = {}
    for f in sorted((PUBLIC / "case" / "room").glob("*.webp")):
        if f.stem.endswith("-m"):
            continue
        img = Image.open(f).convert("RGB")
        m = img.resize((900, round(img.height * 900 / img.width)), Image.LANCZOS)
        m.save(f.with_name(f"{f.stem}-m.webp"), quality=74, method=6)
        t = img.resize((24, round(img.height * 24 / img.width)), Image.LANCZOS)
        buf = io.BytesIO()
        t.save(buf, "WEBP", quality=50)
        blur[f.stem] = "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()
    lines = ["// scripts/build_sprites.py 가 만든 파일이에요. 손으로 고치지 마세요.", "// 사건파일 방 그림이 오기 전에 먼저 깔아 두는 아주 작은 흐린 그림", "export const ROOM_BLUR: Record<string, string> = {"]
    lines += [f"  '{k}': '{v}'," for k, v in blur.items()]
    lines += ["};", ""]
    (ROOT / "src" / "room-blur.gen.ts").write_text("\n".join(lines), encoding="utf-8")


def size_map() -> None:
    sizes = {}
    for d in ("journey/foe", "journey/prop", "case/obj", "case/item"):
        for f in sorted((PUBLIC / d).glob("*.webp")):
            sizes[f"/{d}/{f.name}"] = Image.open(f).size
    lines = ["// scripts/build_sprites.py 가 만든 파일이에요. 손으로 고치지 마세요.", "// 그림 경로 → [가로, 세로] 픽셀", "export const SPRITES: Record<string, [number, number]> = {"]
    lines += [f"  '{k}': [{w}, {h}]," for k, (w, h) in sorted(sizes.items())]
    lines += ["};", ""]
    (ROOT / "src" / "sprites.gen.ts").write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    if len(sys.argv) > 2 and sys.argv[1] == "--bg":
        backgrounds(sys.argv[2:])
        room_variants()
    elif len(sys.argv) == 2 and sys.argv[1] == "--rooms":
        room_variants()
    elif len(sys.argv) == 2:
        pictures(Path(sys.argv[1]))
    size_map()
