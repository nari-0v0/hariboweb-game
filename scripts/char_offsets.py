"""캐릭터 그림마다 몸 가운데가 그림 가운데에서 얼마나 벗어났는지 재서 src/char-offsets.ts 로 적어요.

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


def feet_offset(path: Path) -> float:
    """몸 가운데가 그림 가운데에서 몇 % 벗어났는지(그림 너비 기준, 오른쪽이 +).

    꼬리·지팡이·인형처럼 옆으로 튀어나온 소품에 끌려가지 않게, 얼굴~몸통 높이(위에서 25~60%)의
    줄마다 가장 긴 덩어리(몸)의 가운데만 모아 그 중앙값을 써요(나리 2026-11-20: 여우가 왼쪽으로 쏠려 보임).
    """

    alpha = np.array(Image.open(path).convert("RGBA"))[:, :, 3] > 40
    rows = np.where(alpha.any(1))[0]
    top, bottom = rows[0], rows[-1]
    height = bottom - top + 1
    centers = []
    for y in range(top + int(height * 0.25), top + int(height * 0.6)):
        edge = np.diff(np.concatenate([[0], alpha[y].astype(int), [0]]))
        starts, ends = np.where(edge == 1)[0], np.where(edge == -1)[0]
        if len(starts):
            k = int(np.argmax(ends - starts))
            centers.append((starts[k] + ends[k] - 1) / 2)
    cx = float(np.median(centers))
    width = alpha.shape[1]
    off = (cx + 0.5 - width / 2) / width * 100
    # 옮겨도 그림이 카드 그림 칸 밖으로 잘리지 않을 만큼만 옮겨요(나리 2026-11-20: 로봇 칼이 잘림).
    # 카드 그림 칸: 그림 높이 76%, 너비 최대 92%(styles.css .c-avatar), 칸 가로:세로는 가장 좁을 때 약 0.84.
    art_ratio, img_h, img_max_w = 0.84, 0.76, 0.92
    img_w = min(img_h * alpha.shape[1] / alpha.shape[0], img_max_w * art_ratio)
    room = max(0.0, (art_ratio / img_w - 1) * 50 - 1)  # 한쪽 여유(그림 너비 %), 1%는 테두리 몫
    off = max(-room, min(room, off))
    return round(off, 1)


def main() -> None:
    rows = []
    for path in sorted(CHAR.glob("*.png")) + sorted((CHAR / "deco").glob("*.png")):
        off = feet_offset(path)
        if abs(off) >= 1.5:
            rows.append(f"  '{path.relative_to(CHAR).as_posix()}': {off},")
    OUT.write_text(
        "// scripts/char_offsets.py 가 만든 파일이에요. 손으로 고치지 마세요.\n"
        "// 그림 파일 → 몸이 가운데에서 벗어난 정도(그림 너비 %, 오른쪽이 +). 1.5% 미만은 빼요.\n"
        "export const CHAR_OFFSETS: Record<string, number> = {\n" + "\n".join(rows) + "\n};\n",
        encoding="utf-8",
    )
    print(f"{len(rows)}개 적었어요 → {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
