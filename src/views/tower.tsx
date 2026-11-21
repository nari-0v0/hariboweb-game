import type { Member } from '../env';
import type { JourneyBank } from '../journey-db';
import { bankPet } from '../journey-db';
import { material, startJourney, stat, type JourneyState } from '../journey';
import { PETS, petText } from '../pets';
import { BOOSTS, BOOST_IDS, TOWER_OPEN, boostCost, boostPrice, isBossFloor, towerAutoEnd, towerCoins, towerFoe, towerMat, towerMonster } from '../tower';
import type { TowerLast, TowerRank } from '../tower-db';
import { Bar, Stage, fightPlan } from './journey';
import { Layout } from './layout';
import { FictionNote } from './fiction';
import { jo } from '../josa';
import { Popup, type PopupLine } from './shop';

const NOTICES: Record<string, PopupLine[]> = {
  stale: [{ title: '알림', text: '다른 화면에서 이미 도전했어요. 지금 층을 보여 드려요.' }],
  fast: [{ title: '알림', text: '조금만 천천히 눌러 주세요.' }],
  nocoins: [{ title: '알림', text: '젤코인이 모자라서 잠깐 강해지기를 살 수 없어요.' }],
  locked: [{ title: '알림', text: `원정대 ${TOWER_OPEN}장을 깨면 열려요.` }],
  bad: [{ title: '알림', text: '지금은 그렇게 할 수 없어요.' }],
  error: [
    { title: '오류', text: '오류가 발생하였습니다.', bad: true },
    { title: '오류', text: '방장에게 문의해주세요.', bad: true, contact: true },
  ],
};

