"""캐릭터 그림마다 발 위치가 가운데에서 얼마나 벗어났는지 재서 src/char-offsets.ts 로 적어요.

포니테일·소품처럼 한쪽으로 긴 그림은 그림 상자 가운데에 두면 몸이 옆으로 밀려 보이고
그림자와 발이 어긋나요. 카드에서 이 값만큼 그림을 옮겨 발을 가운데(그림자 위)에 맞춰요.
새 그림을 넣으면 다시 돌려요: python3 scripts/char_offsets.py
"""

from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
CHAR = ROOT / "public" / "char"
OUT = ROOT / "src" / "char-offsets.ts"


# 발 쪽이 몸 전체보다 이만큼(%) 넘게 더 치우치면 꼬리·공·소품이 발 높이에 있는 그림이에요.
# 그때는 발 대신 몸 전체 무게중심으로 맞춰요(드래곤 꼬리를 발로 재서 카드에서 밀려 보였어요, 멍쑤 2026-11-20).
# 꾸밈 캐릭터(deco)에만 써요. 멤버 기본 캐릭터는 그대로 둬요(포니테일 그림은 발 기준이 맞아요).
TAIL_GAP = 4.0


def center_offset(mask: np.ndarray, width: int) -> float:
    cols = mask.sum(0)
    cx = (cols * np.arange(len(cols))).sum() / cols.sum()
    return float((cx + 0.5 - width / 2) / width * 100)


def feet_offset(path: Path) -> float:
    """발 쪽(아래 15%) 그림 무게중심이 가운데에서 몇 % 벗어났는지(그림 너비 기준, 오른쪽이 +)."""

    alpha = np.array(Image.open(path).convert("RGBA"))[:, :, 3] > 40
    rows = np.where(alpha.any(1))[0]
    top, bottom = rows[0], rows[-1]
    width = alpha.shape[1]
    feet = center_offset(alpha[bottom - int((bottom - top + 1) * 0.15) : bottom + 1], width)
    whole = center_offset(alpha, width)
    if path.parent.name == "deco" and abs(feet) - abs(whole) > TAIL_GAP:
        return round(whole, 1)
    return round(feet, 1)


def main() -> None:
    rows = []
    for path in sorted(CHAR.glob("*.png")) + sorted((CHAR / "deco").glob("*.png")):
        off = feet_offset(path)
        if abs(off) >= 1.5:
            rows.append(f"  '{path.relative_to(CHAR).as_posix()}': {off},")
    OUT.write_text(
        "// scripts/char_offsets.py 가 만든 파일이에요. 손으로 고치지 마세요.\n"
        "// 그림 파일 → 발이 가운데에서 벗어난 정도(그림 너비 %, 오른쪽이 +). 1.5% 미만은 빼요.\n"
        "export const CHAR_OFFSETS: Record<string, number> = {\n" + "\n".join(rows) + "\n};\n",
        encoding="utf-8",
    )
    print(f"{len(rows)}개 적었어요 → {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
