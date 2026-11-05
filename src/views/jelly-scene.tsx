// 기존 캐릭터를 올려 쓰는 게임 배경·소품. 비트맵을 생성하지 않는 SVG 장면입니다.
export function JellyScenery(props: { room: number }) {
  const kitchen = props.room === 1, party = props.room === 2;
  return <svg class="jelly-scenery" viewBox="0 0 960 380" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs><pattern id={`floor-${props.room}`} width="120" height="28" patternUnits="userSpaceOnUse"><rect width="120" height="28" fill="#c7b7a1" /><path d="M0 27H120M60 0V27M10 8H42M80 20H110" stroke="#ae9d8d" stroke-width="2" /></pattern></defs>
    <rect width="960" height="380" fill={kitchen ? '#e1d5b9' : party ? '#cdd6e8' : '#b6ccc7'} />
    <path d="M0 20H960M20 0V270M940 0V270" stroke="#80999a" stroke-width="10" />
    <rect y="268" width="960" height="112" fill={`url(#floor-${props.room})`} /><path d="M0 266H960" stroke="#687e81" stroke-width="8" />
    <rect x="70" y="67" width="180" height="130" rx="3" fill="#657c83" /><rect x="78" y="75" width="164" height="114" fill="#d3e8e9" />
    <path d="M160 75V189M78 132H242" stroke="#8dabb0" stroke-width="7" /><path d="M90 82L128 82L90 120M173 82H215L173 124" fill="#f3f9f1" />
    <path d="M430 0V36" stroke="#65757d" stroke-width="4" /><path d="M395 40H465L478 59H382Z" fill="#697e86" /><rect x="410" y="59" width="40" height="8" fill="#fff1ba" />
    <rect x="620" y="85" width="255" height="155" fill="#91a9a8" stroke="#6f8586" stroke-width="7" />
    {[130, 188, 239].map(y => <path d={`M615 ${y}H882`} stroke="#947d6f" stroke-width="11" />)}
    {[0, 1, 2, 3, 4].map(i => <g transform={`translate(${635 + i * 46} 96)`}><rect width="28" height="27" rx="3" fill={['#c9dcae', '#e1c29d', '#c1d2e6', '#d7bccb', '#e2d5ab'][i]} stroke="#728b89" stroke-width="2" /><rect x="6" y="8" width="16" height="8" fill="#f7f0dc" /></g>)}
    {!kitchen && <g stroke="#7b7973" stroke-width="3"><rect x="60" y="231" width="92" height="67" fill="#b69e79" /><path d="M65 239L147 288M147 239L65 288" /><rect x="165" y="245" width="80" height="65" fill="#c7ad83" /><path d="M171 251L239 303M239 251L171 303" /></g>}
    <rect x="330" y="242" width="332" height="19" fill="#a68b78" stroke="#6f7472" stroke-width="4" /><path d="M350 261V318M642 261V318" stroke="#85877e" stroke-width="12" />
    {kitchen ? <><rect x="320" y="215" width="48" height="25" rx="5" fill="#ece9da" stroke="#879f9b" stroke-width="3" /><path d="M407 214Q440 161 474 214Z" fill="#ebd6c4" /><rect x="406" y="214" width="69" height="24" fill="#fcf1d5" /><rect x="510" y="194" width="39" height="47" rx="6" fill="#e6eee7" stroke="#8aa19a" stroke-width="3" /><text x="529" y="222" text-anchor="middle" fill="#718a83" font-size="14">설탕</text></>
      : <><g transform="translate(500 292)"><path d="M0 0H118L109 37H13Z" fill="#91acb3" stroke="#607e87" stroke-width="4" /><path d="M112 0L132 -41H152" fill="none" stroke="#607e87" stroke-width="5" /><circle cx="27" cy="47" r="12" fill="#667f88" /><circle cx="96" cy="47" r="12" fill="#667f88" /></g><path d="M290 346h32m15 0h32m15 0h32m15 0h32m15 0h32" stroke="#9b8c80" stroke-width="5" stroke-dasharray="6 6" /></>}
    {party && <><path d="M20 52Q480 130 940 52" fill="none" stroke="#7b91a9" stroke-width="3" />{[160, 280, 400, 520, 640, 760].map((x, i) => <path d={`M${x} 76l34 5 -21 40Z`} fill={['#d4b5c6', '#edd3a6', '#b4d1cd'][i % 3]} />)}<rect x="775" y="260" width="100" height="70" fill="#d8bdc9" stroke="#8e8797" stroke-width="3" /><path d="M824 260V330M775 282H875" stroke="#e9ddaf" stroke-width="8" /></>}
    <rect x="285" y="92" width="105" height="63" fill="#f3efda" stroke="#96aaa2" stroke-width="3" /><path d="M300 108H375M300 120H353M300 132H366" stroke="#a9b4a6" stroke-width="3" />
  </svg>;
}
export function EvidenceProp(props: { clue: string }) {
  if (props.clue === 'receipt') return <svg viewBox="0 0 100 90" aria-hidden="true"><path d="M23 8H79V72L69 80 58 73 48 80 37 73 23 80Z" fill="#fff3cc" stroke="#847865" stroke-width="3" /><path d="M33 24H66M33 35H70M33 46H61M33 57H68" stroke="#b6a080" stroke-width="3" /><path d="M23 41L41 38 48 43 61 37 79 41" stroke="#d2b99b" fill="none" stroke-width="2" /><circle cx="66" cy="65" r="8" fill="#b28387" /></svg>;
  if (props.clue === 'powder') return <svg viewBox="0 0 100 90" aria-hidden="true"><path d="M9 70Q21 49 34 61L44 48 57 61Q72 43 89 69Z" fill="#f7f0dc" stroke="#d2c6b1" stroke-width="2" /><circle cx="25" cy="42" r="3" fill="#fff7df" /><circle cx="68" cy="47" r="4" fill="#fff7df" /><circle cx="78" cy="37" r="2" fill="#fff7df" /></svg>;
  if (props.clue === 'promise') return <svg viewBox="0 0 100 90" aria-hidden="true"><path d="M49 39Q11 6 14 40Q14 68 48 47Q87 69 87 40Q88 8 51 39" fill="#c689a2" stroke="#8d6c82" stroke-width="3" /><path d="M40 47L25 83 47 72 53 85 63 48" fill="#d59bb0" stroke="#8d6c82" stroke-width="3" /><circle cx="50" cy="43" r="9" fill="#e8c5c5" /></svg>;
  return <svg viewBox="0 0 100 90" aria-hidden="true">{[0, 1, 2, 3, 4].map(i => <g transform={`translate(${8 + (i % 3) * 28} ${12 + Math.floor(i / 3) * 35})`}><rect width="26" height="32" fill="#c7ac7c" stroke="#7e7a69" stroke-width="2" /><path d="M13 0V32" stroke="#ebd9aa" stroke-width="5" /><rect x="3" y="11" width="20" height="10" fill="#f8efd7" /><text x="13" y="19" text-anchor="middle" font-size="7" fill="#6e7975">100</text></g>)}</svg>;
}