export function TowerPage(props: { viewer: Member; art: string; bank: JourneyBank; top: number; ranking: TowerRank[]; last: TowerLast | null; notice?: string }) {
  const { bank, top, last } = props;
  const name = props.viewer.display_name;
  const open = top >= TOWER_OPEN;
  const floor = bank.tower + 1;
  const pet = bankPet(bank);
  // 지금 내 능력치(훈련·장비·펫). 잠깐 강해지기는 고른 만큼 싸울 때만 더해요.
  const me: JourneyState = startJourney('tower', bank, 1, bank, [], pet);
  const st = stat(me);
  const foe = towerFoe(floor);
  const monster = towerMonster(floor);
  const mat = towerMat(floor, top);
  const fought: JourneyState | null = last ? { ...me, fx: last.fight.fx } : null;
  const plan = last ? fightPlan(last.fight.fx) : null;
  // 진 층을 다시 할 때만 쓴 물약을 미리 골라 둬요(이긴 뒤 다음 층에서 모르고 또 사지 않게).
  // 젤코인이 모자라면 미리 고르지 않아요(누르면 「젤코인이 모자라요」만 떠서 하나씩 풀어야 했어요, 3차 점검).
  const again = last && !last.won ? last.boosts : [];
  const picked = new Set(again.length && boostCost(again, floor) <= bank.coins ? again : []);
  return (
    <Layout title="끝없는 탑" viewer={props.viewer} active="expedition">
      <Popup lines={props.notice && Object.hasOwn(NOTICES, props.notice) ? NOTICES[props.notice] ?? [] : []} />
      <div class="stack jr tw">
        <div class="jr-title">
          <h1>🗼 끝없는 탑</h1>
          <a class="btn btn-small btn-ghost" href="/expedition/go">
            ← 원정대
          </a>
        </div>
        {!open ? (
          <section class="panel">
            <p>
              원정대 {TOWER_OPEN}장 대장을 깨면 열려요. 지금은 {top}장까지 깼어요.
            </p>
          </section>
        ) : (
          <section class="jr-game" id="now">
            <div class={plan ? 'jr-fighting' : undefined} style={plan ? `--reveal:${plan.reveal}ms` : undefined}>
              <div class="jr-view">
                <header class="jr-hud">
                  <span class="jr-hud-ch">🏆 최고 {bank.tower}층</span>
                  <b class="jr-hud-day">
                    🗼 {last ? last.floor : floor}
                    <small>층</small>
                  </b>
                  <span class="jr-coins">🪙 {bank.coins}</span>
                </header>
                <div class="jr-screen">
                  {fought && last ? (
                    <Stage s={fought} art={props.art} name={name} lost={!last.won} bg="/journey/bg/tower.webp" place={`끝없는 탑 ${last.floor}층`} />
                  ) : (
                    <Stage s={me} art={props.art} name={name} lost={false} bg="/journey/bg/tower.webp" place={`끝없는 탑 ${floor}층`} foeKey={monster.key} />
                  )}
                  <div class="jr-meters">
                    {last ? (
                      <Bar now={Math.max(0, last.fight.fx.php?.at(-1) ?? last.fight.maxHp)} max={last.fight.maxHp} cls="hp" label="❤️" from={last.fight.fx.hp0} steps={plan?.heroHp} />
                    ) : (
                      <Bar now={st.maxHp} max={st.maxHp} cls="hp" label="❤️" />
                    )}
                  </div>
                  <div class="jr-stats">
                    {/* 결과 화면은 그 싸움에 쓴 능력치(물약 포함)를 보여 줘요 */}
                    <span title="공격력">⚔️ {last ? last.fight.atk : st.atk}</span>
                    <span title="방어력">🛡️ {last ? last.fight.def : st.def}</span>
                    {pet && <span title={petText(pet.id, pet.lv)}>🐾 {PETS[pet.id].name} Lv.{pet.lv}</span>}
                  </div>
                </div>
              </div>
              <div class="jr-console">
                {last && (
                  <ul class="jr-today jr-talk" role="status">
                    {last.auto && (
                      <li>
                        🤖 자동 도전: {last.auto.cleared > 0 ? `${last.auto.from}층부터 ${last.auto.from + last.auto.cleared - 1}층까지 ${last.auto.cleared}개 층을 올랐어요.` : `${last.auto.from}층에서 바로 멈췄어요.`}
                      </li>
                    )}
                    {last.won ? (
                      <li class="tone-good">
                        🎉 {last.floor}층 {jo(last.foe.name, '을', '를')} 물리쳤어요! {last.auto ? '모두 합쳐 ' : ''}젤코인 +{last.coins}
                        {last.mat ? `, ${material(last.mat.ch).icon} ${material(last.mat.ch).name} +${last.mat.n}` : ''}
                      </li>
                    ) : (
                      <li class="tone-bad">
                        😵 {last.floor}층 {last.foe.name}에게 졌어요.{last.auto && last.coins > 0 ? ` (오른 층 젤코인 +${last.coins}${last.mat ? `, ${material(last.mat.ch).icon} ${material(last.mat.ch).name} +${last.mat.n}` : ''})` : ''} 몬스터 체력이 {Math.max(0, last.fight.fx.left?.at(-1) ?? 0)} 남았어요. 원정 준비소에서 강해지거나, 잠깐 강해지기를 써 보세요.
                      </li>
                    )}
                    {last.cost > 0 && <li>🧪 잠깐 강해지기에 젤코인 {last.cost}개를 썼어요.</li>}
                  </ul>
                )}
                <div class="jr-pad">
                  <form method="post" action="/api/tower/fight" class="tw-form">
                    <input type="hidden" name="floor" value={String(floor)} />
                    <input type="hidden" name="at" value={bank.towerAt ?? ''} />
                    <p class="tw-next">
                      <b>
                        {floor}층{isBossFloor(floor) ? ' (강한 적)' : ''}: {monster.name}
                      </b>
                      <small>
                        몬스터 체력 {foe.hp} · 공격력 {foe.atk} · 이기면 🪙 {towerCoins(floor)}
                        {mat ? ` + ${material(mat.ch).icon} ${material(mat.ch).name} ${mat.n}개` : ''}
                      </small>
                    </p>
                    <fieldset class="tw-boosts">
                      <legend>잠깐 강해지기 (이번 도전에만)</legend>
                      {BOOST_IDS.map((id) => (
                        <label class="tw-boost">
                          <input type="checkbox" name="boost" value={id} checked={picked.has(id)} />
                          <span>
                            {BOOSTS[id].icon} {BOOSTS[id].name} · {BOOSTS[id].text}
                          </span>
                          <b>🪙 {boostPrice(id, floor)}</b>
                        </label>
                      ))}
                    </fieldset>
                    <button type="submit" class="btn btn-primary jr-next">
                      🗼 {floor}층 도전
                    </button>
                  </form>
                  <form method="post" action="/api/tower/auto" class="tw-form tw-auto">
                    <input type="hidden" name="floor" value={String(floor)} />
                    <input type="hidden" name="at" value={bank.towerAt ?? ''} />
                    <button type="submit" class="btn btn-ghost">
                      🤖 자동 도전 ({floor === towerAutoEnd(floor) ? `${floor}층` : `${floor}~${towerAutoEnd(floor)}층`})
                    </button>
                    <small class="tw-auto-hint">물약 없이 이어서 싸우고, 지거나 {towerAutoEnd(floor)}층을 깨면 멈춰요.</small>
                  </form>
                </div>
              </div>
            </div>
          </section>
        )}
        <section class="panel tw-rank">
          <h2>🏆 탑 순위</h2>
          {props.ranking.length ? (
            <ol>
              {props.ranking.map((r) => (
                <li class={r.user_id === props.viewer.user_id ? 'me' : undefined}>
                  <span>{r.display_name}</span>
                  <b>{r.tower}층</b>
                </li>
              ))}
            </ol>
          ) : (
            <p class="hint">아직 아무도 탑을 오르지 않았어요.</p>
          )}
        </section>
        <details class="panel tw-help">
          <summary>탑 규칙</summary>
          <ul>
            <li>원정대 {TOWER_OPEN}장을 깨면 열려요. 층마다 몬스터 하나와 싸워요. 층마다 직접 누르거나, 「자동 도전」으로 물약 없이 10층 단위 끝(10·20·30층 …)까지 이어서 오를 수 있어요. 지면 그 층에서 멈춰요.</li>
            <li>깬 층은 저장돼요. 지면 그 층부터 다시 하고, 층마다 보상은 처음 깰 때 한 번만 받아요.</li>
            <li>층을 깨면 젤코인을 10층마다 1개부터 다시 세서 줘요(1층·11층·21층 1개, 2층·12층 2개 … 10층·20층 10개), 10층마다 강화 재료 2개를 받아요. 재료는 20층마다 다음 장 재료로 바뀌지만, 내가 깬 장까지만 나와요.</li>
            <li>싸움에는 원정 준비소의 훈련·장비와 데려간 펫이 들어가요. 같은 층에서 같은 능력이면 결과도 늘 같아서, 다시 누르기만 해서는 못 넘어요.</li>
            <li>잠깐 강해지기는 도전 한 번에만 들고, 그 층 보상보다 늘 비싸요.</li>
          </ul>
        </details>
        <FictionNote />
      </div>
    </Layout>
  );
}
