// scripts/build_characters.py가 만든 파일이에요. 직접 고치지 마세요.
export const CHARACTER_VARIANTS = 12;

export const CHARACTERS = [
  { id: 'basic-boy', name: '기본 캐릭터 1', w: 62, h: 97 },
  { id: 'basic-girl', name: '기본 캐릭터 2', w: 70, h: 97 },
  { id: 'student', name: '학생', w: 59, h: 98 },
  { id: 'student-girl', name: '학생(여)', w: 69, h: 97 },
  { id: 'frog', name: '개구리 후드', w: 67, h: 97 },
  { id: 'cat-hood', name: '고양이 후드', w: 65, h: 91 },
  { id: 'rabbit', name: '토끼 후드', w: 68, h: 94 },
  { id: 'bear', name: '곰 후드', w: 65, h: 88 },
  { id: 'dino', name: '공룡 후드', w: 69, h: 94 },
  { id: 'wolf', name: '늑대 후드', w: 66, h: 92 },
  { id: 'wizard', name: '마법사', w: 84, h: 108 },
  { id: 'knight', name: '기사', w: 59, h: 106 },
  { id: 'astronaut', name: '우주인', w: 68, h: 93 },
  { id: 'penguin', name: '펭귄', w: 63, h: 89 },
  { id: 'panda', name: '판다', w: 65, h: 91 },
  { id: 'puppy', name: '강아지', w: 67, h: 80 },
  { id: 'kitty', name: '고양이', w: 51, h: 79 },
  { id: 'soccer', name: '스포츠(축구)', w: 51, h: 81 },
  { id: 'basketball', name: '스포츠(농구)', w: 51, h: 81 },
  { id: 'hiphop', name: '힙합', w: 61, h: 88 },
  { id: 'glasses', name: '안경 캐릭터', w: 58, h: 81 },
] as const;
