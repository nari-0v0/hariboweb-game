// 카카오톡 안에서 열면(카톡 속 브라우저) 디스코드 로그인이 풀리거나 화면이 잘 안 맞아요.
// 그래서 카톡 속 브라우저일 때만 (1) 처음 한 번 바로 기본 브라우저(크롬·사파리 등)로 열어 보고,
// (2) 화면 맨 위에 "다른 브라우저로 열기" 띠를 보여 줘요. 다른 브라우저에서는 아무것도 하지 않아요.
// 카톡의 `kakaotalk://web/openExternal?url=` 주소는 안드로이드·아이폰 카톡 모두 기본 브라우저로 열어 줘요.
// 안 되는 옛 카톡을 위해 띠에 직접 여는 방법과 주소 복사 버튼도 둬요.
// 주소는 누르는 순간에 다시 읽어요(사건파일처럼 POST 뒤 app.js가 화면 주소를 바꾸는 경우).
// 화면마다 서버가 아니라 브라우저에서 판단해요(HTML을 사람마다 다르게 만들지 않아요).

export const KAKAO_UA = /KAKAOTALK/i;

/** 카톡에서 이 주소를 기본 브라우저로 여는 링크 */
export const kakaoExternalUrl = (url: string) => `kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`;

/** <body> 맨 앞에 바로 넣는 작은 스크립트(다른 파일을 받지 않아서 카톡에서 바로 움직여요) */
export const KAKAO_SCRIPT = `(function(){try{
var ua=navigator.userAgent||'';if(!/KAKAOTALK/i.test(ua))return;
var cur=function(){var u=location.href;try{var r=document.querySelector('[data-replace-url]');if(r)u=new URL(r.getAttribute('data-replace-url'),location.href).href;}catch(e){}return u.split('#')[0];};
var ext=function(){return 'kakaotalk://web/openExternal?url='+encodeURIComponent(cur());};
var ios=/iPhone|iPad|iPod/i.test(ua);
var tried=false;try{tried=sessionStorage.getItem('kk-ext')==='1';if(!tried)sessionStorage.setItem('kk-ext','1');}catch(e){tried=true;}
var bar=document.createElement('div');bar.className='kk-bar';bar.setAttribute('role','status');
var t=document.createElement('p');t.className='kk-text';t.textContent='카카오톡 안에서는 로그인이 자주 풀려요. '+(ios?'사파리':'크롬')+' 같은 기본 브라우저로 열어 주세요.';
var a=document.createElement('a');a.className='kk-open';a.href=ext();a.onclick=function(){a.href=ext();};a.textContent='🌐 기본 브라우저로 열기';
var c=document.createElement('button');c.type='button';c.className='kk-copy';c.textContent='📋 주소 복사';
c.onclick=function(){var done=function(){c.textContent='✅ 복사했어요';};var here=cur();var show=function(){c.textContent='주소: '+here;};var fall=function(){try{var i=document.createElement('textarea');i.value=here;i.setAttribute('readonly','');i.style.position='fixed';i.style.opacity='0';document.body.appendChild(i);i.select();var ok=document.execCommand('copy');document.body.removeChild(i);if(ok)done();else show();}catch(e){show();}};try{navigator.clipboard.writeText(here).then(done,fall);}catch(e){fall();}};
var h=document.createElement('p');h.className='kk-hint';h.textContent='안 열리면 '+(ios?'오른쪽 아래 공유(⋯)':'오른쪽 위 ⋮')+' 버튼 → 「다른 브라우저로 열기」를 눌러 주세요.';
var row=document.createElement('div');row.className='kk-row';row.appendChild(a);row.appendChild(c);
bar.appendChild(t);bar.appendChild(row);bar.appendChild(h);
document.body.insertBefore(bar,document.body.firstChild);
if(!tried){var go=function(){location.href=ext();};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',go);else go();}
}catch(e){}})();`;
