import type { Member } from '../env';
import type { JourneyBank, JourneyRecord, JourneyRun } from '../journey-db';
import { BOSS_KEYS, CHAPTERS, chapterLevels, chapterOf } from '../journey-chapters';
import {
  DAILY_REWARD_JOURNEYS,
  DAYS,
  ELITE_DAY,
  EVENTS,
  OFFERS,
  PERKS,
  PERK_IDS,
  GEAR,
  GEAR_IDS,
  GEAR_MAX,
  MATERIALS,
  gearBonus,
  gearNeed,
  gearText,
  material,
  SKILLS,
  perkCost,
  perkMax,
  bankRate,
  stat,
  xpNeed,
  type BattleFx,
  type JourneyState,
  type SkillId,
} from '../journey';
import { FOES, PROPS, ZONE_NAMES, spriteSvg, zoneFor, type Zone } from '../journey-art';
import { SPRITES } from '../sprites.gen';
import { FictionNote } from './fiction';
import { journeyNeed, journeyOpenTo, meets, needText, shortNeed, type DogamProgress } from '../unlock';
import { Layout } from './layout';
import { Popup, type PopupLine } from './shop';

const NOTICES: Record<string, PopupLine[]> = {
  stale: [
    {
      title: '알림',
      text: '다른 화면에서 이미 진행했어요. 지금 상태를 보여 드려요.',
    },
  ],
  bad: [{ title: '알림', text: '지금은 그렇게 할 수 없어요.' }],
  quit: [{ title: '알림', text: '원정을 그만두고 돌아왔어요.' }],
  perk: [{ title: '훈련 완료', text: '다음 원정부터 더 강해져요.' }],
  noperk: [{ title: '알림', text: '젤코인이 모자라거나 이미 끝까지 올렸어요.' }],
  gear: [{ title: '장비 강화 성공!', text: '다음 원정부터 더 강해져요.' }],
  nogear: [{ title: '알림', text: '재료나 젤코인이 모자라요.' }],
  error: [
    { title: '오류', text: '오류가 발생하였습니다.', bad: true },
    { title: '오류', text: '방장에게 문의해주세요.', bad: true, contact: true },
  ],
};

// 행동 하나 = 작은 폼 하나. 자바스크립트 없이도 눌러서 진행돼요.
function Act(props: { run: JourneyRun; a: string; n?: number; children: unknown; cls?: string; disabled?: boolean; idle?: boolean }) {
  return (
    <form method="post" action="/api/journey/act" class="jr-form" data-idle={props.idle ? '' : undefined}>
      <input type="hidden" name="run" value={props.run.row.id} />
      <input type="hidden" name="rev" value={String(props.run.row.rev)} />
      <input type="hidden" name="a" value={props.a} />
      {props.n !== undefined && <input type="hidden" name="n" value={String(props.n)} />}
      {!props.idle && (
        <button type="submit" class={props.cls} disabled={props.disabled}>
          {props.children}
        </button>
      )}
    </form>
  );
}

// from: 싸우기 전 값. 싸움 모션이 끝날 때(--reveal)까지는 전 값을 보여 주고, 그다음 지금 값으로 바뀌어요.
function Bar(props: { now: number; max: number; cls: string; label: string; from?: number }) {
  const pc = (v: number) => Math.max(0, Math.min(100, Math.round((v / Math.max(1, props.max)) * 100)));
  const pct = pc(props.now);
  const from = props.from !== undefined && props.from !== props.now ? props.from : null;
  return (
    <div class={`jr-bar ${props.cls}${from !== null ? ' later' : ''}`} role="meter" aria-valuenow={props.now} aria-valuemin={0} aria-valuemax={props.max} aria-label={props.label}>
      <span style={from !== null ? `width:${pct}%;--from:${pc(from)}%` : `width:${pct}%`} />
      {from !== null && (
        <b class="jr-before" aria-hidden="true">
          {props.label} {from}/{props.max}
        </b>
      )}
      <b class={from !== null ? 'jr-after' : undefined}>
        {props.label} {props.now}/{props.max}
      </b>
    </div>
  );
}

function Road(props: { s: JourneyState }) {
  const { s } = props;
  return (
    <ol class="jr-road" aria-label={`${s.day}/${DAYS}일`}>
      {Array.from({ length: DAYS }, (_, i) => {
        const d = i + 1;
        const mark = d === DAYS ? chapterOf(s.ch).boss.emoji : d === ELITE_DAY ? chapterOf(s.ch).elite.emoji : '';
        const cls = ['jr-step', d <= s.day ? 'past' : '', d === s.day ? 'here' : '', mark ? 'mark' : ''].filter(Boolean).join(' ');
        return (
          <li class={cls} title={`${d}일째`}>
            {mark || (d === s.day ? '' : d % 5 === 0 ? d : '')}
          </li>
        );
      })}
    </ol>
  );
}

