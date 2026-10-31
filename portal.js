const el = id => document.getElementById(id);
let config, viewer = sessionStorage.getItem('pet-release-viewer') || '', adminToken = '', configured = true, releases = [], busy = false, draft = null, releaseNotes = {};
const size = bytes => bytes >= 1024 * 1024 ? (bytes / 1024 / 1024).toFixed(1) + 'MB' : Math.ceil(bytes / 1024) + 'KB';
const date = value => value ? new Date(value).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }) : '';
function compareVersion(a, b) {
  const parse = v => { const [core, pre] = v.split('-'); return [core.split('.').map(Number), pre?.split('.')]; };
  const [x, xp] = parse(a), [y, yp] = parse(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  if (!xp || !yp) return xp ? -1 : yp ? 1 : 0;
  for (let i = 0; i < Math.max(xp.length, yp.length); i++) {
    if (xp[i] === undefined || yp[i] === undefined) return xp[i] === undefined ? -1 : 1;
    if (xp[i] === yp[i]) continue;
    const xn = /^\d+$/.test(xp[i]), yn = /^\d+$/.test(yp[i]);
    return xn && yn ? Number(xp[i]) - Number(yp[i]) : xn !== yn ? (xn ? -1 : 1) : xp[i].localeCompare(yp[i]);
  }
  return 0;
}
async function api(route, body, admin = false, raw = false) {
  const headers = { 'X-Portal-Session': viewer };
  if (admin) headers.Authorization = 'Bearer ' + adminToken;
  if (!raw) headers['Content-Type'] = 'application/json';
  else headers['X-File-Size'] = String(body.size);
  const response = await fetch(config.endpoint + route, { method: body ? 'POST' : 'GET', headers, body: body ? raw ? body : JSON.stringify(body) : undefined, signal: AbortSignal.timeout(raw ? 140000 : 90000) });
  const result = await response.json();
  if (!response.ok) { if (response.status === 401) { if(admin){adminToken='';adminView('admin-login');}else if(route!=='/login')leave(); } throw Error(result.error || '요청을 처리하지 못했습니다.'); }
  return result;
}
function leave() {
  viewer = ''; sessionStorage.removeItem('pet-release-viewer'); el('content').hidden = true; el('entrance').hidden = false; el('viewer-exit').hidden = true; el('history-link').hidden = true;
}
async function download(file, status = el('page-status')) {
  if (busy) return; busy = true; status.textContent = '다운로드 링크를 준비하고 있어요.';
  try {
    const result = await api('/files/' + file.id), url = new URL(result.url);
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.githubusercontent.com')) throw Error('다운로드 주소를 확인하지 못했습니다.');
    const link = document.createElement('a'); link.href = url.href; link.rel = 'noreferrer'; link.click(); status.textContent = '';
  } catch (error) { status.textContent = error.message; } finally { busy = false; }
}
function render() {
  releases.sort((a, b) => compareVersion(b.version, a.version));
  const latest = releases[0];
  el('latest-title').textContent = latest?.version || '준비 중';
  document.querySelector('.badge').hidden = !latest?.version.includes('-');
  el('latest-note').textContent = latest?.notes.split('\n').find(Boolean)?.slice(0, 140) || '새 버전을 준비하고 있습니다.';
  el('latest-date').textContent = date(latest?.date);
  // A newer delta may use the most recent compatible full base.
  const baseRelease = releases.find(r => r.files.some(f => /^WindowsPet-.*-win-x64\.zip$/.test(f.name)));
  const base = baseRelease?.files.find(f => /^WindowsPet-.*-win-x64\.zip$/.test(f.name));
  el('base-download').disabled = !base;
  el('base-download').onclick = () => download(base);
  el('download-description').textContent = base ? 'ZIP · ' + size(base.bytes) + (baseRelease.version !== latest?.version ? ' · 기본 ' + baseRelease.version : '') : '기본 버전 배포를 기다리고 있어요.';
  const list = el('history-list'); list.replaceChildren();
  for (const release of releases) {
    const article = document.createElement('article'); article.className = 'history-item';
    const left = document.createElement('div'); left.className = 'history-version';
    const title = document.createElement('h3'); title.textContent = release.version;
    const time = document.createElement('time'); time.textContent = date(release.date); if (release.date) time.dateTime = release.date;
    left.append(title, time);
    const right = document.createElement('div'); right.className = 'history-detail';
    const notes = document.createElement('p'); notes.textContent = release.notes || '업데이트 내용이 등록되지 않았습니다.'; right.append(notes);
    const files = document.createElement('div'); files.className = 'file-actions';
    for (const file of release.files.filter(f => /\.(zip|petupdate)$/.test(f.name))) {
      const button = document.createElement('button'); button.type = 'button';
      const label=file.name.endsWith('.petupdate')?'업데이트 파일':'프로그램';
      button.textContent=label+' 받기 · '+size(file.bytes);button.title=file.name;button.onclick = () => download(file); files.append(button);
    }
    right.append(files); article.append(left, right); list.append(article);
  }
  el('content').hidden = false; el('entrance').hidden = true; el('viewer-exit').hidden = false; el('history-link').hidden = false;
}
async function refresh() { releases = (await api('/catalog')).releases; render(); }
el('entrance-form').onsubmit = async event => {
  event.preventDefault(); if (busy || !config) return; busy = true; el('entrance-form').querySelector('button').disabled = true; el('entrance-status').textContent = '확인 중이에요.';
  try { viewer = (await api('/login', { password: el('entrance-password').value })).token; sessionStorage.setItem('pet-release-viewer', viewer); el('entrance-password').value = ''; await refresh(); el('entrance-status').textContent = ''; }
  catch (error) { el('entrance-status').textContent = error.message; } finally { busy = false; el('entrance-form').querySelector('button').disabled = false; }
};
el('viewer-exit').onclick = leave;
el('admin-open').onclick = () => el('admin-dialog').showModal();
el('admin-close').onclick = () => { if (!busy) el('admin-dialog').close(); };
el('admin-dialog').addEventListener('cancel', event => { if (busy) event.preventDefault(); });
function adminView(mode) {
  for (const id of ['admin-login', 'admin-setup', 'admin-upload']) el(id).hidden = id !== mode;
  el('admin-logout').hidden = !adminToken;
  el('admin-maintenance').hidden = mode !== 'admin-upload';
}
function lockAdmin(value) { for (const item of el('admin-dialog').querySelectorAll('button,input,textarea')) item.disabled = value; }
el('admin-login').onsubmit = async event => {
  event.preventDefault(); if (busy || !config) return; busy = true; lockAdmin(true); el('admin-status').textContent = '본인 확인 중이에요.';
  try {
    const response = await fetch(config.supabaseUrl + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: config.publishableKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: el('admin-email').value.trim(), password: el('admin-password').value }), signal: AbortSignal.timeout(15000) });
    const value = await response.json(); if (!response.ok || !value.access_token) throw Error('이메일과 기존 앱 비밀번호를 확인해 주세요.');
    adminToken = value.access_token; el('admin-password').value = '';
    if (configured) { await api('/admin/status', null, true); adminView('admin-upload'); } else adminView('admin-setup');
    el('admin-status').textContent = '';
  } catch (error) { adminToken = ''; el('admin-status').textContent = error.message; } finally { busy = false; lockAdmin(false); }
};
el('admin-setup').onsubmit = async event => {
  event.preventDefault(); if (busy) return; busy = true; lockAdmin(true); el('admin-status').textContent = '최초 설정을 저장하고 있어요.';
  try {
    await api('/admin/setup', { code: el('setup-code').value.trim(), password: el('setup-password').value, githubToken: el('setup-github').value.trim() }, true);
    for (const id of ['setup-code', 'setup-password', 'setup-github']) el(id).value = '';
    configured = true; adminView('admin-upload'); el('admin-status').textContent = '관리자 등록을 마쳤습니다. 입장 비밀번호를 아는 사람은 누구나 내려받을 수 있어요.';
  } catch (error) { el('admin-status').textContent = error.message; } finally { busy = false; lockAdmin(false); }
};
el('release-files').onchange = async () => {
  if (draft) return;
  const index = [...el('release-files').files].find(f => /^(update|base)-index\.json$/.test(f.name));
  if (index && index.size < 1500000) { try {
    const metadata = JSON.parse(await index.text()).metadata;
    el('release-version').value = metadata.version;
    el('release-notes').value = metadata.notes || releaseNotes[metadata.version] || '';
  } catch { /* User can correct the version and notes. */ } }
};
el('admin-upload').onsubmit = async event => {
  event.preventDefault(); if (busy) return; busy = true; lockAdmin(true);
  try {
    const files = [...el('release-files').files];
    const indexes = files.filter(f => /^(update|base)-index\.json$/.test(f.name));
    if (!indexes.length) throw Error('서명된 배포 정보 JSON도 함께 선택해 주세요.');
    for (const index of indexes) {
      if (index.size > 1500000) throw Error('배포 정보 JSON이 너무 큽니다.');
      const metadata = JSON.parse(await index.text()).metadata;
      const expected = [...(metadata.patches || []), ...(metadata.base ? [metadata.base] : [])];
      if (!expected.length) throw Error('배포 정보의 파일 목록을 확인해 주세요.');
      for (const entry of expected) {
        const file = files.find(f => f.name === entry.name);
        if (!file) throw Error(entry.name + '도 함께 선택해 주세요. 파일 선택 창에서 Ctrl을 누르고 여러 파일을 고를 수 있어요.');
        if (file.size !== entry.bytes) throw Error(entry.name + '의 크기가 배포 정보와 다릅니다. 같은 폴더에서 생성된 파일을 선택해 주세요.');
      }
    }
    const version = el('release-version').value.trim(), notes = el('release-notes').value.trim();
    if (draft && draft.version !== version) throw Error('기존 초안 업로드를 먼저 마치거나 GitHub에서 확인해 주세요.');
    if (!draft) { el('admin-status').textContent = '배포 초안을 만들고 있어요.'; draft = { ...(await api('/admin/releases', { version, notes }, true)), version, uploaded: new Set() }; }
    for (let i = 0; i < files.length; i++) {
      const file = files[i]; if (draft.uploaded.has(file.name)) continue;
      el('admin-status').textContent = `올리는 중 (${i + 1}/${files.length}) · ${file.name}`;
      await api('/admin/releases/' + draft.id + '/assets?name=' + encodeURIComponent(file.name), file, true, true); draft.uploaded.add(file.name);
    }
    el('admin-status').textContent = '파일을 검증하고 게시하고 있어요.';
    await api('/admin/releases/' + draft.id + '/publish', {}, true); draft = null;
    el('admin-status').textContent = '게시했습니다. 앱에서 최신 버전을 확인할 수 있어요.'; el('admin-upload').reset();
    if (viewer) await refresh();
  } catch (error) { el('admin-status').textContent = error.message + (draft ? ' 업로드한 초안은 GitHub에 보관됩니다.' : ''); }
  finally { busy = false; lockAdmin(false); }
};
el('token-replace').onsubmit = async event => {
  event.preventDefault(); if (busy) return; busy = true; lockAdmin(true);
  el('admin-status').textContent = '새 연동 키를 확인하고 있어요.';
  try {
    await api('/admin/github-token', { githubToken: el('replacement-token').value.trim() }, true);
    el('replacement-token').value = ''; el('admin-status').textContent = '연동 키를 교체했습니다. 기존 입장 비밀번호와 배포 파일은 그대로입니다.';
  } catch (error) { el('admin-status').textContent = error.message; }
  finally { busy = false; lockAdmin(false); }
};
el('admin-logout').onclick = () => { if (busy) return; adminToken = ''; draft = null; el('replacement-token').value = ''; adminView('admin-login'); el('admin-status').textContent = ''; };
async function initialize() {
  try {
    const response = await fetch('config.json'); if (!response.ok) throw Error('배포 연결을 준비하고 있습니다.'); config = await response.json();
    try { const notes = await fetch('release-notes.json'); if (notes.ok) releaseNotes = await notes.json(); } catch { /* Signed future indexes carry their own notes. */ }
    const status = await api('/status'); configured = status.configured;
    if (!configured) el('entrance-status').textContent = '관리자의 최초 설정을 기다리고 있어요.';
    else if (viewer) { try { await refresh(); } catch { leave(); } }
  } catch (error) { el('entrance-status').textContent = error.message; }
}
initialize();
