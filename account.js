// Account and progress use the same origin as the application.
// Included inline in index.html so the static edition remains a single file.
const seen = new Set();
let signedIn = false, saving = false, pendingState = null, unsaved = false;
const apiBase = new URL('./api/', location.href);
async function api(path, method = 'GET', data) {
  const response = await fetch(new URL(path, apiBase), {
    method, credentials: 'same-origin', headers: {'Content-Type': 'application/json', 'X-Flashcards': '1'},
    ...(data === undefined ? {} : {body: JSON.stringify(data)})
  });
  if (!response.ok) throw new Error(String(response.status));
  return response.json();
}
function snapshot() {
  return {hard: [...hard], seen: [...seen], deck: deck.map(c => c.id), index,
    unit: el('unit').value, mode: el('mode').value, only: el('only').checked};
}
function accountLabel(message) {
  el('sync').textContent = message;
  el('account').textContent = signedIn ? 'tim · Выйти' : 'Войти и сохранить прогресс';
}
async function save() {
  if (!signedIn) return;
  pendingState = snapshot(); unsaved = true;
  if (saving) return;
  saving = true;
  try {
    while (pendingState) {
      const state = pendingState; pendingState = null;
      accountLabel('Сохраняем…');
      await api('progress', 'PUT', state);
    }
    unsaved = false; accountLabel('Сохранено');
  } catch (error) {
    if (error.message === '401') {
      signedIn = false; accountLabel('Сессия истекла. Войди снова.');
    } else accountLabel('Не сохранено · нажми для повтора');
  } finally {saving = false;}
}
function restore(state) {
  if (!state) return;
  hard.clear(); state.hard.forEach(id => hard.add(id));
  seen.clear(); state.seen.forEach(id => seen.add(id));
  deck = state.deck.map(id => cards[id]); index = state.index;
  el('unit').value = state.unit; el('mode').value = state.mode; el('only').checked = state.only;
  flipped = false;
}
async function loadAccount() {
  const result = await api('progress');
  restore(result.progress); signedIn = true;
  render(false); accountLabel('Сохранено');
  if (!result.progress) save();
}
el('sync').onclick = () => {if (unsaved) save();};
el('account').onclick = async () => {
  if (location.hostname.endsWith('github.io') || location.protocol === 'file:') {
    location.href = 'https://tryko.site/english/'; return;
  }
  if (signedIn) {
    if (saving || unsaved) {accountLabel('Сначала дождись сохранения или повтори его.'); return;}
    try {await api('logout', 'POST'); signedIn = false; accountLabel('Прогресс сохранён в аккаунте');}
    catch {accountLabel('Не удалось выйти. Попробуй ещё раз.');}
  } else {el('login-error').textContent = ''; el('login').showModal();}
};
el('login-close').onclick = () => el('login').close();
el('login-form').onsubmit = async e => {
  e.preventDefault(); el('login-submit').disabled = true;
  try {
    await api('login', 'POST', {username: el('username').value, password: el('password').value});
    await loadAccount(); el('password').value = ''; el('login').close();
  } catch (error) {
    el('login-error').textContent = error.message === '401' ? 'Неверный никнейм или пароль.' : 'Сервер недоступен. Попробуй ещё раз.';
  } finally {el('login-submit').disabled = false;}
};
window.addEventListener('beforeunload', e => {if (signedIn && unsaved) {e.preventDefault(); e.returnValue = '';}});
if (!location.hostname.endsWith('github.io') && location.protocol !== 'file:') {
  loadAccount().catch(error => accountLabel(error.message === '401' ? 'Войди, чтобы сохранять прогресс' : 'Сервер недоступен'));
} else accountLabel('Сохранение доступно на tryko.site');