function SkillChips(props: { s: JourneyState }) {
  const owned = (Object.entries(props.s.skills) as [SkillId, number][]).filter(([, l]) => l > 0);
  if (!owned.length) return <p class="hint">아직 배운 스킬이 없어요. 레벨이 오르면 골라요.</p>;
  return (
    <ul class="jr-skills">
      {owned.map(([id, l]) => (
        <li title={SKILLS[id].text(l)}>
          <span aria-hidden="true">{SKILLS[id].icon}</span> {SKILLS[id].name} <b>Lv.{l}</b>
        </li>
      ))}
    </ul>
  );
}

function Choice(props: { run: JourneyRun }) {
  const { run } = props;
  const s = run.state;
  const p = s.pending;
  if (!p) return null;
  if (p.kind === 'skill')
    return (
      <div class="jr-choice">
        <h3>⭐ 스킬 하나를 골라요</h3>
        <div class="jr-cards">
          {p.options.map((id, n) => {
            const lv = (s.skills[id] ?? 0) + 1;
            return (
              <Act run={run} a="pick" n={n} cls="jr-card">
                <span class="jr-card-icon" aria-hidden="true">
                  {SKILLS[id].icon}
                </span>
                <b>{SKILLS[id].name}</b>
                <span class="tag">{lv === 1 ? '새 스킬' : `Lv.${lv}`}</span>
                <span class="jr-card-text">{SKILLS[id].text(lv)}</span>
              </Act>
            );
          })}
        </div>
      </div>
    );
  if (p.kind === 'event') {
    const e = EVENTS[p.id];
    return (
      <div class="jr-choice">
        <h3>
          {e.icon} {e.title}
        </h3>
        <p>{e.text}</p>
        <div class="jr-row">
          {e.options.map((text, n) => (
            <Act run={run} a="pick" n={n} cls={`btn ${n === 0 ? 'btn-primary' : ''}`}>
              {text}
            </Act>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div class="jr-choice">
      <h3>🛒 떠돌이 상인</h3>
      <p class="hint">가진 젤코인 🪙 {s.coins}개. 여러 개 사도 돼요.</p>
      <div class="jr-cards">
        {p.offers.map((o, n) => {
          const info = OFFERS[o.id];
          return (
            <Act run={run} a="buy" n={n} cls="jr-card" disabled={s.coins < o.price}>
              <span class="jr-card-icon" aria-hidden="true">
                {info.icon}
              </span>
              <b>{info.name}</b>
              <span class="tag">🪙 {o.price}</span>
              <span class="jr-card-text">{info.text}</span>
            </Act>
          );
        })}
      </div>
      <Act run={run} a="leave" cls="btn btn-small">
        👋 그만 사고 떠나기
      </Act>
    </div>
  );
}

// ── 무대: 배경 + 내 캐릭터 + 상대(적이나 길에서 만난 것) ──
const STEP = 0.5; // 주고받는 한 번에 걸리는 시간(초)
const START = 0.35;
const EVENT_PROP: Record<string, string> = {
  spring: 'spring',
  coin: 'fairy',
  bear: 'gummy',
  fork: 'sign',
};
const ICON_PROP: Record<string, string> = {
  '🏕️': 'camp',
  '🎁': 'chest',
  '⛲': 'spring',
  '🪙': 'fairy',
  '🧸': 'gummy',
  '🪧': 'sign',
  '🏆': 'trophy',
  '👋': 'merchant',
  '🛒': 'merchant',
};
for (const o of Object.values(OFFERS)) ICON_PROP[o.icon] = 'merchant';
const FLIP = new Set(['hedgehog', 'crab', 'dragon']); // 오른쪽을 보고 그린 임시 그림은 뒤집어서 나를 보게 해요
// 나리님이 만든 그림이 있으면 그걸 써요(scripts/build_sprites.py). 원래 크기의 0.62배로 보여 줘요.
const PIC_SCALE = 0.62;
const picOf = (dir: string, key: string) => {
  const src = `/journey/${dir}/${key}.webp`;
  const size = SPRITES[src];
  return size
    ? {
        src,
        w: Math.round(size[0] * PIC_SCALE),
        h: Math.round(size[1] * PIC_SCALE),
      }
    : null;
};

// 몬스터·만남 그림과 배경을 미리 받아 둬요. 싸움이 시작될 때 빈 화면이 보이지 않게요.
// 지금 장의 몬스터만 받아요(장마다 10마리).
const preloadFor = (ch: number | undefined) => {
  const c = chapterOf(ch);
  return [...c.foes, c.elite, c.boss]
    .map((m) => `/journey/foe/${m.key}.webp`)
    .concat(Object.keys(SPRITES).filter((k) => k.startsWith('/journey/prop/')))
    .concat(['meadow', 'deep', 'dusk', 'lair', 'night'].map((z) => `/journey/bg/${z}.webp`))
    .filter((src) => src.startsWith('/journey/bg/') || SPRITES[src]);
};
const Preload = (props: { ch?: number }) => (
  <div class="jr-preload" aria-hidden="true">
    {preloadFor(props.ch).map((src) => (
      <img src={src} alt="" width={1} height={1} />
    ))}
  </div>
);

function propFor(s: JourneyState): string | null {
  if (s.pending?.kind === 'shop') return 'merchant';
  if (s.pending?.kind === 'event') return EVENT_PROP[s.pending.id] ?? null;
  for (const l of [...s.today].reverse()) {
    if (l.icon === '⭐' || l.icon === '📅' || l.icon === '🤖' || l.icon === '·') continue;
    return ICON_PROP[l.icon] ?? null;
  }
  return null;
}

// 전투 시간표: 누가 언제 달려들고, 언제 맞고, 피해 숫자가 언제 뜨는지
export function fightPlan(fx: BattleFx) {
  const hero: string[] = [];
  const foe: string[] = [];
  const pops: { on: 0 | 1; at: number; text: string; cls: string }[] = [];
  let t = START;
  if (fx.spark) {
    foe.push(`jr-zap .4s ${t}s`);
    pops.push({ on: 1, at: t, text: `⚡${fx.spark}`, cls: 'zap' });
    t += STEP;
  }
  for (const [who, dmg, crit] of fx.hits) {
    const hit = (t + 0.14).toFixed(2);
    if (who === 0) {
      hero.push(`jr-lunge-r .34s ${t.toFixed(2)}s`);
      foe.push(`jr-hit .3s ${hit}s`);
      pops.push({
        on: 1,
        at: +hit,
        text: crit ? `${dmg}!` : `${dmg}`,
        cls: crit ? 'crit' : '',
      });
    } else {
      foe.push(`jr-lunge-l .34s ${t.toFixed(2)}s`);
      hero.push(`jr-hit .3s ${hit}s`);
      pops.push({ on: 0, at: +hit, text: `-${dmg}`, cls: 'ouch' });
    }
    t += STEP;
  }
  const end = t.toFixed(2);
  if (fx.won) hero.push(`jr-cheer .5s ${end}s 2`);
  else foe.push(`jr-cheer .5s ${end}s 2`);
  return {
    hero: hero.join(', '),
    foe: foe.join(', '),
    heroEnd: fx.won ? '' : `jr-fall .6s ${end}s both`,
    foeEnd: fx.won ? `jr-die .45s ${end}s both` : '',
    pops,
    ms: Math.round((t + 0.9) * 1000),
    reveal: Math.round((t + 0.5) * 1000), // 결과(대화창·체력·버튼)가 나오는 때: 쓰러지는 모션이 끝난 뒤
  };
}

function Pops(props: { list: { at: number; text: string; cls: string }[] }) {
  return (
    <>
      {props.list.map((p) => (
        <b class={`jr-pop ${p.cls}`} style={`--d:${p.at}s`} aria-hidden="true">
          {p.text}
        </b>
      ))}
    </>
  );
}

export function Stage(props: { s: JourneyState; art: string; name: string; lost: boolean }) {
  const { s } = props;
  const fx = s.fx;
  const prop = fx ? null : propFor(s);
  const zone: Zone = prop === 'camp' ? 'night' : fx && BOSS_KEYS.has(fx.foe) ? 'lair' : zoneFor(s.day);
  const plan = fx ? fightPlan(fx) : null;
  const foe = fx ? FOES[fx.foe] : null;
  const img = fx ? picOf('foe', fx.foe) : prop ? picOf('prop', prop) : null;
  const pic = foe ?? (prop ? PROPS[prop] : null);
  const key = fx?.foe ?? prop ?? '';
  return (
    <div
      class={`jr-stage zone-${zone}${plan ? ' fight' : ''}${prop ? ` at-${prop}` : ''}`}
      style={`--jr-bg:url(/journey/bg/${zone}.webp)`}
      data-wait={plan ? String(plan.ms) : undefined}
    >
      <span class="jr-place">{(s.ch ?? 1) > 1 && zone !== 'night' ? `${chapterOf(s.ch).name} · ${s.ch}장` : ZONE_NAMES[zone]}</span>
      <div class={`jr-hero jr-actor${props.lost ? ' down' : ''}`} style={plan ? `--a:${plan.hero};--a2:${plan.heroEnd || 'none'}` : undefined}>
        <img src={props.art} alt={props.name} width={96} height={96} />
        <span class="jr-shadow" />
        {plan && <Pops list={plan.pops.filter((p) => p.on === 0)} />}
      </div>
      {(img || pic) && (
        <div
          class={`jr-foe jr-actor${fx?.won ? ' beaten' : ''}${!img && FLIP.has(key) ? ' flip' : ''} is-${key}`}
          style={plan ? `--a:${plan.foe};--a2:${plan.foeEnd || 'none'}` : undefined}
        >
          {img ? (
            <span>
              <img class="jr-sprite jr-pic" src={img.src} alt="" width={img.w} height={img.h} />
            </span>
          ) : pic ? (
            <span
              dangerouslySetInnerHTML={{
                __html: spriteSvg(pic, 5, 'jr-sprite'),
              }}
            />
          ) : null}
          <span class="jr-shadow" />
          {plan && <Pops list={plan.pops.filter((p) => p.on === 1)} />}
        </div>
      )}
    </div>
  );
}

function Log(props: { lines: JourneyState['today'] }) {
  return (
    <ul class="jr-today jr-talk" role="status">
      {props.lines.map((l) => (
        <li class={l.tone ? `tone-${l.tone}` : l.icon === '📅' ? 'day' : ''}>
          <span aria-hidden="true">{l.icon}</span> {l.text}
        </li>
      ))}
    </ul>
  );
}

// 게임 화면: 위는 무대(체력·레벨은 무대 위에 겹쳐요), 아래는 대화창과 큰 버튼.
function Play(props: { run: JourneyRun; art: string; name: string }) {
  const { run } = props;
  const s = run.state;
  const st = stat(s);
  const lost = s.hp <= 0;
  const ch = chapterOf(s.ch);
  const reveal = s.fx ? fightPlan(s.fx).reveal : 0;
  return (
    <section class="jr-game" id="now">
      <div id="journey" data-journey-play class={reveal ? 'jr-fighting' : undefined} style={reveal ? `--reveal:${reveal}ms` : undefined}>
        <div class="jr-view">
          <header class="jr-hud">
            <span class="jr-hud-ch">
              {s.ch ?? 1}장 · {ch.name}
            </span>
            <b class="jr-hud-day">
              📅 {s.day}
              <small>/{DAYS}일</small>
            </b>
            <span class="jr-coins">🪙 {s.coins}</span>
          </header>
          <Road s={s} />
          <div class="jr-screen">
            <Stage s={s} art={props.art} name={props.name} lost={lost} />
            <div class="jr-meters">
              <Bar now={s.hp} max={st.maxHp} cls="hp" label="❤️" from={s.fx?.hp0} />
              <Bar now={s.xp} max={xpNeed(s.lv)} cls="xp" label={`⭐ Lv.${s.lv}`} />
            </div>
            <div class="jr-stats">
              <span title="공격력">⚔️ {st.atk}</span>
              <span title="방어력">🛡️ {st.def}</span>
              <span title="물리친 적">💥 {s.kills}</span>
              <span title="몬스터 레벨">👾 Lv.{((s.ch ?? 1) - 1) * DAYS + Math.max(1, s.day)}</span>
            </div>
          </div>
        </div>
        <Preload ch={s.ch} />
        <div class="jr-console">
          <Log lines={s.today} />
          <div class="jr-pad">
            <Choice run={run} />
            {!s.pending && (
              <div class="jr-go">
                <Act run={run} a="next" cls="btn btn-primary jr-next">
                  ▶ 다음 날
                </Act>
                <Act run={run} a="auto" cls="btn jr-skip">
                  ⏩ 고를 때까지
                </Act>
              </div>
            )}
            <Act run={run} a="idle" idle>
              {null}
            </Act>
            <label class="jr-auto" hidden data-auto-toggle>
              <input type="checkbox" />
              <span>
                <b>🤖 자동</b> 켜 두면 스킬·갈림길·상점까지 알아서 골라요
              </span>
            </label>
          </div>
        </div>
        <details class="jr-drawer">
          <summary>⭐ 배운 스킬 {Object.values(s.skills).filter((l) => (l ?? 0) > 0).length}개 · 📜 지난 일</summary>
          <SkillChips s={s} />
          {s.journal.length > 0 && (
            <ul class="jr-journal-list">
              {s.journal
                .filter((l) => l.icon !== '🤖')
                .map((l) => (
                  <li class={l.tone ? `tone-${l.tone}` : l.icon === '📅' ? 'day' : ''}>
                    <span aria-hidden="true">{l.icon}</span> {l.text}
                  </li>
                ))}
            </ul>
          )}
        </details>
      </div>
      <form method="post" action="/api/journey/quit" class="jr-quit">
        <input type="hidden" name="run" value={run.row.id} />
        <button class="btn btn-small btn-ghost" type="submit">
          원정 그만두기 (보상 없음)
        </button>
      </form>
    </section>
  );
}

// 장 고르기: 열린 장만 누를 수 있어요. 기본은 가장 높은 장.
// 앞 장 대장을 이겨야 하고, 4장부터는 도감 카드도 모아야 열려요(src/unlock.ts).
function ChapterPick(props: { unlocked: number; dogam: DogamProgress; today: number; again?: boolean }) {
  const pick = Math.min(props.unlocked, journeyOpenTo(props.dogam));
  return (
    <form method="post" action="/api/journey/start" class="jr-chapters">
      <div class="jr-chapter-list">
        {CHAPTERS.map((c) => {
          const need = journeyNeed(c.n);
          const dogamOk = meets(need, props.dogam);
          const open = c.n <= props.unlocked && dogamOk;
          const boss = picOf('foe', c.boss.key);
          return (
            <label class={`jr-chapter${open ? '' : ' locked'}`}>
              <input type="radio" name="ch" value={c.n} checked={c.n === pick} disabled={!open} />
              <span class="jr-chapter-pic" aria-hidden="true">
                {boss ? <img src={boss.src} alt="" loading="lazy" /> : <span>{c.boss.emoji}</span>}
              </span>
              <b>{c.n}장</b>
              <span class="jr-chapter-name">{open ? c.name : c.n <= props.unlocked ? '📖 도감이 필요해요' : '잠겨 있어요'}</span>
              <span class="hint">{chapterLevels(c.n)}</span>
              {need.cards > 0 && (
                <span class={`jr-need${dogamOk ? ' ok' : ''}`} title={needText(need, props.dogam)}>
                  {dogamOk ? '📖 도감 ✓' : `📖 ${shortNeed(need)}`}
                </span>
              )}
            </label>
          );
        })}
      </div>
      <p class="jr-rate">
        🪙 아직 못 깬 장은 젤코인이 다 모여요. 이미 깬 장을 다시 돌면 오늘 {props.today}판째라 다음 판은 <b>{bankRate(props.today)}%</b>만 모여요 (100% → 50% → 25% → 0%, 내일 다시 100%)
      </p>
      <button class="btn btn-primary jr-depart" type="submit">
        🎒 {props.again ? '다시 떠나기' : '원정 떠나기'}
      </button>
    </form>
  );
}

function Result(props: { run: JourneyRun; art: string; name: string; unlocked: number; dogam: DogamProgress; today: number; going: boolean }) {
  const { run } = props;
  const s = run.state;
  return (
    <section class="jr-game jr-result" id="now">
      <span class="eyebrow">{s.cleared ? '원정 성공' : '원정 끝'}</span>
      <Stage s={s} art={props.art} name={props.name} lost={!s.cleared} />
      <div class="jr-result-head">
        <div>
          <h2>
            {s.cleared
              ? `🏆 ${chapterOf(s.ch).boss.name}${(chapterOf(s.ch).boss.name.charCodeAt(chapterOf(s.ch).boss.name.length - 1) - 0xac00) % 28 > 0 ? '을' : '를'} 물리쳤어요!`
              : `🏳️ ${chapterOf(s.ch).name} ${s.day}일째에서 멈췄어요`}
          </h2>
          <p class="hint">
            Lv.{s.lv} · 물리친 적 {s.kills} · 스킬 {Object.keys(s.skills).length}개
          </p>
        </div>
      </div>
      <Log lines={s.today} />
      <p class="jr-bank">
        {s.banked !== undefined && s.bankPct !== undefined && s.bankPct < 100
          ? `남은 젤코인 🪙 ${s.coins}개 중 ${s.bankPct}%인 🪙 ${s.banked}개를 `
          : `남은 젤코인 🪙 ${s.banked ?? s.coins}개를 `}
        <a href="#perks">원정 준비소</a>에 모았어요.
        {(s.matsBanked ?? 0) > 0 && ` 강화 재료 ${material(s.ch ?? 1).icon} ${material(s.ch ?? 1).name} ×${s.matsBanked}도 가방에 넣었어요.`}
        {s.bankPct !== undefined && s.bankPct < 100 && <span class="hint"> 이미 깬 장을 다시 돌면 하루에 모이는 젤코인이 줄어요. 아직 못 깬 장은 언제나 100%예요.</span>}
      </p>
      <p>
        {run.row.xp > 0
          ? `보상: 내 카드 경험치 +${run.row.xp}${run.row.jelly ? `, 도감 젤리 +${run.row.jelly}` : ''}`
          : `오늘 보상은 이미 ${DAILY_REWARD_JOURNEYS}번 받았어요. 내일 다시 받을 수 있어요.`}
      </p>
      {props.going
        ? <a class="btn btn-primary" href="/expedition/go#now">진행 중인 원정 이어 하기</a>
        : <ChapterPick unlocked={props.unlocked} dogam={props.dogam} today={props.today} again />}
    </section>
  );
}

// 원정 준비소: 훈련(젤코인으로 조금씩) + 장비 강화(장마다 나오는 재료로 한 단계씩)
const BASE = { atk: 12, hp: 100, def: 2 };
const STAT_ROWS = [
  { icon: '⚔️', name: '공격력', base: BASE.atk, perk: 'atk', gear: 'weapon' },
  { icon: '❤️', name: '체력', base: BASE.hp, perk: 'hp', gear: 'charm' },
  { icon: '🛡️', name: '방어력', base: BASE.def, perk: 'def', gear: 'armor' },
] as const;

export type PrepTab = 'bag' | 'train' | 'gear';
export const PREP_TABS: { id: PrepTab; icon: string; name: string }[] = [
  { id: 'bag', icon: '🎒', name: '가방' },
  { id: 'train', icon: '🏋️', name: '훈련' },
  { id: 'gear', icon: '⚒️', name: '장비 강화' },
];
export const prepTab = (v: string | undefined): PrepTab | null => (PREP_TABS.some((t) => t.id === v) ? (v as PrepTab) : null);

const PaneTitle = (props: { id: PrepTab }) => {
  const t = PREP_TABS.find((x) => x.id === props.id)!;
  return (
    <h3 class="jp-pane-title">
      <span aria-hidden="true">{t.icon}</span> {t.name}
    </h3>
  );
};

function PerkPanel(props: { bank: JourneyBank; going: boolean; unlocked: number; art: string; name: string; tab: PrepTab | null }) {
  const { bank } = props;
  const later = props.going ? '지금 원정이 끝난 뒤 ' : '';
  const matTotal = Object.values(bank.mats).reduce((a, b) => a + b, 0);
  const canTrain = PERK_IDS.some((id) => bank[id] < perkMax(id, props.unlocked) && bank.coins >= perkCost(bank[id]));
  const canGear = GEAR_IDS.some((id) => {
    if (bank[id] >= GEAR_MAX) return false;
    const n = gearNeed(bank[id] + 1);
    return (bank.mats[n.ch] ?? 0) >= n.mats && bank.coins >= n.coins;
  });
  const badge: Record<PrepTab, string | null> = { bag: matTotal ? String(matTotal) : null, train: canTrain ? '!' : null, gear: canGear ? '!' : null };
  const tabs = (cls: string) => (
    <nav class={`jp-tabs ${cls}`} aria-label="원정 준비소">
      {PREP_TABS.map((t) => (
        <a class={`jp-tab${props.tab === t.id ? ' on' : ''}`} href={props.tab === t.id ? '?#perks' : `?prep=${t.id}#perks`} aria-current={props.tab === t.id ? 'page' : undefined}>
          <span class="jp-tab-icon" aria-hidden="true">
            {t.icon}
          </span>
          <b>{t.name}</b>
          {badge[t.id] && <span class="jp-badge">{badge[t.id]}</span>}
        </a>
      ))}
    </nav>
  );
  return (
    <section class="panel jp" id="perks">
      <div class="jp-head">
        <h2>🏕️ 원정 준비소</h2>
        <span class="jp-coins" title="모은 젤코인">
          🪙 {bank.coins}
        </span>
      </div>
      <div class="jp-hero">
        <div class="jp-doll">
          {GEAR_IDS.map((id) => (
            <a class={`jp-slot jp-slot-${id}`} href="?prep=gear#perks" title={`${GEAR[id].name} +${bank[id]} · ${gearText(id, bank[id])}`}>
              <span aria-hidden="true">{GEAR[id].icon}</span>
              <b>+{bank[id]}</b>
            </a>
          ))}
          <div class="jp-hero-pic">
            <img src={props.art} alt={props.name} width={112} height={112} loading="lazy" />
          </div>
        </div>
        <ul class="jp-stats">
          {STAT_ROWS.map((r) => {
            const perk = PERKS[r.perk].per * bank[r.perk];
            const g = gearBonus(r.gear, bank[r.gear]);
            return (
              <li>
                <span class="jp-stat-icon" aria-hidden="true">
                  {r.icon}
                </span>
                <span class="jp-stat-name">{r.name}</span>
                <strong>{r.base + perk + g}</strong>
                <small>
                  기본 {r.base} · 훈련 +{perk} · 장비 +{g}
                </small>
              </li>
            );
          })}
        </ul>
        {tabs('jp-tabs-pc')}
      </div>
      {tabs(`jp-tabs-m${props.tab ? ' open' : ''}`)}
      {!props.tab && (
        <p class="hint jp-tip">
          훈련은 젤코인으로 조금씩, 장비는 장마다 나오는 재료로 한 단계씩 크게 강해져요. 버튼을 눌러 들어가 보세요. 모두 {later}다음 원정부터 적용돼요.
        </p>
      )}
      {props.tab === 'bag' && (
        <div class="jp-pane">
          <PaneTitle id="bag" />
          <p class="hint">장마다 나오는 강화 재료예요. 장비를 올릴 때 써요.</p>
      <div class="jp-bag">
        {MATERIALS.map((m, i) => {
          const n = bank.mats[i + 1] ?? 0;
          const known = i + 1 <= props.unlocked;
          return (
            <span class={`jp-mat${n ? '' : ' empty'}${known ? '' : ' unknown'}`} title={known ? `${i + 1}장에서 나와요` : '아직 못 가 본 장'}>
              <span aria-hidden="true">{known ? m.icon : '❔'}</span>
              <span class="jp-mat-name">{known ? m.name : `${i + 1}장 재료`}</span>
              <b>×{n}</b>
            </span>
          );
        })}
      </div>

          <p class="hint jp-drop">
            재료는 그 장의 몬스터에게서 가끔(강한 적은 더 자주) 나오고, 대장은 꼭 1개 줘요. 처음 대장을 깨면 2개 더 받아요. 깬 장을 다시 돌면 재료는 하루 제한 없이 모이지만 나올 확률이 낮아요(대장도 가끔만 줘요).
          </p>
        </div>
      )}
      {props.tab === 'train' && (
        <div class="jp-pane">
          <PaneTitle id="train" />
          <p class="hint">젤코인으로 시작 능력치를 올려요. 열린 장이 늘수록 한도가 커져요.</p>
      <div class="jp-train">
        {PERK_IDS.map((id) => {
          const info = PERKS[id];
          const lv = bank[id];
          const max = perkMax(id, props.unlocked);
          const full = lv >= max;
          const cost = perkCost(lv);
          return (
            <form method="post" action="/api/journey/perk" class="jp-row-form">
              <input type="hidden" name="k" value={id} />
              <button type="submit" class="jp-row" disabled={full || bank.coins < cost}>
                <span class="jp-row-icon" aria-hidden="true">
                  {info.icon}
                </span>
                <span class="jp-row-main">
                  <span class="jp-row-top">
                    <b>{info.name}</b>
                    <span class="jp-lv">
                      Lv.{lv}
                      <small>/{max}</small>
                    </span>
                  </span>
                  <span class="jp-bar" aria-hidden="true">
                    <i style={`width:${Math.round((Math.min(lv, max) / Math.max(1, max)) * 100)}%`} />
                  </span>
                  <span class="jp-row-next">{full ? `${info.text(lv)} · 이 장까지는 끝! 새 장이 열리면 더 올라가요` : `${info.text(lv)} → 다음 ${info.text(lv + 1)}`}</span>
                </span>
                <span class={`jp-price${full ? ' done' : ''}`}>{full ? 'MAX' : `🪙 ${cost}`}</span>
              </button>
            </form>
          );
        })}
      </div>

        </div>
      )}
      {props.tab === 'gear' && (
        <div class="jp-pane">
          <PaneTitle id="gear" />
          <p class="hint">+N으로 올리려면 N장 재료와 젤코인이 들어요. 장을 깰수록 차례로 강해져요.</p>
      <div class="jp-gear">
        {GEAR_IDS.map((id) => {
          const info = GEAR[id];
          const lv = bank[id];
          const full = lv >= GEAR_MAX;
          const need = gearNeed(lv + 1);
          const mat = material(need.ch);
          const have = bank.mats[need.ch] ?? 0;
          const seen = need.ch <= props.unlocked;
          const ok = !full && have >= need.mats && bank.coins >= need.coins;
          return (
            <form method="post" action="/api/journey/gear" class="jp-gear-form">
              <input type="hidden" name="k" value={id} />
              <div class={`jp-item${full ? ' full' : ''}`}>
                <div class="jp-item-pic">
                  <span aria-hidden="true">{info.icon}</span>
                  <b class="jp-plus">+{lv}</b>
                </div>
                <b>{info.name}</b>
                <span class="jp-item-now">{gearText(id, lv)}</span>
                {full ? (
                  <span class="jp-item-need">끝까지 강화했어요!</span>
                ) : (
                  <>
                    <span class="jp-item-next">+{lv + 1}: {gearText(id, lv + 1)}</span>
                    <span class={`jp-item-need${have >= need.mats ? ' ok' : ''}`}>
                      {seen ? `${mat.icon} ${mat.name}` : `❔ ${need.ch}장 재료`} {have}/{need.mats}
                    </span>
                    <span class={`jp-item-need${bank.coins >= need.coins ? ' ok' : ''}`}>🪙 {need.coins}</span>
                  </>
                )}
                <button type="submit" class={`btn btn-small jp-up${ok ? ' btn-primary' : ''}`} disabled={!ok}>
                  {full ? 'MAX' : seen ? '강화' : `${need.ch}장에서 재료 모으기`}
                </button>
              </div>
            </form>
          );
        })}
      </div>
        </div>
      )}
    </section>
  );
}

export function JourneyPage(props: {
  viewer: Member;
  art: string;
  run: JourneyRun | null;
  result: JourneyRun | null;
  record: JourneyRecord;
  bank: JourneyBank;
  dogam: DogamProgress;
  notice?: string;
  prep?: string;
}) {
  const { run, result, record } = props;
  const name = props.viewer.display_name;
  const home = chapterOf(record.unlocked);
  return (
    <Layout title="하리보 원정대" viewer={props.viewer} active="expedition">
      <Popup lines={props.notice && Object.hasOwn(NOTICES, props.notice) ? NOTICES[props.notice] ?? [] : []} />
      <div class="stack jr" data-fresh>
        <div class="jr-title">
          <h1>🧭 하리보 원정대</h1>
          <span class="jr-reward" title="오늘 보상 받은 판">
            🎁 {Math.min(record.rewardedToday, DAILY_REWARD_JOURNEYS)}/{DAILY_REWARD_JOURNEYS}
          </span>
          <details class="jr-help">
            <summary aria-label="하는 법">?</summary>
            <div>
              <p>
                내 캐릭터가 하루씩 걸어가요. 싸움은 알아서 하고, 레벨이 오르면 스킬 3개 중 하나를 골라요. {ELITE_DAY}일째 강한 적, {DAYS}일째 대장을 이기면 그
                장을 깨고 다음 장이 열려요.
              </p>
              <p>장이 올라갈수록 몬스터 레벨이 20씩 올라가요(1장 Lv.1~20, 2장 Lv.21~40…).</p>
              <p>
                하루 첫 {DAILY_REWARD_JOURNEYS}판은 끝날 때 내 카드 경험치를 받고(멀리 갈수록, 높은 장일수록 많이), 내가 깬 가장 높은 장(또는 처음 깨는 장)의 대장을 이기면 도감 젤리 1개도 받아요. 남은
                젤코인과 강화 재료는 원정 준비소에 모여요.
              </p>
            </div>
          </details>
        </div>
        {result ? <Result run={result} art={props.art} name={name} unlocked={record.unlocked} dogam={props.dogam} today={record.farmedToday} going={!!run} /> : run ? <Play run={run} art={props.art} name={name} /> : null}
        {!run && !result && (
          <section class="jr-game jr-lobby" id="now">
            <div class="jr-lobby-stage" style={`--jr-bg:url(/journey/bg/${zoneFor(1)}.webp)`}>
              <span class="jr-place">출발 준비</span>
              <div class="jr-hero">
                <img src={props.art} alt={name} width={96} height={96} />
                <span class="jr-shadow" />
              </div>
              <div class="jr-lobby-stats">
                <span>🏔️ 가장 높이 Lv.{record.best}</span>
                <span>🏆 대장 {record.clears}번</span>
                <span>
                  📍 {record.unlocked}장 {home.name}
                </span>
              </div>
            </div>
            <h2 class="jr-pick-title">어느 장으로 떠날까요?</h2>
            <ChapterPick unlocked={record.unlocked} dogam={props.dogam} today={record.farmedToday} />
          </section>
        )}
        <PerkPanel bank={props.bank} going={!!run} unlocked={Math.min(record.unlocked, journeyOpenTo(props.dogam))} art={props.art} name={name} tab={prepTab(props.prep)} />
        <FictionNote />
      </div>
    </Layout>
  );
}
