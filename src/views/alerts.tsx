import type { Member } from '../env';
import { ALERT_KEEP_DAYS, type Alert } from '../alerts';
import { Layout } from './layout';

const when = (iso: string) => {
  const d = new Date(Date.parse(iso) + 9 * 3_600_000);
  // 같은 날 여러 알림도 순서를 알 수 있게 시각까지(점검 W111)
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};

// 알림 목록(오른쪽 위 🔔 팝업과 /alerts 화면이 같이 써요). fresh = 이번에 처음 본 알림.
export function AlertBox(props: { alerts: Alert[]; fresh: Set<number> }) {
  const { alerts, fresh } = props;
  return (
    <div class="al-box">
      <div class="al-head">
        <b>🔔 알림</b>
        <button type="button" class="al-close" data-alert-close aria-label="알림 닫기">
          ✕
        </button>
      </div>
      {alerts.length === 0 ? (
        <p class="al-empty">새 알림이 없어요.</p>
      ) : (
        <ul class="al-list">
          {alerts.map((a) => (
            <li class={fresh.has(a.id) ? 'al-item al-new' : 'al-item'}>
              <div class="al-top">
                <span class="al-title">
                  {fresh.has(a.id) && <span class="al-tag">NEW</span>} {a.title}
                </span>
                <span class="al-when">{when(a.created_at)}</span>
              </div>
              <p class="al-body">{a.body}</p>
              <form method="post" action={`/alerts/${a.id}/delete`} data-alert-form data-no-loader>
                <button type="submit" class="al-del">
                  지우기
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
      <div class="al-foot">
        <span>알림은 {ALERT_KEEP_DAYS}일이 지나면 저절로 지워져요.</span>
        {alerts.length > 0 && (
          <form method="post" action="/alerts/clear" data-alert-form data-no-loader>
            <button type="submit" class="al-del">
              모두 지우기
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// 자바스크립트가 꺼져 있거나 주소로 바로 들어왔을 때의 화면
export function AlertsPage(props: { viewer: Member; alerts: Alert[]; fresh: Set<number> }) {
  return (
    <Layout title="알림" viewer={props.viewer}>
      <section class="panel al-page">
        <AlertBox alerts={props.alerts} fresh={props.fresh} />
      </section>
    </Layout>
  );
}
