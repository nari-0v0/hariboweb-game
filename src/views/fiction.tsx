// 사건파일·원정대 화면마다 꼭 보이는 "가상 세계 이야기" 안내
export function FictionNote(props: { big?: boolean }) {
  return (
    <p class={`fiction${props.big ? ' big' : ''}`}>
      이 이야기는 가상의 세계예요. 등장인물은 멤버의 이름만 빌린 가상 인물이고, 실제 멤버와는 관계없어요.
    </p>
  );
}
