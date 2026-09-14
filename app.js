
  (() => {
    const root = document.getElementById('target-vocab-tim');
    const el = id => root.querySelector('#tv-' + id);
    const cards = JSON.parse(el('data').textContent).map((c, id) => ({...c, id}));
    const hard = new Set();
    let deck = [...cards], index = 0, flipped = false;
    function render(persist = true) {
      if (persist) save();
      root.querySelectorAll('[data-unit]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.unit === el('unit').value)));
      root.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === el('mode').value)));
      const c = deck[index];
      el('count').textContent = (c ? `${index + 1} / ${deck.length}` : '0 карточек') + ` · Просмотрено: ${seen.size} · Трудных: ${hard.size}`;
      ['card', 'prev', 'next', 'hard'].forEach(id => el(id).disabled = !c);
      el('translation').hidden = !flipped || !c;
      if (!c) {
        el('section').textContent = '';
        el('main').textContent = 'В этом наборе пока нет трудных карточек.';
        el('hint').textContent = 'Сними отметку «Только трудные», чтобы продолжить.';
        return;
      }
      const reverse = el('mode').value === 'definition';
      el('card').classList.toggle('definition', flipped ? !reverse : reverse);
      el('section').textContent = `Unit ${c.section}`;
      el('main').textContent = flipped ? (reverse ? c.word : c.explanation) : (reverse ? c.explanation : c.word);
      el('translation').textContent = c.translation;
      el('hint').textContent = flipped ? 'Нажми, чтобы скрыть ответ' : 'Нажми, чтобы проверить себя';
      el('hard').textContent = hard.has(c.id) ? '✓ Трудная · убрать' : 'Отметить трудной';
      el('hard').setAttribute('aria-pressed', String(hard.has(c.id)));
      el('card').setAttribute('aria-label', (flipped ? 'Скрыть ответ: ' : 'Показать ответ: ') + el('main').textContent);
    }
    function filter() {
      const unit = el('unit').value;
      deck = cards.filter(c => (unit === 'all' || c.section.startsWith(unit)) && (!el('only').checked || hard.has(c.id)));
      index = 0; flipped = false; render();
    }
    el('unit').onchange = filter;
    el('only').onchange = filter;
    el('mode').onchange = () => {flipped = false; render();};
    el('card').onclick = () => {flipped = !flipped; if (flipped && deck[index]) seen.add(deck[index].id); render();};
    el('next').onclick = () => {index = (index + 1) % deck.length; flipped = false; render();};
    el('prev').onclick = () => {index = (index + deck.length - 1) % deck.length; flipped = false; render();};
    el('shuffle').onclick = () => {
      for (let i = deck.length - 1; i > 0; i--) {const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]];}
      index = 0; flipped = false; render();
    };
    el('hard').onclick = () => {
      const id = deck[index].id;
      hard.has(id) ? hard.delete(id) : hard.add(id);
      if (el('only').checked) {deck = deck.filter(c => hard.has(c.id)); index = Math.min(index, Math.max(0, deck.length - 1)); flipped = false;}
      render();
    };
    root.querySelectorAll('[data-unit]').forEach(b => b.onclick = () => {el('unit').value = b.dataset.unit; filter();});
    root.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => {el('mode').value = b.dataset.mode; flipped = false; render();});
    el('card').setAttribute('aria-keyshortcuts', 'Space');
    el('next').setAttribute('aria-keyshortcuts', 'ArrowRight');
    el('prev').setAttribute('aria-keyshortcuts', 'ArrowLeft');
    el('hard').setAttribute('aria-keyshortcuts', 'D');
    document.addEventListener('keydown', e => {
      if (el('login').open || document.getElementById('panel-vocabulary').hidden) return;
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
      if (e.target.closest('input, textarea, select, summary, [data-panel], #tv-account, #tv-retry, [contenteditable="true"]')) return;
      const action = {Space: 'card', ArrowRight: 'next', ArrowLeft: 'prev', KeyD: 'hard', KeyS: 'shuffle'}[e.code];
      if (action) {e.preventDefault(); el(action).click();}
      else if (e.code === 'KeyR') {e.preventDefault(); el('mode').value = el('mode').value === 'word' ? 'definition' : 'word'; flipped = false; render();}
    });

// The vocabulary data contract and all numeric card IDs remain unchanged.
const seen = new Set();
let signedIn = false, saving = false, pendingState = null, revision = null, savedState = null;
let study = {}, studySaving = false, studyTimer;
const apiBase = new URL('./api/', location.href);
const hosted = !location.hostname.endsWith('github.io') && location.protocol !== 'file:';
const readLocal = key => {try {return JSON.parse(localStorage.getItem(key));} catch {return null;}};
const writeLocal = (key, value) => {try {value === null ? localStorage.removeItem(key) : localStorage.setItem(key, JSON.stringify(value));} catch { /* beforeunload still protects unsaved work */ }};
let studyPending = readLocal('flashcards-study-pending') || {};
async function api(path, method = 'GET', data, match) {
  const response = await fetch(new URL(path, apiBase), {
    method, credentials: 'same-origin', headers: {'Content-Type': 'application/json', 'X-Flashcards': '1', ...(match ? {'If-Match': match} : {})},
    ...(data === undefined ? {} : {body: JSON.stringify(data)})
  });
  if (!response.ok) throw new Error(String(response.status));
  return response.json();
}
function snapshot() {
  return {hard: [...hard], seen: [...seen], deck: deck.map(c => c.id), index,
    unit: el('unit').value, mode: el('mode').value, only: el('only').checked};
}
function accountLabel(message, retry = false) {
  el('sync').textContent = message;
  el('account').textContent = signedIn ? 'tim · Выйти' : 'Войти';
  el('retry').hidden = !retry;
}
function restore(state) {
  if (!state) return;
  hard.clear(); state.hard.forEach(id => hard.add(id));
  seen.clear(); state.seen.forEach(id => seen.add(id));
  deck = state.deck.map(id => cards[id]); index = state.index;
  el('unit').value = state.unit; el('mode').value = state.mode; el('only').checked = state.only;
  flipped = false;
}
function mergeProgress(base, local, remote) {
  if (!remote) return local;
  const before = new Set(base?.hard || []), after = new Set(local.hard), merged = new Set(remote.hard);
  after.forEach(id => {if (!before.has(id)) merged.add(id);});
  before.forEach(id => {if (!after.has(id)) merged.delete(id);});
  const result = {...local, hard: [...merged], seen: [...new Set([...remote.seen, ...local.seen])]};
  if (result.only) {
    result.deck = result.deck.filter(id => merged.has(id));
    for (const c of cards) if (merged.has(c.id) && (result.unit === 'all' || c.section.startsWith(result.unit)) && !result.deck.includes(c.id)) result.deck.push(c.id);
    result.index = Math.min(result.index, Math.max(0, result.deck.length - 1));
  }
  return result;
}
function cacheVocabulary() {
  writeLocal('flashcards-vocab-pending', {state: snapshot(), base: savedState, revision});
}
async function save() {
  if (!signedIn) return;
  pendingState = snapshot(); cacheVocabulary();
  if (saving) return;
  saving = true;
  let conflicts = 0;
  try {
    while (pendingState) {
      const state = pendingState; pendingState = null;
      accountLabel('Сохраняем…');
      try {
        const result = await api('progress', 'PUT', state, revision);
        savedState = state; revision = result.revision;
        if (pendingState) cacheVocabulary();
      } catch (error) {
        if (error.message !== '409' || ++conflicts > 3) throw error;
        const fresh = await api('progress');
        restore(mergeProgress(savedState, snapshot(), fresh.progress));
        savedState = fresh.progress; revision = fresh.revision;
        pendingState = snapshot(); cacheVocabulary(); render(false);
      }
    }
    writeLocal('flashcards-vocab-pending', null); accountLabel('Прогресс сохранён');
  } catch (error) {
    pendingState = snapshot(); cacheVocabulary();
    if (error.message === '401') {signedIn = false; accountLabel('Сессия истекла. Изменения ждут входа.');}
    else accountLabel('Изменения ещё не отправлены', true);
  } finally {saving = false;}
}
function studyStatus(message) {document.getElementById('study-save-status').textContent = message;}
function setStudy(key, value) {
  if (!signedIn) {accountLabel('Войди, чтобы сохранить отметки и черновик'); el('account').click(); return;}
  study[key] = value; studyPending[key] = value;
  writeLocal('flashcards-study-pending', studyPending);
  paintStudy(); studyStatus('Есть изменения…');
  clearTimeout(studyTimer); studyTimer = setTimeout(flushStudy, 500);
}
async function flushStudy() {
  if (!signedIn || studySaving) return;
  studySaving = true;
  try {
    while (Object.keys(studyPending).length) {
      const key = Object.keys(studyPending)[0], value = studyPending[key];
      delete studyPending[key];
      studyStatus('Сохраняем…');
      try {await api('study', 'PUT', {key, value});}
      catch (error) {if (!(key in studyPending)) studyPending[key] = value; throw error;}
      writeLocal('flashcards-study-pending', studyPending);
    }
    studyStatus('Черновик и отметки сохранены в аккаунте');
  } catch (error) {
    writeLocal('flashcards-study-pending', studyPending);
    studyStatus('Есть неотправленные изменения. Нажми «Повторить» вверху.');
    if (error.message === '401') {signedIn = false; accountLabel('Сессия истекла. Войди снова.');}
    else accountLabel('Изменения ещё не отправлены', true);
  } finally {studySaving = false;}
}
async function loadAccount() {
  const [result, learning] = await Promise.all([api('progress'), api('study')]);
  const cached = readLocal('flashcards-vocab-pending');
  savedState = result.progress; revision = result.revision;
  restore(result.progress); signedIn = true;
  if (cached?.state) restore(mergeProgress(cached.base, cached.state, result.progress));
  study = {...learning.study, ...studyPending}; paintStudy(true);
  render(false); accountLabel('Прогресс сохранён');
  studyStatus('Черновик и отметки сохранены в аккаунте');
  if (cached?.state) save();
  if (Object.keys(studyPending).length) flushStudy();
}
el('retry').onclick = () => {if (pendingState) save(); flushStudy();};
el('account').onclick = async () => {
  if (!hosted) {location.href = 'https://tryko.site/flashcards/'; return;}
  if (signedIn) {
    if (saving || pendingState || studySaving || Object.keys(studyPending).length) {accountLabel('Дождись сохранения или повтори его', true); return;}
    try {await api('logout', 'POST'); signedIn = false; accountLabel('Прогресс сохранён в аккаунте'); studyStatus('Войди, чтобы сохранять изменения.');}
    catch {accountLabel('Не удалось выйти. Попробуй ещё раз.');}
  } else {el('login-error').textContent = ''; if (!el('login').open) el('login').showModal();}
};
el('login-close').onclick = () => el('login').close();
el('login-form').onsubmit = async e => {
  e.preventDefault(); el('login-submit').disabled = true;
  try {
    await api('login', 'POST', {username: el('username').value, password: el('password').value});
    await loadAccount(); el('password').value = ''; el('login').close();
  } catch (error) {el('login-error').textContent = error.message === '401' ? 'Неверный никнейм или пароль.' : 'Не удалось загрузить прогресс. Попробуй ещё раз.';}
  finally {el('login-submit').disabled = false;}
};
window.addEventListener('beforeunload', e => {
  if (pendingState || saving || studySaving || Object.keys(studyPending).length) {e.preventDefault(); e.returnValue = '';}
});

const readings = [];
readings.unshift(
  {
    id:'work-family',label:'4.4 · текст к пересдаче',title:'Work-family dynamic',source:'https://lms.mipt.ru/mod/page/view.php?id=233135',
    summary:'The article explains how work and family influence each other and compares several theories of this relationship. Both parents often work to increase family income, and sometimes to enjoy stimulating interaction with other adults. Positive feelings or stress at work can spill over into home life. The theories focus on competing demands, changes across a person’s life, support for autonomy, or separation between work and family. Irregular hours, senior positions and heavy time demands can intensify conflict. The most consistent finding reported is that job satisfaction falls when work-family conflict increases.',
    ru:'Сначала причины выхода обоих родителей на работу, затем spillover и четыре теоретических подхода, в конце — факторы конфликта и связь с удовлетворённостью работой. Название compensation theory здесь воспроизводим так, как оно употребляется в учебном тексте.',
    facts:[
      'A. Political and family values have affected family structure. The traditional male breadwinner provides money for food and shelter.',
      'A. Both parents mainly enter the workforce to strengthen the family’s financial base. A less common reason is stimulating interaction with other adults.',
      'A. Effects of both parents working appear at home and can feed back into their performance as employees.',
      'B. Positive spillover carries satisfaction and stimulation at work into energy and satisfaction at home. Negative spillover carries problems and conflict into family life and drains energy.',
      'B. Most research cited focuses on negative spillover. The author infers that positive spillover may be less dominant, but research attention is not a direct measurement of frequency.',
      'C. Compensation theory, as described here, proposes a negative relationship: high involvement in one sphere, usually work, means low involvement in the other.',
      'C. Career advancement increases demands, leaving less family time, particularly when a worker has young children. Conflict escalates as the number of family members increases.',
      'D. The developmental approach examines the worker, family and career across the lifespan. Demands fluctuate, and people connect their roles differently at different life stages.',
      'D. The text says adult development patterns differ for men and women. It does not give exact age ranges or stages.',
      'E. Self-determination theory highlights interpersonal climates. Feeling valued by a partner supports self-determination at home. Employer support for autonomy supports motivation at work.',
      'E. Greater self-determination tends to be associated with desirable outcomes in the relevant activities.',
      'F. Segmentation theory treats work and family as separate domains with clear boundaries. Emotions, attitudes and behaviours in one domain need not affect the other.',
      'F. Winthrope points out that women may still carry responsibility for husbands, children and living quarters after entering paid work. The text links this to domestic-role stereotypes and social expectations.',
      'F. The article says there is no demonstrated positive link showing that one sex has greater difficulty managing work-family conflict than the other. A stereotype is not proof of a sex difference.',
      'G. Working weekends, more than nine hours a day or during vacations intensifies conflict. Rank, position, expectations and time demands also have negative effects.',
      'G. Empirical studies vary, but the article reports broad agreement that job satisfaction decreases when work-family conflict arises.',
      'Source named in the material: Complete IELTS, Work-family dynamic, 1 September 2020. The best proposed title is “Theories on family and work”.'
    ],
    questions:[
      ['What reasons for both parents joining the workforce are mentioned in the text?','The main reason is to add to the family’s financial base. A less common reason is to interact with other adults in a stimulating work environment.','Вопрос из Home reading.'],
      ['Can you think of any other reasons?','For example, a parent may seek professional fulfilment, financial independence or career development. These are my examples, rather than reasons explicitly listed in the article.','Личное мнение: не приписывай свои примеры автору.'],
      ['What happens when attitudes towards work carry over into family life?','This is spillover. Positive spillover brings satisfaction, stimulation and energy into the home. Negative spillover brings stress or conflict and leaves a person too drained to participate fully in family life.'],
      ['What does compensation theory propose in this article? What increases conflict?','It proposes that high involvement in work reduces involvement in family life. Career advancement and increased demands can reduce time with young children. Researchers also relate more family members to greater conflict.','Термин и трактовка из данного текста.'],
      ['What does the developmental approach explore?','It explores how individual, family and career development interact across a worker’s lifespan. The relationship changes as demands and life stages change.'],
      ['How can self-determination be improved at home and at work?','At home, feeling valued by a partner helps. At work, support for autonomy from an employer helps. Both can strengthen self-determined motivation and support desirable outcomes.'],
      ['What is segmentation theory? How does Winthrope complicate its claim?','Segmentation theory proposes that work and family are separate domains. Winthrope points out that women may still carry domestic responsibilities after entering the workforce, making a neat separation difficult for some.','Не утверждай, что Winthrope опровергает теорию для всех.'],
      ['What factors lead to conflict, and how does it relate to job satisfaction?','Weekend work, workdays longer than nine hours, working during vacations, and demanding positions can increase conflict. The article reports that job satisfaction decreases when conflict arises.'],
      ['What is a breadwinner, and what traditional role is described?','A breadwinner earns money to support a family. The article describes the traditional expectation that men provide money for food and shelter.'],
      ['Does the influence between home and work go in only one direction?','No. Work can affect home life, and changes or difficulties at home can then affect performance at work.'],
      ['Which kind of spillover receives most research attention in the article?','Negative spillover. The article says most research focuses on problems, conflict and the incompatible demands of work and family.'],
      ['Does more research on negative spillover prove that positive spillover rarely happens?','No. The article makes an inference from research emphasis, but it does not provide a direct measurement of how often each type occurs.'],
      ['Which theory explains why career advancement may reduce time with young children?','Compensation theory, as the article describes it: increased involvement and demands in one sphere reduce involvement in the other.'],
      ['Which approach focuses on changes over the lifespan?','The developmental approach. It connects individual, family and career development.'],
      ['Which theory focuses on feeling valued and autonomy-supported?','Self-determination theory. The interpersonal climate affects motivation in family and work activities.'],
      ['Which theory says emotions and behaviours in one domain need not affect the other?','Segmentation theory. It proposes a clear demarcation between work and family.'],
      ['What does self-determination mean in the glossary?','The ability or power to make decisions for yourself.'],
      ['What domestic responsibilities does Winthrope mention?','Caring for a husband and children, as well as looking after the living quarters.'],
      ['What stereotype does the discussion of domestic work refer to?','The adage that a woman’s place is in the home, while the man is the family breadwinner. The article links these expectations to social norms.'],
      ['Does the article demonstrate that one sex finds work-family conflict harder to manage?','No. It explicitly says no positive link has been shown establishing that one sex has greater difficulty than the other.'],
      ['Recall all three examples of irregular or excessive work schedules.','Working at weekends, working longer than nine hours per day, and working during vacation periods.','Порог именно more than nine, а не eight.'],
      ['How do rank and position affect the dynamic?','They can bring greater expectations and time demands, negatively affecting work-family relations.'],
      ['What finding is broadly agreed upon despite varying study results?','When work-family conflict arises, job satisfaction decreases.'],
      ['Compare compensation theory and segmentation theory in two sentences.','Compensation theory describes competing involvement: greater involvement in one sphere leaves less for the other. Segmentation theory describes separate domains whose emotions and behaviours do not necessarily cross the boundary.'],
      ['Give a short overview naming all four approaches.','The article discusses compensation theory, the developmental approach, self-determination theory and segmentation theory. They respectively focus on competing involvement, change across the lifespan, support for autonomous motivation and separation between work and family.']
    ],
    vocab:[
      [51,'Researchers ___ theories to explain how work and family interact.','devise'],[54,'The developmental approach uses a psychological developmental ___.','framework'],[52,'Cooking and looking after the home are ___ duties.','domestic'],[63,'Greater autonomy may contribute to a desirable ___.','outcome'],[59,'Some parents work partly because they want to ___ with other adults.','interact'],[61,'Greater work demands may ___ themselves as less time with family.','manifest'],[49,'Researchers ___ empirical studies on conflict and job satisfaction.','conduct'],[60,'In the article, high involvement is described as being almost always, or ___, in the work sphere.','invariably']
    ]
  },
  {
    id:'environment',label:'5.4 · текст к пересдаче',title:'Environment and quality of life',source:'https://lms.mipt.ru/mod/page/view.php?id=233157',
    summary:'Environmental health examines how physical, chemical and biological surroundings affect physical and mental well-being. The article covers clean air, water and sanitation, toxic substances, homes and communities, surveillance, and global environmental health. It uses examples such as lead in Flint’s water, limited access to fresh food, and mosquito monitoring. Climate change and displacement can spread health risks across borders. Because individuals cannot inspect every food or water source, coordinated policies and professional monitoring are essential, alongside actions people can take locally.',
    ru:'Структура: определение → шесть направлений → меры на уровне системы и отдельного человека. Статистика относится к учебной статье 2019 года и не обозначает сегодняшнее положение. На устном ответе говори “According to the article…”.',
    facts:[
      'Environmental health monitors and addresses physical, chemical and biological factors beyond an individual’s direct control, affecting physical and mental well-being.',
      'Personal choices depend partly on surroundings: unsafe sidewalks or air pollution can discourage exercise. Building materials, nearby insects and access to food also matter.',
      'Six areas under Healthy People 2020: air quality; water and sanitation; toxic substances and hazardous wastes; homes and communities; infrastructure and surveillance; global environmental health.',
      'Air pollution is linked in the text to SIDS (Sudden Infant Death Syndrome), lung cancer, COPD (Chronic Obstructive Pulmonary Disease) and low birth weight.',
      'Article estimates: 780 million people without safe drinking water; 2.5 billion, roughly one third of the world, without adequate sanitation; 2,200 children dying daily from diarrheal diseases linked to poor water and sanitation.',
      'Filtering and chlorinating water helped reduce diseases such as typhoid in the US. One estimate cited gives $23 in medical and societal savings per $1 invested in clean-water technology.',
      'The article attributes the bulk of the historical decline in US childhood mortality to clean water. It does not state that every current investment produces the same return.',
      'Toxicology studies how chemicals and substances affect people and surroundings. Heavy metals and even some plastics can create health risks.',
      'Flint, Michigan: news broke in 2015 that drinking water contained lead. Potential long-term complications included brain damage. Economically disadvantaged children were most affected.',
      'Violence can keep families from exercising outdoors. Poor road maintenance can increase car crashes. Homes, work and schools should have minimal hazards.',
      'Food deserts lack nearby full-service grocery stores. People may rely on convenience stores, including gas-station stores, with costly, limited or poorer fresh produce.',
      'Food access problems worsen existing inequalities, especially for low-income and minority populations.',
      'Proposed food-desert responses: public gardens, better public transport to grocery stores and farmers markets, and zoning changes to encourage healthier retail options.',
      'Infrastructure and surveillance include disease investigation and response (epidemiology), population screening for hazards, and surveillance programmes.',
      'Mosquito programmes test for infections such as Zika and monitor populations to check control measures. Results inform doctors, guide where and how governments spray, and alert the public.',
      'A warmer, wetter climate can allow disease-carrying mosquitoes into areas previously too cold, increasing exposure to vector-borne illnesses such as dengue and malaria.',
      'Rising seas can flood coastal cities and island nations, displacing potentially millions into crowded areas where diseases can spread.',
      '2017 examples: successive storms and floods in Houston, Florida and Puerto Rico destroyed homes, facilitated disease spread and left millions without power.',
      'Travel and displacement mean risks cross borders. The article names conflicts in Syria, Afghanistan and South Sudan as drivers of people fleeing home.',
      'System-level responses require laws, policies and programmes at local, federal and international levels, plus trained food safety inspectors and toxicologists using standardised checks.',
      'Individual examples: cycle, take mass transportation or telecommute; check the home for radon, lead paint or pipes; engage local governments and businesses in safer environments.',
      'Source: Robyn Correll, MPH, 22 November 2019, Verywell Health. Retrieved in the course material on 10 February 2023.'
    ],
    questions:[
      ['What does environmental health involve?','It monitors and addresses physical, chemical and biological factors in our surroundings that affect physical and mental well-being, including factors beyond our direct control.','Вопрос из Classwork.'],
      ['What are the six key areas?','Air quality; water and sanitation; toxic substances and hazardous wastes; homes and communities; infrastructure and surveillance; global environmental health.','Учи как шесть опор для пересказа.'],
      ['What essential substances do people need but do not always keep safe?','Air and water. We need them to survive but do not always keep them clean.'],
      ['According to the article, how many people lack safe water and adequate sanitation?','It cites 780 million without safe drinking water and 2.5 billion, roughly a third of the world’s population, without adequate sanitation.','Это цифры старой учебной статьи, не текущая статистика.'],
      ['What example of toxic poisoning does the article give?','The Flint water crisis in Michigan. In 2015, news emerged that drinking water contained lead. Economically disadvantaged children were especially affected, with risks including long-term brain damage.'],
      ['What are food deserts, and why are they a problem?','Areas without nearby full-service grocery stores. Residents may rely on convenience stores, where fresh fruits and vegetables can be limited, poor in quality or expensive. This can worsen health inequalities.'],
      ['What does surveillance include, and why is it important?','It includes disease investigation and response, screening populations for hazards, and monitoring risks. Information helps professionals target resources, evaluate control measures and warn the public.'],
      ['How can global warming affect environmental health?','Warmer, wetter conditions can expand the range of disease-carrying mosquitoes. Rising seas and extreme weather can displace people, destroy infrastructure and create conditions that facilitate disease spread.'],
      ['How can political conflicts affect worldwide environmental health?','They cause people to flee their homes, and displaced populations may face crowded or unsafe conditions. Risks cross borders, so countries need to cooperate. The text names Syria, Afghanistan and South Sudan.'],
      ['What comprehensive measures does the article recommend?','Coordinated laws, policies and programmes at local, federal and international levels, supported by trained inspectors and toxicologists using standardised screening and inspection.'],
      ['What individual measures does the article suggest?','Cycle, use public transport or telecommute; check the home for radon, lead paint or pipes; and encourage governments and businesses to invest in safe environments.'],
      ['Name two examples of surroundings limiting healthy choices.','Unsafe sidewalks or polluted air make outdoor exercise difficult. Violence in a neighbourhood may also keep families indoors.'],
      ['Which four health outcomes are linked to poor air quality in the text?','Sudden Infant Death Syndrome (SIDS), lung cancer, Chronic Obstructive Pulmonary Disease (COPD), and low birth weight.'],
      ['How many children does the article estimate die each day from diarrheal diseases linked to water and sanitation?','An estimated 2,200 children worldwide each day.','Отвечай “The article estimates…”.'],
      ['Which two water treatments are mentioned, and which disease is given as an example?','Filtering and chlorinating water. The article gives typhoid as an example of a disease that declined.'],
      ['What return on clean-water investment is cited?','One estimate gives $23 in medical and societal cost savings for every $1 invested in clean-water technologies in the US.','Не $23 прибыли и не универсальная гарантия.'],
      ['What is toxicology?','The study of how chemicals and substances can affect people and their surroundings.'],
      ['Which industrial materials can be hazardous, according to the article?','Heavy metals and even some plastics.'],
      ['Where was the lead crisis, and when did the news emerge?','In Flint, Michigan, in 2015.'],
      ['Who was most affected in the Flint example?','Economically disadvantaged children. The example illustrates that environmental problems can hit already vulnerable groups especially hard.'],
      ['How can road conditions affect health?','Poorly maintained roads can lead to more car crashes.'],
      ['Which groups face particular inequalities connected with food deserts?','Low-income and minority populations.'],
      ['Name all three proposed responses to food deserts.','Establish public gardens, improve public transport to full-service grocery stores and farmers markets, and change zoning laws to encourage retailers to offer healthier foods.'],
      ['What does epidemiology involve in the article?','Investigating and responding to diseases. It helps officials understand risks and direct resources.'],
      ['Which virus is used as the mosquito surveillance example?','Zika virus. Mosquitoes are tested for dangerous infections, and their populations are monitored.'],
      ['How do mosquito-monitoring results help doctors, governments and the public?','They tell doctors what to watch for, help governments decide where and how to spray for mosquitoes, and alert the public to spreading mosquito-borne illness.'],
      ['Which two vector-borne diseases are mentioned in the warming-climate example?','Dengue and malaria. Warmer conditions may allow mosquitoes to survive in previously colder regions.'],
      ['Explain the chain from sea-level rise to disease spread.','Sea levels rise, coastal cities or island nations flood, people become displaced, and crowded receiving areas can allow diseases to spread more quickly.'],
      ['Which places and year illustrate severe storms and flooding?','Houston, Florida and Puerto Rico in 2017. The events destroyed homes, facilitated disease spread and left millions without power.'],
      ['Why are national borders insufficient for protecting environmental health?','Environmental hazards and infectious diseases cross borders. More travel and displacement connect the risks faced by different populations.'],
      ['Why can individuals not handle every environmental health risk alone?','It is unrealistic for each person to inspect every restaurant kitchen or test water for heavy metals. Qualified professionals and coordinated systems are needed.'],
      ['Name the home hazards people can check for in the article.','Radon, lead paint and lead pipes.'],
      ['Does the article say personal choices do not matter?','No. It says the environment shapes choices and many risks require system-level action, while also listing useful individual actions.'],
      ['Give a brief overview with two concrete examples.','Environmental health covers how our surroundings affect well-being. The article discusses six areas, from air and water to surveillance and global risks. Flint’s lead-contaminated water shows the harm of toxic substances, while mosquito monitoring shows how information can guide prevention. It argues for coordinated public systems alongside individual action.']
    ],
    vocab:[
      [153,'We spend ___ our time at home, work or school.','the bulk of'],[164,'Public gardens can help ___ the effects of food deserts.','offset'],[169,'Health professionals ___ communities to improve access to fresh food.','urge'],[151,'Experts ___ a warmer, wetter climate.','anticipate'],[160,'Crowded conditions can ___ the spread of diseases.','facilitate'],[155,'Public health protection requires a ___ and coordinated effort.','comprehensive'],[165,'Environmental hazards can ___ a risk to health.','pose'],[157,'Checking lead pipes can help prevent ___ to toxic substances.','exposure'],[127,'Residents may have to ___ convenience stores for food.','rely on'],[152,'Infectious diseases can cross a national ___.','boundary']
    ]
  },
  {
    id:'sleep',label:'6.4 · текст к пересдаче',title:'Benefits of sleep',source:'https://lms.mipt.ru/mod/page/view.php?id=233176',
    summary:'The article asks whether a sleeping brain can learn new information. Earlier work linked sounds and smells during sleep, and the authors tested a more complex task: learning Japanese word meanings. Twenty-two healthy adults first associated familiar sounds with pictures while awake. During sleep, they heard those sounds paired with Japanese words. The next morning, they matched words to pictures above chance, despite low confidence. EEG slow waves predicted which words they remembered. However, awake learning was much more efficient, and long-term benefits and individual differences remained uncertain.',
    ru:'Главное: возможно слабое неосознанное обучение новым словам, но это не свободное владение языком во сне. Выучи протокол, числа, примеры слов, связь slow waves с памятью и ограничения. Сон и бодрствование автор предлагает считать взаимодополняющими.',
    facts:[
      'Neuroimaging shows that the sleeping brain remains active and reacts to information from the outside world.',
      'Earlier experiments used tone and odour associations. In the example, people wishing to quit smoking reduced consumption by 35% when tobacco odour was paired during sleep with unpleasant rotten-fish odour.',
      'The language-learning work involved Sid Kouider at ENS–PSL and Maxime Elbaz and Damien Léger at AP-HP Hôtel-Dieu. The article’s author is Matthieu Koroma.',
      'Japanese was chosen for relatively simple syllable structure, no complex tone system of the kind discussed for other East Asian languages, and sounds distinguishable to French or English speakers, while word meanings were unfamiliar.',
      'Example: neko means cat and comprises ne + ko. Inu means dog.',
      'Participants: 22 healthy adults with no prior knowledge of Japanese or related East Asian languages.',
      'Awake preparation: pair a picture with its characteristic sound, for example a dog with barking.',
      'During sleep: pair the familiar sound with the Japanese term, for example barking with inu.',
      'Next morning: choose between two images for a Japanese word, for example a dog and a bell for inu. The distractor could relate to another word played during sleep.',
      'Matching performance was better than chance. Confidence remained low for both correct and incorrect answers, which the authors interpret as implicit learning.',
      'EEG records electrical brain activity. Remembered words generated more slow waves than forgotten words. Slow waves occur during deep sleep.',
      'The text also mentions another publication where slow waves predicted memory for objects’ relative size.',
      'Unresolved: whether sleep-learning produces long-term results and whether effects depend on individual differences in memory capacity.',
      'Awake comparison: the same protocol with ten times fewer repetitions. Participants learned five times more efficiently than during sleep.',
      'Awake participants reported greater confidence for learned words than for forgotten words. Awake learning was quick and explicit, sleep learning slower and implicit.',
      'Conclusion: waking and sleeping states are complementary. The author particularly emphasises consolidating information acquired while awake.',
      'Source: Matthieu Koroma, The Conversation, 8 March 2023, retrieved in the course material on 11 April 2023.'
    ],
    questions:[
      ['What question does the article investigate?','Whether the sleeping brain can learn new information, particularly the meanings of unfamiliar words, and retain it after waking.'],
      ['What does neuroimaging tell us about the sleeping brain?','It is far from inactive and continues to react to information from the world around it.'],
      ['What earlier kind of learning experiment is mentioned?','Experiments on associations between tones and odours, showing that the brain can take in new information during sleep.'],
      ['Describe the smoking example, including the number and odours.','People who wanted to quit smoking reduced consumption by 35% when tobacco scent was paired during sleep with the unpleasant scent of rotten fish.','Пример из статьи, не рекомендация по лечению и не результат эксперимента с японским.'],
      ['Which language was used in the main experiment, and why?','Japanese. Its sound structure was relatively easy for the participants to distinguish, while the meanings of its words were generally unfamiliar.'],
      ['What example illustrates Japanese syllable structure?','Neko, meaning cat, consists of two units: ne and ko.'],
      ['What does inu mean?','Dog. During sleep, the researchers paired inu with barking.'],
      ['How many people participated, and what were their relevant characteristics?','Twenty-two healthy adults with no prior knowledge of Japanese or other related East Asian languages.'],
      ['What happened while participants were awake before the sleep experiment?','They saw pictures paired with corresponding sounds, such as a picture of a dog with barking.','Японские значения на этом этапе не учили: сначала знакомый звук + изображение.'],
      ['What information did they hear while sleeping?','A familiar sound paired with its corresponding Japanese word, such as barking with inu.'],
      ['How did the researchers test memory the next morning?','They presented a Japanese word and asked participants to choose between two images, such as a dog and a bell for inu.'],
      ['Why is the two-picture test important when interpreting the result?','Random choice would already produce some correct answers. The relevant finding is that matching was better than chance, not that every participant remembered every word.'],
      ['What did participants report about confidence?','Confidence stayed low whether an answer was correct or incorrect.'],
      ['Why do the authors describe sleep-learning as implicit?','Participants performed above chance but were not aware of knowing the learned information, as reflected in their low confidence.'],
      ['What does EEG stand for, and what did it record?','Electroencephalography. It recorded electrical brain activity during sleep.'],
      ['What predicted which words would later be remembered?','Remembered words generated more slow waves than forgotten words. The EEG pattern allowed researchers to predict later memory.'],
      ['When do slow waves appear?','During deep sleep. They are patterns of electrical brain activity.'],
      ['What other study involving slow waves does the article mention?','A publication where slow waves predicted whether participants memorised the relative size of objects.'],
      ['What two important questions remain unresolved?','Whether sleep-learning has long-term results and whether it depends on individual differences in memory capacity.'],
      ['How did the number of repetitions differ in the awake comparison?','The same protocol used ten times fewer repetitions while participants were awake.','Число повторений: в 10 раз меньше.'],
      ['How did learning efficiency differ when participants were awake?','They learned five times more efficiently than when asleep.','Эффективность: в 5 раз выше. Не перепутай с числом повторений.'],
      ['How did confidence differ in awake learning?','Awake participants were more confident about learned words than forgotten ones, unlike the low confidence after sleep-learning.'],
      ['Contrast implicit sleep-learning and explicit awake learning.','Sleep-learning was slow and occurred without clear awareness of what had been learned. Awake learning was faster, more efficient and accompanied by greater confidence.'],
      ['Does the experiment show that you can become fluent in Japanese while asleep?','No. It tested associations between a limited set of word meanings and images. It did not demonstrate fluent speech, grammar mastery or long-term retention.'],
      ['What role does the author suggest for sleep in learning?','Treat waking and sleep as complementary. Sleep is especially useful for consolidating information taken in while awake.'],
      ['Recall the researcher names and institutions mentioned.','The author is Matthieu Koroma. The work involved Sid Kouider at ENS–PSL and Maxime Elbaz and Damien Léger at AP-HP Hôtel-Dieu.','Деталь источника: названия и имена, без приписывания неизвестных ролей.'],
      ['Retell the protocol in the correct order.','First, 22 adults with no Japanese knowledge associated sounds with pictures while awake. Next, during sleep, they heard the sounds paired with Japanese words. The following morning, they chose matching images and reported their confidence. EEG activity during sleep helped predict remembered words.'],
      ['Give the conclusion with one numerical result and one limitation.','Participants could learn some word meanings during sleep, but awake learning was five times more efficient. The long-term value of sleep-learning remained unclear.']
    ],
    vocab:[
      [272,'Participants had no knowledge of Japanese ___ the experiment.','prior to'],[266,'Participants could ___ Japanese sounds even when they did not know the meanings.','distinguish'],[279,'The next morning, they tried to ___ the meanings of Japanese words.','recall'],[282,'Researchers asked whether people could ___ information after waking.','retain'],[267,'Low confidence may ___ that learning was implicit.','indicate'],[274,'EEG patterns can ___ differences between remembered and forgotten words.','reveal'],[206,'Individual differences in memory ___ may matter.','capacity'],[285,'The experimental ___ was preparation, sleep exposure and morning testing.','sequence'],[208,'The word neko can be said to ___ two syllable units.','comprise']
    ]
  }
);

readings.splice(3,0,
  {
    id:'ted-work',label:'4.5 · TED · Azim Shariff',title:'Does working hard really make you a good person?',source:'https://www.ted.com/talks/azim_shariff_does_working_hard_really_make_you_a_good_person?view=transcript',
    summary:'Shariff examines why effort signals moral character, even without useful output.',
    ru:'Короткие опорные ответы по официальному транскрипту. Разворачивай их в предложения вслух. В учебной ситуации Geoff начинает второй год трёхлетнего контракта; в самом выступлении у Jeff остаётся три года. Это разные версии примера.',
    facts:[],
    questions:[
      ['Researcher?','Azim Shariff, psychology professor, University of British Columbia.'],
      ['Jeff’s evaluation?','Continuing pointless work: lower competence, greater warmth and morality.'],
      ['Widget comparison?','Equal output, time and quality; greater effort earns moral approval.'],
      ['Replication countries?','United States, South Korea, France.'],
      ['Hadza findings?','Tanzania; generosity and hard work signal character.'],
      ['Paul’s role?','Struggling runner, friend, collaborator, research inspiration.'],
      ['Evolutionary explanation?','Partner choice: effort signals dependable cooperation.'],
      ['Donation comparison?','Running versus watching a television marathon.'],
      ['Graeber and Thompson?','David Graeber: pointless jobs. Derek Thompson: workism, employment as identity.'],
      ['Workism competition?','Office workers arrive increasingly early.'],
      ['Student’s behaviour?','Schedules replies for 1–2 a.m., delaying output to display industriousness.'],
      ['Bias response?','Notice it and account for it in decisions.'],
      ['Cobra story?','Bounties encouraged breeding; cancellation led to release. Shariff calls it probably apocryphal.'],
      ['Central recommendation?','Reward meaningful results rather than visible exertion alone.']
    ],vocab:[]
  },
  {
    id:'ted-ocean',label:'5.2 · TEDx · Emily de Sousa',title:'A drop in a plastic ocean',source:'https://www.ted.com/talks/emily_de_sousa_a_drop_in_a_plastic_ocean_how_one_person_can_make_a_difference?view=transcript',
    summary:'De Sousa connects everyday disposal to marine damage and argues for reuse.',
    ru:'Цифры ниже воспроизводят утверждения выступления 2018 года. Это ответы о содержании TED, а не актуальная статистика или проверенный справочник по экологии. Для точных формулировок открой официальный транскрипт.',
    facts:[],
    questions:[
      ['First dive?','Age 19, southern Oahu, Hawaii; damaged coral, little wildlife.'],
      ['Before modern plastics?','Refillable glass milk containers, reused bags, seasonal unpackaged produce.'],
      ['Why popular?','Cheap, durable, mouldable, convenient.'],
      ['Annual and cumulative production?','Over 300 million tonnes; 9.1 billion tonnes.'],
      ['Weight comparisons?','25,000 Empire State Buildings, 80 million blue whales, one billion elephants.'],
      ['Recycling and ocean entry?','25% recycled; eight million tonnes enter oceans annually, half single-use.'],
      ['Other figures?','Bags: 15-minute use. Seabirds: 99% ingestion. Canada: 57 million straws daily.'],
      ['Affected wildlife?','Turtles, seabirds, corals, whales, sharks, dolphins.'],
      ['Human exposure figures?','67% of seafood; up to 11,000 plastic pieces annually.'],
      ['Mission and places?','Conservation through accessible digital storytelling; Maldives and Toronto illustrate pollution.'],
      ['Long-term traces?','Persistent plastic becomes technofossils.'],
      ['Ocean importance?','Oxygen, carbon storage, biodiversity; speaker cites 70% oxygen versus trees’ 28%.'],
      ['2050 warning?','More plastic than fish; threatened livelihoods, seafood access and tourism.'],
      ['Individual actions?','Reusable bottles, cups, bags; unpackaged produce; refuse straws.'],
      ['Economic direction?','Circular reuse, less production, ending single-use.']
    ],vocab:[]
  },
  {
    id:'ted-emotions',label:'6.3 · TEDx · Ramona Hacker',title:'6 steps to improve your emotional intelligence',source:'https://www.ted.com/talks/ramona_hacker_6_steps_to_improve_your_emotional_intelligence?view=transcript',
    summary:'Hacker presents emotional intelligence as a skill developed through reflection and practice.',
    ru:'Здесь — опорные ответы по транскрипту. Сначала восстанови шесть шагов по порядку, затем объясни каждый на своём примере. Личные объяснения спикера не следует превращать в универсальные научные причины поведения.',
    facts:[],
    questions:[
      ['Turning point?','Burnout and leaving a job five years earlier.'],
      ['Three abilities?','Awareness, applying emotions to tasks, managing emotions.'],
      ['Emotion versus intelligence?','Strong expression does not guarantee understanding or regulation.'],
      ['Learning stages?','Unaware inability; recognised inability; deliberate ability; automatic ability. Driving illustrates practice becoming automatic.'],
      ['Step 1?','Recognise emotions as valuable; communicate honestly using first-person statements.'],
      ['Step 2?','Distinguish and analyse feelings rather than substituting a familiar emotion.'],
      ['Step 3?','Accept feelings without automatically labelling them good or bad. Sadness can reflect appreciation.'],
      ['Step 4?','Reflect on origins: understand why a feeling arose.'],
      ['Step 5?','Find individual coping methods: writing, reading, discussion, exercise or meditation.'],
      ['Step 6?','Support others; ask what helps and how they can help themselves.'],
      ['Journal frequency?','As needed, sometimes weeks or months apart.'],
      ['Names mentioned?','António Damásio; Pennebaker and Smyth; Karla McLaren; Brené Brown.'],
      ['School proposals?','Discuss emotions and functions; use relevant books and collaborative case studies.'],
      ['Expected benefits?','Better decisions, relationships, understanding and conflict handling.']
    ],vocab:[]
  }
);

// Each section is also an answer checklist for closed-book retelling.
const materialSummaries = {
  'work-family': {
    lead: 'Work and family influence each other. The article compares theories explaining this relationship and shows how competing demands can create conflict and reduce job satisfaction.',
    note: 'Учебный текст Work-family dynamic (Complete IELTS, 2020). Compensation theory объясняем именно в трактовке этой статьи. Лучший заголовок из задания: “Theories on family and work”.',
    sections: [
      {title:'Why both parents work', cue:'Why do both parents work, and how do work and home affect each other?', points:[
        'Background: political and family values have changed family structures. Traditionally, the male breadwinner earned money for food and shelter.',
        'Main reason: both parents work to strengthen the family’s financial base. A secondary reason is stimulating interaction with other adults at work.',
        'Two-way influence: the effects of both parents working appear at home and can feed back into their performance as employees.'
      ], ru:'Breadwinner — кормилец. Две причины из текста: деньги и общение со взрослыми в стимулирующей рабочей среде. Самореализацию можно добавить как собственную идею, но не как факт статьи.'},
      {title:'Spillover: feelings cross the boundary', cue:'Explain positive and negative spillover. What does the research emphasis actually show?', points:[
        'Positive spillover: satisfaction and stimulation at work carry over into energy and satisfaction at home.',
        'Negative spillover: work problems and conflict drain energy, so a person cannot fully participate in family life.',
        'Research emphasis: most studies discussed focus on negative spillover and incompatible demands. The author infers that positive spillover is less dominant; the article gives no direct frequency measurement.'
      ], ru:'Spillover — перенос состояния из одной сферы в другую. Не только стресс: перенос может быть положительным. Больше исследований о негативе ≠ доказательство, что позитив встречается редко.'},
      {title:'Compensation theory: competing involvement', cue:'What does compensation theory mean here? Which circumstances intensify the conflict?', points:[
        'The article’s definition: high involvement in one sphere, usually work, is associated with low involvement in the other, usually family.',
        'Career advancement: increased work demands consume time that could be spent with family, especially when there are young children.',
        'Escalation: reduced family time creates conflict; the text also links a larger number of family members to greater conflict.'
      ], ru:'В этой статье compensation — конкуренция за вовлечённость и время: больше работы → меньше семьи. Запомни карьерный рост, маленьких детей и рост числа членов семьи.'},
      {title:'Developmental approach: demands change over time', cue:'What changes over a worker’s lifespan, according to the developmental approach?', points:[
        'Focus: a psychological framework connects the development of the individual, the family and the career across the worker’s lifespan.',
        'Changing roles: demands fluctuate, and people connect their work and family roles differently at different life stages.',
        'Sex differences: the article says men and women have different patterns of adult development. It does not give specific ages or a fixed list of stages.'
      ], ru:'Developmental — развитие во времени: отношения работы и семьи не одинаковы на всех этапах жизни. Не придумывай возрастные границы, которых в тексте нет.'},
      {title:'Self-determination: support for autonomy', cue:'What helps self-determination at home and at work? What follows from it?', points:[
        'Meaning: self-determination is the ability or power to make decisions for yourself.',
        'At home: feeling valued by a partner supports self-determination in family activities.',
        'At work: an employer who supports autonomy strengthens self-determined motivation.',
        'Outcome: higher self-determination tends to be associated with desirable outcomes in the relevant activities.'
      ], ru:'Две пары для запоминания: партнёр → чувство собственной ценности; работодатель → самостоятельность. Поддерживающая среда помогает мотивации и результатам.'},
      {title:'Segmentation and Winthrope’s qualification', cue:'Explain segmentation. What domestic duties and stereotypes does Winthrope discuss?', points:[
        'Segmentation theory: work and family are separate domains with a clear boundary. Emotions, attitudes and behaviour in one need not influence the other.',
        'Qualification: this separation may describe some people’s lives, but it does not fit everyone.',
        'Winthrope’s example: even after entering paid work, women may remain responsible for husbands, children and living quarters.',
        'Social expectations: the text refers to the stereotype that a woman’s place is at home, while a man is the breadwinner.',
        'Evidence limit: despite these expectations, the article says no positive link establishes that one sex has greater difficulty managing work-family conflict than the other.'
      ], ru:'Segmentation — разделение сфер. Winthrope показывает, почему оно бывает трудным, но не опровергает теорию для всех. Стереотипы о ролях не доказывают различия в способности справляться с конфликтом.'},
      {title:'Conflict and job satisfaction', cue:'Name all three schedule examples, explain the role of position, and state the conclusion.', points:[
        'Schedules: weekend work, working more than nine hours a day, and working during vacations intensify conflict.',
        'Position: rank and job position can bring greater expectations and time demands, worsening work-family relations.',
        'Consistent conclusion: empirical results differ, but the text reports broad agreement that job satisfaction decreases when work-family conflict arises.',
        'Overall map: spillover describes transfer; compensation describes competing involvement; development describes change over time; self-determination describes supportive motivation; segmentation describes separation.'
      ], ru:'Точное число — больше девяти часов. Для финала ответа: больше конфликта между работой и семьёй → ниже удовлетворённость работой.'}
    ]
  },
  'environment': {
    lead: 'Our surroundings shape both health and the choices we can make. The article explains six areas of environmental health, using concrete examples to show why coordinated public action and individual choices both matter.',
    note: 'По статье Robyn Correll “How Environmental Health Impacts Our Quality of Life and Health” (2019). Числа и Healthy People 2020 относятся к источнику. В ответе: “According to the article…” — это не сегодняшняя статистика.',
    sections: [
      {title:'The central idea: surroundings shape health', cue:'Define environmental health and give examples of the environment limiting personal choices.', points:[
        'Definition: environmental health monitors and addresses physical, chemical and biological factors that affect physical and mental well-being, including factors beyond individual control.',
        'Choices depend on surroundings: unsafe sidewalks, polluted air or neighbourhood violence can discourage outdoor exercise. Building materials, nearby insects and food access also matter.',
        'The six areas: air quality; water and sanitation; toxic substances and hazardous wastes; homes and communities; infrastructure and surveillance; global environmental health.'
      ], ru:'Не только «экология»: это то, как внешняя среда влияет на тело, психику и доступные человеку решения. Следующие шесть блоков — каркас всего текста.'},
      {title:'1 · Air quality', cue:'Which essential substance is discussed here, and which four health outcomes are named?', points:[
        'Air is essential for survival, but people do not always ensure that it is safe to breathe.',
        'Four outcomes linked to polluted air in the text: sudden infant death syndrome (SIDS), lung cancer, chronic obstructive pulmonary disease (COPD), and low birth weight.'
      ], ru:'Четыре пункта: внезапная младенческая смерть, рак лёгкого, ХОБЛ и низкая масса при рождении. Air и water — ответ на вопрос о веществах, необходимых для выживания.'},
      {title:'2 · Water and sanitation', cue:'Recall the three population figures, the two treatments, the disease example and the investment estimate.', points:[
        'Access figures: 780 million people lack safe drinking water; 2.5 billion, roughly one third of the world’s population in the article, lack adequate sanitation.',
        'Daily consequences: an estimated 2,200 children die each day from diarrhoeal diseases linked to poor water and sanitation.',
        'Prevention: filtering and chlorinating water helped reduce diseases such as typhoid in the United States.',
        'Historical impact: the article attributes the bulk of the historical decline in US childhood mortality to clean water.',
        'Investment example: one cited estimate gives $23 in medical and societal cost savings per $1 invested in clean-water technologies in the US. These are cost savings, not business profit or a guaranteed return everywhere.'
      ], ru:'Связки чисел: 780 млн — вода; 2,5 млрд — санитария; 2200 детей в день — диарейные заболевания. Filtering + chlorinating; болезнь — typhoid. $1 → $23 сэкономленных расходов.'},
      {title:'3 · Toxic substances and hazardous wastes', cue:'What is toxicology? Retell the Flint example with its location, date, substance and affected group.', points:[
        'Toxicology studies how chemicals and substances affect people and their surroundings. Heavy metals and some plastics can pose risks.',
        'Flint, Michigan: news emerged in 2015 that drinking water contained lead.',
        'Consequences: lead exposure could cause lasting complications, including brain damage in children.',
        'Inequality: economically disadvantaged children were especially affected. Environmental risks and their consequences are not distributed equally.'
      ], ru:'Flint → Michigan → 2015 → lead (свинец) в воде → риск повреждения мозга у детей, особенно из экономически уязвимых семей.'},
      {title:'4 · Homes, communities and food deserts', cue:'Explain food deserts, who is affected and all three proposed responses.', points:[
        'Everyday safety: people spend the bulk of their time at home, work or school. Violence can keep families indoors, and poor road maintenance can increase car crashes.',
        'Food deserts: areas without nearby full-service grocery stores. Residents may depend on convenience stores, including gas-station shops.',
        'Why this matters: fresh produce may be scarce, poor in quality or expensive. Limited access worsens inequalities, especially for low-income and minority populations.',
        'Response 1: public gardens can improve local access to fresh food.',
        'Response 2: better public transport can connect residents to grocery stores and farmers markets.',
        'Response 3: zoning changes can encourage retailers to offer healthier food options.'
      ], ru:'Food desert — не отсутствие вообще любой еды, а нехватка доступных полноценных магазинов и свежих продуктов. Решения: общественные огороды → транспорт → правила использования городской территории.'},
      {title:'5 · Infrastructure and surveillance', cue:'What does surveillance involve? Explain the mosquito example and who uses the findings.', points:[
        'Activities: investigate and respond to disease through epidemiology; screen populations for hazards; monitor risks through surveillance programmes.',
        'Purpose: information helps allocate limited resources, prevent harm and evaluate whether control measures work.',
        'Mosquito example: test mosquitoes for infections such as Zika and monitor their populations.',
        'Users of the findings: doctors learn what to watch for; governments decide where and how to spray; the public receives warnings.'
      ], ru:'Surveillance здесь — систематический мониторинг рисков. Выучи цепочку: проверка комаров и численности → оценка мер → инструкции врачам, властям и жителям.'},
      {title:'6 · Global environmental health', cue:'Explain the climate and displacement mechanisms. Name the storms and conflict locations.', points:[
        'Climate and vectors: warmer, wetter conditions allow disease-carrying mosquitoes into places previously too cold, exposing more people to dengue and malaria.',
        'Rising seas: coastal cities and island nations may flood, potentially displacing millions into crowded areas where infections spread more easily.',
        'Extreme-weather examples: successive storms in 2017 affected Houston, Florida and Puerto Rico; floods destroyed homes, helped diseases spread and left millions without electricity.',
        'Political conflicts: the text names Syria, Afghanistan and South Sudan as places people have fled.',
        'Cross-border consequences: travel and displacement connect populations and health risks, so protecting one country alone is insufficient.'
      ], ru:'Два механизма: тепло и влажность → комары; наводнения и конфликты → переселение, скученность и инфекции. Не путай примеры штормов с тремя странами конфликтов.'},
      {title:'What should society and individuals do?', cue:'Separate coordinated public measures from the three groups of individual actions.', points:[
        'Why a system is necessary: one person cannot inspect every restaurant kitchen or test every water source for heavy metals.',
        'Public measures: coordinated laws, policies and programmes at local, federal and international levels, supported by trained food safety inspectors and toxicologists using standardised checks.',
        'Individual transport choices: cycle, use mass transportation or telecommute.',
        'Individual home checks: look for radon, lead paint and lead pipes.',
        'Community involvement: encourage local governments and businesses to invest in safer places to live, work and play.'
      ], ru:'Итог — совместная работа профессиональной системы и людей. Три личных направления: транспорт, проверка дома, участие в улучшении района.'}
    ]
  },
  'sleep': {
    lead: 'The sleeping brain can learn some unfamiliar word meanings without conscious awareness. A Japanese-word experiment shows this is possible, but awake learning is much more efficient and the long-term value remains uncertain.',
    note: 'В разделе 6.4 читаем “Can you learn a language in your sleep?” — Matthieu Koroma, The Conversation, 8 March 2023. Это статья об обучении во сне, а не общий список преимуществ сна.',
    sections: [
      {title:'The question and earlier evidence', cue:'What is the main research question? Describe the separate smoking example precisely.', points:[
        'Question: can the brain take in new information during sleep and retain it after waking? Neuroimaging shows that the sleeping brain remains active and reacts to the outside world.',
        'Earlier evidence: experiments involving tones and odours had already shown some capacity to learn new associations during sleep.',
        'Smoking example: people who wanted to quit were exposed during sleep to tobacco odour together with the unpleasant odour of rotten fish. Their consumption fell by 35%.',
        'Important distinction: the smoking example is earlier research. The 35% is not a score from the Japanese-word experiment.'
      ], ru:'Стартовая логика: мозг во сне не выключен → простые ассоциации возможны → проверяем более сложное обучение значениям слов. 35% относится только к потреблению сигарет в отдельном примере.'},
      {title:'Why Japanese, and who took part?', cue:'Give the choice-of-language rationale, the two word examples, the sample and the researchers.', points:[
        'Japanese: the article describes relatively simple syllable units and no complex tone system of the kind discussed for other East Asian languages. Its sounds were distinguishable to French or English speakers, while word meanings were unfamiliar.',
        'Word examples: neko means cat and consists of ne + ko; inu means dog.',
        'Participants: 22 healthy adults with no prior knowledge of Japanese or related East Asian languages.',
        'Research team named: author Matthieu Koroma; Sid Kouider at ENS–PSL; Maxime Elbaz and Damien Léger at AP-HP Hôtel-Dieu.'
      ], ru:'Удобный экспериментальный язык: звуки различимы, значения неизвестны. Число участников — 22; neko — кошка, inu — собака.'},
      {title:'The protocol: before, during and after sleep', cue:'Retell the three stages in order, using the dog example. What was and was not taught while awake?', points:[
        '1 · Awake preparation: participants associated pictures with familiar sounds, for example a dog picture with barking. This stage did not teach the Japanese word meanings.',
        '2 · Sleep exposure: researchers played the familiar sound together with the corresponding Japanese word, for example barking + inu.',
        '3 · Morning test: participants saw a Japanese word and chose the matching image from two pictures. For inu, the options could be a dog and a bell.',
        'Distractor: the unrelated picture could correspond to another word played during sleep. Participants also reported whether they were guessing or felt confident.'
      ], ru:'Картинка + звук наяву → звук + японское слово во сне → слово и выбор из двух картинок утром. Это центральная последовательность, которую нужно уметь рассказать без подсказки.'},
      {title:'What the behavioural results mean', cue:'Explain performance above chance, confidence and the term implicit learning.', points:[
        'Performance: participants matched words and images better than chance. This does not mean that every person remembered every word.',
        'Chance baseline: with two options, random guessing would itself produce about 50% correct answers on average; the relevant result was performance above that baseline.',
        'Confidence: it remained low for both correct and incorrect answers.',
        'Interpretation: the authors describe the learning as implicit. Participants retained some associations without clearly knowing that they knew them.'
      ], ru:'Угадать часть ответов можно случайно. Важны результат выше случайного и низкая уверенность даже при верных ответах. Implicit — неосознанное знание; точный процент успеха статья не приводит.'},
      {title:'EEG and slow waves', cue:'What did EEG measure, which pattern predicted memory, and what other study is mentioned?', points:[
        'EEG means electroencephalography: it records electrical brain activity.',
        'Slow waves occur during deep sleep. Words later remembered generated more slow waves than words later forgotten.',
        'Prediction: researchers could use activity during sleep to predict which words would be remembered after waking.',
        'Related finding: another publication linked slow waves to later memory for the relative size of objects.'
      ], ru:'Не «во сне мозг работал сильнее» вообще: конкретный показатель — slow waves. Больше таких волн при предъявлении слова было связано с последующим запоминанием.'},
      {title:'Awake versus asleep: do not mix up the numbers', cue:'Contrast repetition count, efficiency and confidence in the awake comparison.', points:[
        'Repetitions: the same protocol was carried out while awake with ten times fewer repetitions.',
        'Efficiency: participants learned five times more efficiently while awake than while asleep.',
        'Confidence while awake: they were more confident about learned words than forgotten words.',
        'Overall contrast: awake learning was quick and explicit; sleep-learning was slower and implicit.'
      ], ru:'10 — во столько раз меньше повторений наяву. 5 — во столько раз выше эффективность наяву. Не меняй числа местами.'},
      {title:'Limitations and the conclusion', cue:'Name the two open questions, what the experiment does not demonstrate, and the practical conclusion.', points:[
        'Unanswered questions: whether sleep-learning has long-term effects and whether it depends on individual differences in memory capacity.',
        'Scope: the experiment tested word–meaning associations. It did not demonstrate fluency, grammar mastery or learning a whole language while asleep.',
        'Conclusion: waking and sleeping states should be considered complementary. The author especially emphasises sleep as a way to consolidate information learned while awake.'
      ], ru:'Финальный ответ с оговоркой: некоторые слова усвоить можно, но наяву эффективнее, а долгосрочный эффект неясен. Сон дополняет обучение и закрепляет уже выученное.'}
    ]
  },
  'ted-work': {
    note: 'Опорный пересказ официального транскрипта Azim Shariff. В выступлении Jeff имеет ещё три года гарантированного контракта; в учебной адаптации Geoff начинает второй год трёхлетнего контракта. Для вопроса о TED используй первую версию.',
    sections: [
      {title:'Jeff: work with no added value', cue:'Retell the opening scenario, including the contract, the two choices and people’s evaluation.', points:[
        'Speaker: Azim Shariff is a psychology professor at the University of British Columbia who studies morality.',
        'Scenario: a medical scribe called Jeff can be replaced by software that produces equally good work for free. He still has three years on a guaranteed contract.',
        'Choice: stay home and keep receiving the contracted pay, or continue doing the unnecessary work for exactly the same money.',
        'Experiment: half the participants heard that Jeff went home; half heard that he continued working.',
        'Judgment: the working Jeff was seen as less competent, but warmer, more moral and more trustworthy, even though he added no value.'
      ], ru:'Смысл не в том, что Jeff бросил обязанности или потерял зарплату: программа делает работу, оплата одинакова. Люди морально одобряют усилие само по себе.'},
      {title:'Effort moralization: the experimental pattern', cue:'Explain effort moralization using the widget study, the three countries and the Hadza.', points:[
        'Effort moralization: people assign moral worth to hard work regardless of what it produces.',
        'Widget makers: two workers make the same number of items, in the same time, at the same quality. One must exert more effort.',
        'Result: the person who struggles is judged less competent but more moral, and is preferred as a cooperation partner.',
        'Cross-cultural evidence: the American result was replicated in South Korea and France, despite different work norms.',
        'Hadza hunter-gatherers in Tanzania: when asked about good character, they agreed on generosity and hard work. Shariff suggests the link is broader than a single culture or the Protestant work ethic.'
      ], ru:'Контролируются количество, время и качество результата — меняются усилия. Страны: US, South Korea, France. Hadza: Tanzania; два качества — generosity и hard work.'},
      {title:'Why the bias can make sense for an individual', cue:'Describe Paul, partner choice and the marathon comparison.', points:[
        'Paul: Shariff’s stylish, charismatic colleague runs every morning. He even buys $60 soap, which contributes to Shariff’s initial image of him as effortlessly perfect.',
        'Turning observation: Shariff sees Paul visibly struggling on a run. Persisting despite discomfort makes him look like someone dependable.',
        'Research connection: Paul is both an inspiration for these studies and a collaborator on them.',
        'Partner choice: people seek reliable collaborators who help in difficulties, do not slack off and share fairly. They also try to signal these qualities themselves.',
        'Donation example: people are more willing to support a friend running a marathon for cancer research than a friend watching a television marathon for the same cause.'
      ], ru:'Усилие служит сигналом: «этот человек не сдастся, на него можно положиться». Поэтому generosity, self-control и hard work получают моральную ценность.'},
      {title:'When the signal becomes the goal', cue:'Explain the human cost, Graeber’s question and Thompson’s concept of workism.', points:[
        'Societal problem: rewarding activity instead of productivity creates perverse incentives. People spend time signalling effort that could have gone to love or leisure.',
        'David Graeber: he asks why capitalism sustains jobs that even their workers see as pointless and without social value.',
        'Derek Thompson’s workism: employment becomes not only a source of income, but also a source of identity and self-actualisation.',
        'Competition: being a good partner is not enough; people try to look better and harder-working than others.',
        'Office example: two workers compete to be the first car in the parking lot, arriving earlier and earlier. Everyone else appears lazier, and the culture pressures them to keep up.'
      ], ru:'Workism — работа как основа идентичности. Arms race — гонка демонстративного трудолюбия: видимые затраты растут, полезный результат может не расти.'},
      {title:'The graduate student and the lab culture', cue:'What did the student do, why was it counterproductive, and how did Shariff respond?', points:[
        'Trigger: Shariff sent emails at 1, 2 or 3 a.m. because his flexible academic schedule let him stay up late.',
        'Student’s response: he used an app to schedule replies for 1 or 2 a.m., making himself appear to work all night.',
        'Perverse result: the student actually delayed work to signal industriousness.',
        'Response: Shariff needed to change his lab’s culture to value what people produced rather than the performance of working.',
        'Handling bias: deeply ingrained biases may be difficult to eliminate, but people can notice them and account for them in important decisions.'
      ], ru:'Пример особенно важен: демонстрация трудолюбия не просто бесполезна — она задержала результат. Решение начинается с изменения того, что руководитель поощряет.'},
      {title:'The cobra story: a bad proxy backfires', cue:'Retell the incentive → reaction → cancellation → outcome sequence. Is the story verified history?', points:[
        'Story setting: colonial Delhi under British rule. Authorities wanted fewer cobras and offered a bounty for cobra skins.',
        'Reaction: people started breeding cobras to kill them and claim the reward.',
        'Cancellation: after the bounty ended, breeders released the snakes, making the problem worse.',
        'Lesson: rewarding an imperfect signal of the desired outcome can undermine the outcome itself.',
        'Source status: Shariff explicitly calls the story almost certainly apocryphal. He uses it as an illustration, not verified historical evidence.'
      ], ru:'Цель — меньше кобр; метрика — сданные шкуры. Люди оптимизировали метрику. Аналогия: обществу нужен смысл и результат, а награда выдаётся за заметные усилия.'},
      {title:'The conclusion: meaningful work', cue:'Is Shariff arguing against hard work? State his recommendation and connect it to the opening example.', points:[
        'Not a rejection of effort: hard work can be deeply meaningful when it serves a purpose; Shariff points out that it built civilisation.',
        'Question to ask: does this effort produce something useful, or mainly build a moral reputation?',
        'Recommendation: reward meaningful outcomes rather than visible exertion alone.',
        'Return to Jeff: effort without additional value should not automatically make someone a better person or a better worker.'
      ], ru:'Сильный финал ответа: hard work matters when it serves a purpose. Спикер не призывает лениться; он предлагает перестать путать полезность и демонстрацию занятости.'}
    ]
  },
  'ted-ocean': {
    note: 'Все числа ниже — утверждения Emily de Sousa в выступлении, а не обновлённые оценки. На экзамене формулируй “The speaker says / estimates / warns…”. Её прогнозы также передаём как предупреждения спикера.',
    sections: [
      {title:'Her first dive and her reason for speaking', cue:'Describe her childhood connection with the ocean, the first dive and what she found.', points:[
        'Background: her parents could not swim, and the family travelled little. She learned about the sea through books and documentaries, first entering the ocean in her early teens.',
        'First scuba dive: at 19, off the southern coast of Oahu, Hawaii.',
        'Expectation versus reality: she expected colourful coral and diverse marine life, but saw damaged, lifeless-looking coral and hardly any wildlife.',
        'Purpose: this experience motivates her appeal to protect the oceans. She opens and closes with the image of one person as an ocean in a drop.'
      ], ru:'Ключевой личный пример: 19 лет → Oahu, Hawaii → ожидала яркий риф → увидела почти безжизненное дно. Не превращай этот эпизод в доказательство единственной причины повреждения конкретного рифа.'},
      {title:'Life before plastics and their rise', cue:'What did people use before modern plastics, why did plastics appeal to them, and when did the shift begin?', points:[
        'Earlier habits: refillable and washable glass milk containers; bags reused for shopping; local, seasonal fruit and vegetables without extra packaging.',
        'Time frame in the talk: modern plastic products became widespread from about the 1940s; their proliferation over roughly 70 years was extraordinary.',
        'Appeal: plastic was cheap, durable, mouldable and associated with safe, sanitary, abundant material goods.',
        'Lifestyle connection: nonstop workdays, fast food and disposable products made convenience attractive.',
        'Her distinction: plastic’s properties are useful; irresponsible use and disposal make it destructive.'
      ], ru:'Не «пластик плохой по определению». Долговечность удобна для повторного использования и опасна в сочетании с одноразовым потреблением.'},
      {title:'Production and waste: the numerical picture', cue:'Recall annual and cumulative production, the three weight comparisons, recycling and ocean entry.', points:[
        'Annual production claimed: more than 300 million tonnes. Total production to that point claimed: 9.1 billion tonnes.',
        'Weight comparisons: 25,000 Empire State Buildings; 80 million blue whales; one billion elephants.',
        'Recycling figure claimed: 25% of the annual plastic production is properly recycled.',
        'Ocean entry figure claimed: 8 million tonnes per year, of which 50% is single-use plastic.',
        'Interpret carefully: she does not establish that every tonne not recycled ends up in the ocean; annual production and annual ocean entry are different totals.'
      ], ru:'Раздели числа по смыслу: 300 млн — в год; 9,1 млрд — накопленный объём; 25% — переработка; 8 млн — в океан за год; 50% этого потока — одноразовый пластик.'},
      {title:'Animals and everyday disposable items', cue:'Name the animal groups, the bag and straw examples, and the three related figures.', points:[
        'Bags and turtles: the speaker links discarded bags to turtle deaths and gives a bag an average working life of only 15 minutes.',
        'Seabirds: she cites an estimate that 99% have ingested plastic during their lifetime and refers to a viral photograph.',
        'Straws: she cites 57 million used every day in Canada and describes a viral video of a crew removing a straw from a turtle’s nostril.',
        'Coral: reefs are living, environmentally sensitive organisms. She discusses plastic-related reef damage, including the Great Barrier Reef.',
        'Larger predators: whales, sharks and dolphins can consume contaminated smaller animals; she describes toxin bioaccumulation and problems such as liver failure.'
      ], ru:'Группы для ответа: turtles, seabirds, corals, whales, sharks, dolphins. Числа: 15 минут; 99%; 57 млн соломинок в Канаде ежедневно — всё по словам спикера.'},
      {title:'Plastic returns through the food chain', cue:'Explain microplastics, the route back to humans and the human-exposure figures in the talk.', points:[
        'Persistence: the speaker explains that discarded plastic breaks into progressively smaller pieces rather than simply disappearing.',
        'Microplastics: small fish and even plankton can mistake tiny pieces for food; the material then moves through the food chain.',
        'Human exposure claims: 67% of seafood consumed by people contains plastic; regular seafood eaters may ingest up to 11,000 pieces a year.',
        'Meaning of her central image: humans take resources from the ocean, dump unwanted waste into it, and then receive some of that waste back through food.'
      ], ru:'Цепочка: выбросили → мелкие частицы → планктон и рыба → пищевая цепь → человек. Здесь нужно объяснить смысл цитаты, а не только перечислить проценты.'},
      {title:'Her work, the global scale and technofossils', cue:'What does her conservation work involve? Why these media? Which two places and long-term traces are mentioned?', points:[
        'Occupation and mission: she describes about three years of ocean conservation work, focusing on digital storytelling.',
        'Methods: photographs, YouTube videos and short blog posts translate environmental issues for ordinary people. Long academic papers often do not reach a mass audience.',
        'Desired effect: bridge the knowledge gap, educate, raise awareness and inspire action.',
        'Places: beaches in the Maldives, which she imagined as a pristine honeymoon destination, were littered with bottles. Her hometown Toronto also suffers from plastic pollution.',
        'Technofossils: persistent human-made plastic leaves traces in the fossil record. She says almost every plastic product ever made still exists in some form.',
        'Scale: she reports that the UN calls ocean plastic pollution a planetary crisis.'
      ], ru:'Digital storytelling — донести проблему через доступные медиа. Maldives + Toronto показывают, что загрязнение есть и в «райских» местах, и дома. Technofossils — долговечные следы человеческих изделий.'},
      {title:'Why oceans matter and the 2050 warning', cue:'List the ocean’s roles, the oxygen figures as speaker claims, and the consequences of her warning.', points:[
        'Ocean roles: oxygen production, carbon storage and biodiversity. She calls the oceans the planet’s lungs and its largest carbon sink.',
        'Oxygen figures she gives: 70% from oceans versus 28% from trees. Attribute these numbers to the talk rather than presenting them as a current scientific reference.',
        '2050 warning: she cites an estimate of more plastic than fish in the ocean.',
        'Livelihood consequences in her scenario: seafood becomes a scarce luxury; fishing communities lose income and may be forced to migrate.',
        'Everyday consequences in her scenario: polluted holiday beaches, lost opportunities for swimming and fewer chances to experience healthy coral and marine wildlife.'
      ], ru:'Переход для ответа: океан важен не только рыбой и отдыхом — он участвует в поддержании жизни. Затем перечисли последствия для еды, занятости, миграции и отдыха.'},
      {title:'Solutions: circular use and personal actions', cue:'Explain the economic direction, list all personal actions, and recall the audience example.', points:[
        'Direction: plastics will remain part of the future, so use them responsibly, maximise recycling and minimise new production.',
        'Circular economy: old products become new products; reuse and repurpose existing materials instead of continuing the single-use cycle.',
        'Personal actions: replace disposable water bottles and coffee cups with reusable ones; bring reusable shopping bags; avoid plastic-wrapped produce; request drinks without straws.',
        'Audience illustration: if all 400 people in the room refuse one straw, that is 400 straws avoided.',
        'Closing argument: individual action can contribute to change alongside broader measures. Many small daily decisions combine into a larger effect.'
      ], ru:'Выучи пять действий: бутылка, кофейная кружка, сумка, овощи без упаковки, напиток без соломинки. Финал связывает одного человека с коллективным результатом.'}
    ]
  },
  'ted-emotions': {
    note: 'Структура официального выступления Ramona Hacker: личный опыт → определение → обучение навыку → шесть шагов → школа и общество. Её широкие объяснения социальных проблем передаём как позицию спикера.',
    sections: [
      {title:'The opening and her personal turning point', cue:'What did she ask the audience? What changed her own attitude to emotions?', points:[
        'Opening survey: with eyes closed, the audience considers whether they recently thought about emotional intelligence, consider themselves emotionally intelligent, and have consciously practised emotional skills.',
        'Earlier attitude: Hacker relied on rational thinking and regarded emotions as illogical and unimportant.',
        'Turning point: five years before the talk, burnout led her to leave a job. She began crying uncontrollably and hid in the restroom, realising she needed to work on her emotions.',
        'Childhood example: loneliness and fear sometimes became aggression. Dismissive reactions at home did not teach her how to understand emotions, making friendship losses and breakups harder.'
      ], ru:'Burnout — момент осознания проблемы. Пример подмены чувства появляется уже в её биографии: страх или одиночество превращались в агрессию.'},
      {title:'What emotional intelligence actually means', cue:'Distinguish being emotional from emotional intelligence and name the three abilities.', points:[
        'Definition in the talk: the ability to identify and manage one’s own emotions and those of others.',
        'Ability 1: emotional awareness, including empathy for other people and for oneself.',
        'Ability 2: harnessing emotions and applying them to tasks such as problem solving.',
        'Ability 3: managing emotions, including regulating oneself and calming down or cheering up others.',
        'Key distinction: showing strong feelings does not automatically mean understanding their origin, regulating them or recognising whether their expression fits a situation.'
      ], ru:'Emotional ≠ emotionally intelligent. Три опоры: замечать → использовать → регулировать. Эмоциональный интеллект — навык обращения с чувствами, а не их сила.'},
      {title:'Why society needs the skill, and how it is learned', cue:'Why does she discuss children and role models? Retell the four learning stages and the driving analogy.', points:[
        'Social argument: Hacker connects poor understanding of oneself and others with insecurity, harmful relationships and conflict. These are her broad explanations, not a demonstration of one universal cause.',
        'Children’s schedules: school, sport, an instrument and languages may leave little space for understanding themselves and their feelings. Adults must learn too, to become useful role models.',
        'Learning sequence: unconscious incompetence → conscious incompetence → conscious competence → unconscious competence.',
        'Meaning: first you do not recognise a missing skill; then you recognise it; then you practise deliberately; eventually parts become automatic.',
        'Driving analogy: learning the basics and practising steering while changing gear initially takes effort; later, changing gear no longer requires conscious thought. Her burnout made her recognise her own lack of skill.'
      ], ru:'Самый трудный переход — от «вижу, что не умею» к «могу сделать осознанно». Не путай четыре стадии освоения навыка с шестью шагами её практического гайда.'},
      {title:'Steps 1–3: recognise, distinguish, accept', cue:'Name and explain the first three steps. Include the work example, emotion substitution and sadness.', points:[
        '1 · Acknowledge emotions as valuable. Ask how people feel with genuine interest; answer honestly instead of automatically saying you are fine.',
        'Communication example: use an I-message about not feeling appreciated at work rather than simply complaining about colleagues. Let people know it is acceptable to have and discuss feelings.',
        'Why valuable: Hacker refers to António Damásio’s research on people with damage to emotion-related brain regions having difficulty making rational decisions.',
        '2 · Differentiate and analyse emotions. Identify the feeling underneath rather than replacing it with a more familiar or easier-to-handle one; different feelings have different functions.',
        '3 · Accept and appreciate emotions. She argues that feelings are not inherently good or bad; society adds these labels.',
        'Sadness example: grief can reflect how much a person or something lost matters to us, instead of being merely an unwanted feeling to erase.'
      ], ru:'1 — признать ценность; 2 — точно назвать; 3 — принять. I-message начинается с собственного переживания. Принять эмоцию не означает одобрить любое действие под её влиянием.'},
      {title:'Steps 4–6: reflect, handle, support', cue:'Name the last three steps, distinguish reflection from analysis, and explain the two ways of supporting someone.', points:[
        '4 · Reflect on emotions and their origin. Ask why you feel this way; understanding the cause may already help.',
        '5 · Handle your emotions. Reflection may be enough, or you may need another approach. Find an individual strategy through trial and error.',
        'Examples: write feelings down, read about them, talk to friends, do sport or meditate. No single method is presented as the right one for everyone.',
        '6 · Handle other people’s emotions. Understanding your own feelings can make it easier to understand theirs, even while you are still learning.',
        'Two helpful questions: ask how you can support the person now, and how they can support themselves. The second also helps them develop their own emotional skills.'
      ], ru:'4 — откуда чувство; 5 — как с ним справиться; 6 — как помочь другому. Не «управлять человеком», а понимать и поддерживать его.'},
      {title:'Her practical tools and the names mentioned', cue:'How often does she journal, why does writing help, and which authors or books does she mention?', points:[
        'Journal: she writes emotions down when needed, not necessarily daily; entries may be weeks or months apart. Friends use apps for similar purposes.',
        'Functions of writing: recognise and distinguish feelings, accept them, reflect on origins, and create some distance from the emotion.',
        'Writing reference: Pennebaker and Smyth, Opening Up by Writing It Down, mentioned for work on written emotional expression.',
        'Other reading: The Language of Emotions by Karla McLaren, and books by Brené Brown.',
        'Social learning: ask friends how they approach similar feelings or situations, then try what works for you.'
      ], ru:'Не нужно говорить, что она ведёт дневник каждый день. Имена распределяй по смыслу: Damásio — эмоции и решения; Pennebaker/Smyth — письмо; McLaren и Brown — книги.'},
      {title:'Emotional education in school', cue:'What should children learn, and how could schools implement it in existing activities?', points:[
        'Content: teach different emotions and their functions; provide space to talk openly, acknowledge feelings, and learn to accept and appreciate them.',
        'Books: include reading about emotional intelligence in schoolwork.',
        'Case studies: let children work together and exchange ideas about responding to emotional situations.',
        'Reason: emotional intelligence is a fundamental life skill; academic performance and extracurricular achievements alone do not teach it.'
      ], ru:'Конкретные предложения — подходящие книги, совместные case studies, открытое обсуждение чувств и их функций. Не приписывай ей подробную программу отдельного предмета.'},
      {title:'The world she invites the audience to imagine', cue:'What benefits does she expect for decisions, relationships and society? Give the boss or parent example.', points:[
        'Personal decisions: understanding oneself can improve choices and help people recognise and handle emotional suffering.',
        'Relationships: people may connect more deeply and be less likely to pass their distress on to others.',
        'Everyday examples: an emotionally intelligent boss or parent could approach people’s differences, mental health and conflict with more understanding.',
        'Final vision: greater mutual understanding, acceptance, tolerance, connection and inclusion.',
        'Six-step recap: acknowledge value → differentiate and analyse → accept and appreciate → reflect on origins → handle your emotions → support others.'
      ], ru:'Финал — ожидаемые преимущества навыка, а не обещание исчезновения всех проблем. Для ответа свяжи личное понимание себя с отношениями и общественной терпимостью.'}
    ]
  }
};
readings.forEach(r => Object.assign(r, materialSummaries[r.id]));


const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Exercise IDs are persistent study keys. Keep their meaning when editing the bank.
const grammarTopics = [
  {id:'conditionals',title:'Conditionals',subtitle:'Zero, first, second, third',rules:`
    <h3>Сначала выбери время и реальность ситуации</h3>
    <ul class="grammar-rules">
      <li><strong>Zero: закономерность или привычный результат.</strong><p lang="en">If + present simple, present simple.<br>If I do not sleep enough, I find it harder to concentrate.</p><p class="muted">Если это происходит, обычно получается такой результат. Часто можно заменить if на when.</p></li>
      <li><strong>First: реальная возможность в будущем.</strong><p lang="en">If + present simple, will + verb.<br>If I go to bed earlier tonight, I will feel better tomorrow.</p><p class="muted">Будущее, но в обычном условии после if — настоящее, без will. В результате также возможны can, may или повелительное наклонение.</p></li>
      <li><strong>Second: воображаемое или маловероятное сейчас / в будущем.</strong><p lang="en">If + past simple, would + verb.<br>If I had more time, I would sleep more.</p><p class="muted">Past simple здесь показывает нереальность, а не прошлое. В формальном ответе: If I were you…; If she were here…</p></li>
      <li><strong>Third: воображаемое изменение прошлого.</strong><p lang="en">If + past perfect, would have + V3.<br>If I had gone to bed earlier, I would not have been so tired.</p><p class="muted">Событие уже произошло иначе. V3 — третья форма: gone, seen, done; у правильных глаголов форма на -ed.</p></li>
    </ul><h3>Не перепутай</h3><ul><li><span lang="en">If I knew…</span> — сейчас не знаю. <span lang="en">If I had known…</span> — тогда не знал.</li><li><span lang="en">Unless = if … not:</span> Unless you hurry, you will miss the train. Не добавляй второе отрицание без причины.</li><li><span lang="en">I’d go = I would go.</span> <span lang="en">I’d gone = I had gone.</span> Смотри на форму следующего глагола.</li><li>Если if-часть первая, после неё обычно ставим запятую. Если вторая — обычно нет.</li></ul>`},
  {id:'deduction',title:'Modal deduction',subtitle:'Выводы о настоящем и прошлом',rules:`
    <h3>Степень уверенности</h3><ul class="grammar-rules">
      <li><strong>Must — почти уверен, что да.</strong><p lang="en">He must be tired. He has worked all night.</p><p class="muted">Здесь must — логический вывод, а не обязанность.</p></li>
      <li><strong>May / might / could — возможно.</strong><p lang="en">He might be at home. He could be resting.</p><p class="muted">В контексте предположения все три выражают возможность; may not / might not — возможно, что нет.</p></li>
      <li><strong>Can’t / couldn’t — уверен, что это невозможно.</strong><p lang="en">He cannot be hungry. He has just eaten a huge lunch.</p><p class="muted">Mustn’t означает запрет. Для отрицательного вывода в этих заданиях используй can’t / couldn’t.</p></li>
    </ul><h3>Форма показывает время</h3><ul class="grammar-rules">
      <li><strong>Сейчас, состояние: modal + verb.</strong><p lang="en">She must know the answer.</p></li>
      <li><strong>Прямо сейчас, процесс: modal + be + -ing.</strong><p lang="en">She might be sleeping now. Do not call her.</p><p class="muted">Might sleep — возможно, поспит. Might be sleeping — возможно, сейчас спит.</p></li>
      <li><strong>Прошлое: modal + have + V3.</strong><p lang="en">He must have forgotten about the meeting.<br>She cannot have read 200 pages in five minutes.<br>He might have missed the train.</p><p class="muted">Не must had и не might have went. Нужны have и третья форма.</p></li>
    </ul><p class="muted">Отдельно: should have done — обычно «следовало сделать», а не тот же вывод, что must have done. Не подменяй им уверенность о прошлом.</p>`},
  {id:'verb-patterns',title:'Gerund & infinitive',subtitle:'Формы и изменения смысла',rules:`
    <h3>Основные конструкции</h3><ul class="grammar-rules">
      <li><strong>Verb + -ing.</strong><p lang="en">enjoy, avoid, finish, mind, suggest, consider, admit, deny, risk, keep, give up, put off + doing</p><p lang="en">She suggested taking a break. He admitted making a mistake.</p></li>
      <li><strong>Verb + to + verb.</strong><p lang="en">decide, hope, plan, promise, agree, refuse, afford, offer, manage, fail, want, learn + to do</p><p lang="en">We decided to leave. She promised to help.</p></li>
      <li><strong>После предлога — -ing.</strong><p lang="en">before leaving · interested in learning · look forward to meeting</p><p class="muted">В look forward to слово to — предлог. Поэтому не to meet.</p></li>
      <li><strong>Цель: to + verb. Подлежащее: часто -ing.</strong><p lang="en">I came here to study. Learning takes time.<br>It is difficult to concentrate.</p></li>
    </ul><h3>Один глагол, два смысла</h3><ul class="grammar-rules">
      <li><strong>Remember / forget.</strong><p lang="en">I remember locking the door. → Помню, как запер.<br>I remembered to lock the door. → Не забыл и запер.<br>I forgot to lock the door. → Не запер, потому что забыл.<br>I will never forget meeting her. → Не забуду уже случившуюся встречу.</p></li>
      <li><strong>Stop.</strong><p lang="en">I stopped drinking coffee. → Перестал пить кофе.<br>I stopped to drink coffee. → Прервал другое дело, чтобы выпить кофе.</p></li>
      <li><strong>Try.</strong><p lang="en">Try restarting it. → Испытай способ: перезапусти.<br>I tried to restart it. → Пытался перезапустить.</p></li>
      <li><strong>Regret.</strong><p lang="en">I regret saying that. → Жалею, что сказал.<br>We regret to inform you… → С сожалением сообщаем…</p></li>
      <li><strong>Go on.</strong><p lang="en">She went on talking. → Продолжила то же действие.<br>She went on to discuss sleep. → Перешла к следующей теме.</p></li>
      <li><strong>Like / love / hate / prefer.</strong><p class="muted">Обычно возможны обе формы. -ing часто подчёркивает сам процесс, to-infinitive — привычку или предпочтение; разница не всегда строгая. После would like / love / prefer — to-infinitive.</p><p lang="en">I like swimming. I like to swim before work. I would like to swim today.</p></li>
    </ul>`}
];
const grammarExercises = [
  ['c01','conditionals','I do not have enough time now, so I cannot sleep more. Start with “If”.','had',['If I had more time, I would sleep more.','If I had enough time, I could sleep more.','If I had enough time, I would be able to sleep more.'],'Second conditional: нереальная ситуация сейчас. Had + would/could + verb.'],
  ['c02','conditionals','I went to bed late last night. As a result, I was tired this morning. Imagine the opposite.','earlier',['If I had gone to bed earlier last night, I would not have been so tired this morning.'],'Third conditional: обе ситуации относятся к завершённому прошлому.'],
  ['c03','conditionals','Maybe I will go to bed earlier tonight. In that case, I will feel better tomorrow. Combine into one sentence.','if',['If I go to bed earlier tonight, I will feel better tomorrow.'],'First conditional: после if — present simple, результат — will feel.'],
  ['c04','conditionals','Whenever I do not get enough sleep, I find it harder to concentrate. Use a conditional sentence.','if',['If I do not get enough sleep, I find it harder to concentrate.'],'Zero conditional: повторяющаяся закономерность, present simple в обеих частях.'],
  ['c05','conditionals','I do not know the answer, so I cannot tell you. Imagine that I know it.','knew',['If I knew the answer, I would tell you.','If I knew the answer, I could tell you.'],'Не знаю сейчас → if + past simple, would/could + tell.'],
  ['c06','conditionals','I did not know about the test yesterday, so I did not prepare for it. Imagine the opposite.','known',['If I had known about the test yesterday, I would have prepared for it.'],'Не знал тогда → had known; не подготовился → would have prepared.'],
  ['c07','conditionals','Hurry, or you will miss the train. Begin with “Unless”.','unless',['Unless you hurry, you will miss the train.'],'Unless you hurry = if you do not hurry.'],
  ['c08','conditionals','I am not you. My advice is to take a break. Begin with “If”.','were',['If I were you, I would take a break.'],'If I were you — стандартная конструкция для совета.'],
  ['c09','conditionals','She did not set an alarm, so she overslept. Imagine the opposite.','set',['If she had set an alarm, she would not have overslept.'],'Third conditional. Set–set–set; oversleep–overslept–overslept.'],
  ['c10','conditionals','You may finish the report today. Then we will discuss it tomorrow. Make one conditional sentence.','if',['If you finish the report today, we will discuss it tomorrow.'],'Реальное будущее: finish после if, will discuss в результате.'],
  ['d01','deduction','I am almost certain he forgot the meeting: he did not turn up. Express a deduction.','must',['He must have forgotten about the meeting.','He must have forgotten the meeting.'],'Вывод о прошлом: must have + forgotten.'],
  ['d02','deduction','It is impossible that she read the whole 200-page report in five minutes.','cannot',['She cannot have read the whole report in five minutes.','She cannot have read the whole 200-page report in five minutes.'],'Отрицательный вывод о прошлом: cannot have + read.'],
  ['d03','deduction','Perhaps he missed the train. Express this possibility.','might',['He might have missed the train.'],'Прошлое и неуверенность: might have missed.'],
  ['d04','deduction','It is impossible that he is hungry: he has just eaten a huge lunch.','cannot',['He cannot be hungry.'],'Состояние сейчас: cannot be. Must not — не нужное здесь отрицание.'],
  ['d05','deduction','Perhaps she is sleeping right now. Express this possibility.','might',['She might be sleeping right now.','She might be sleeping now.'],'Процесс прямо сейчас: might be sleeping.'],
  ['d06','deduction','I am almost certain he is preparing for the exam now: his books are open and he is taking notes.','must',['He must be preparing for the exam now.','He must be preparing for the exam.'],'Вывод о текущем процессе: must be preparing.'],
  ['d07','deduction','It is possible that they are at home.','may',['They may be at home.'],'Возможное состояние в настоящем: may be.'],
  ['d08','deduction','I am almost certain she was exhausted after the exam.','must',['She must have been exhausted after the exam.'],'Вывод о прошлом состоянии: must have been.'],
  ['d09','deduction','It is impossible that he sent the email: he had no internet access.','could not',['He could not have sent the email.'],'Could not have sent — невозможность того, что письмо отправлено.'],
  ['d10','deduction','Perhaps she did not see my message.','might not',['She might not have seen my message.'],'Might not have seen — возможно, не увидела. Cannot have seen — уверен, что не могла увидеть.'],
  ['g01','verb-patterns','“Let us take a break,” she said. Report her suggestion.','suggested',['She suggested taking a break.'],'Suggest + -ing. Не suggested to take.'],
  ['g02','verb-patterns','“Yes, I made a mistake,” he said. Report his admission.','admitted',['He admitted making a mistake.','He admitted having made a mistake.'],'Admit + -ing. Having made дополнительно подчёркивает предшествование.'],
  ['g03','verb-patterns','We made the decision that we would leave early.','decided',['We decided to leave early.'],'Decide + to-infinitive.'],
  ['g04','verb-patterns','“I will help you,” she promised.','promised',['She promised to help me.','She promised to help you.'],'Promise + to-infinitive. Me/you зависит от того, кто пересказывает обещание.'],
  ['g05','verb-patterns','I am excited about our meeting next week. Begin with “I look forward”.','meeting',['I look forward to meeting you next week.','I look forward to our meeting next week.'],'В look forward to слово to — предлог: далее -ing или существительное.'],
  ['g06','verb-patterns','I locked the door, and I clearly remember the action.','locking',['I remember locking the door.','I clearly remember locking the door.'],'Remember doing — помнить уже совершённое действие.'],
  ['g07','verb-patterns','I needed to lock the door. I did not forget, and I did it.','remembered',['I remembered to lock the door.'],'Remember to do — не забыть выполнить действие.'],
  ['g08','verb-patterns','I did not submit the essay because I forgot.','forgot',['I forgot to submit the essay.'],'Forget to do — забыть выполнить, поэтому не сделать.'],
  ['g09','verb-patterns','I used to drink coffee, but I no longer do.','stopped',['I stopped drinking coffee.'],'Stop doing — прекратить именно это действие.'],
  ['g10','verb-patterns','I was walking. I paused because I wanted to buy a coffee.','stopped',['I stopped to buy a coffee.','I stopped walking to buy a coffee.'],'Stop to do — прервать другое занятие ради нового действия.'],
  ['g11','verb-patterns','The computer is frozen. Restart it as an experiment to see whether that helps.','try',['Try restarting the computer.','Try restarting it.'],'Try doing — испытать способ решения.'],
  ['g12','verb-patterns','I made an effort to open the window, but it was stuck.','tried',['I tried to open the window, but it was stuck.','I tried to open the window.'],'Try to do — приложить усилие; успех из этой формы не следует.'],
  ['g13','verb-patterns','I said something rude, and now I am sorry about it.','regret',['I regret saying something rude.','I regret having said something rude.'],'Regret doing — сожалеть о совершённом действии.'],
  ['g14','verb-patterns','We are sorry to tell you that your application was unsuccessful.','regret',['We regret to inform you that your application was unsuccessful.','We regret to tell you that your application was unsuccessful.'],'Regret to inform/tell — формальное сообщение неприятной новости.'],
  ['g15','verb-patterns','She continued talking about the same topic.','went on',['She went on talking about the same topic.'],'Go on doing — продолжать то же действие.'],
  ['g16','verb-patterns','After discussing IQ, she moved to a new topic: emotional intelligence.','went on',['After discussing IQ, she went on to discuss emotional intelligence.','She went on to discuss emotional intelligence.'],'Go on to do — перейти к следующему действию или теме.']
].map(([id,topic,prompt,keyword,answers,why])=>({id,topic,prompt,keyword,answers,why}));
const grammarState={topic:'conditionals',id:'c01',stage:'rules'};
const grammarDrafts={};
const grammarPanel=document.getElementById('panel-grammar');
// Exact variants confirm known answers; unmatched free text always gets self-review.
function normalizeGrammar(value){return value.toLowerCase().replace(/[’‘]/g,"'").replace(/\bcan't\b/g,'cannot').replace(/\bcannot\b/g,'can not').replace(/\bwon't\b/g,'will not').replace(/n't\b/g,' not').replace(/\bi'm\b/g,'i am').replace(/\b(\w+)'re\b/g,'$1 are').replace(/\b(\w+)'ll\b/g,'$1 will').replace(/\b(\w+)'ve\b/g,'$1 have').replace(/[.,!?;:]/g,'').replace(/\s+/g,' ').trim();}
function grammarPool(){
  const only=document.getElementById('grammar-only').checked;
  const groups=grammarTopics.map(t=>grammarExercises.filter(q=>q.topic===t.id));
  const all=Array.from({length:Math.max(...groups.map(g=>g.length))},(_,i)=>groups.map(g=>g[i]).filter(Boolean)).flat();
  return (grammarState.topic==='all'?all:grammarExercises.filter(q=>q.topic===grammarState.topic)).filter(q=>!only||study['grammar-'+q.id]!==2);
}
function paintGrammar(fields=false){
  if(fields){
    if(['all',...grammarTopics.map(t=>t.id)].includes(study['grammar-topic']))grammarState.topic=study['grammar-topic'];
    if(grammarExercises.some(q=>q.id===study['grammar-current']))grammarState.id=study['grammar-current'];
    renderGrammar();
  }
  const known=grammarExercises.filter(q=>study['grammar-'+q.id]===2).length;
  document.getElementById('grammar-count').textContent=`Получилось: ${known} из ${grammarExercises.length}`;
  const mark=grammarPanel.querySelector('.grammar-mark');
  if(mark)mark.textContent=({1:'Отмечено: повторить',2:'Отмечено: получилось'}[study['grammar-'+grammarState.id]]||'Без отметки');
  grammarPanel.querySelectorAll('[data-grammar-rate]').forEach(b=>b.setAttribute('aria-pressed',String(study['grammar-'+grammarState.id]===Number(b.dataset.grammarRate))));
}
function renderGrammarCard(){
  const pool=grammarPool(),box=document.getElementById('grammar-card');
  if(!pool.some(q=>q.id===grammarState.id))grammarState.id=pool[0]?.id;
  const q=pool.find(q=>q.id===grammarState.id);
  if(!q){box.innerHTML='<h3>Всё отмечено «Получилось»</h3><p>Сними фильтр, чтобы пройти задания ещё раз.</p>';return;}
  const draft=grammarDrafts[q.id]??study['grammar-draft-'+q.id]??'';
  box.innerHTML=`<p class="material-card-position">Задание ${pool.indexOf(q)+1} из ${pool.length}</p><p class="material-prompt" lang="en">${escapeHTML(q.prompt)}</p><p>Используй: <strong lang="en">${escapeHTML(q.keyword)}</strong></p><label class="write-label" for="grammar-answer">Твоя переформулировка</label><textarea id="grammar-answer" lang="en" rows="3" maxlength="2000" placeholder="Напиши полное предложение…">${escapeHTML(draft)}</textarea><div class="actions"><button type="button" class="action filled" data-grammar-check>Проверить</button><button type="button" class="action" data-grammar-show>Показать разбор</button></div><div id="grammar-feedback" hidden><p role="status" id="grammar-result"></p><p class="eyebrow">Один из верных вариантов</p><p lang="en">${escapeHTML(q.answers[0])}</p><p class="muted">${escapeHTML(q.why)}</p><div class="rating" role="group" aria-label="Самооценка"><button type="button" class="action" data-grammar-rate="1" aria-pressed="false">Повторить</button><button type="button" class="action" data-grammar-rate="2" aria-pressed="false">Получилось</button></div></div><div class="material-card-controls"><button type="button" class="action" data-grammar-move="-1" ${pool.length<2?'disabled':''}>← Назад</button><span class="grammar-mark material-card-mark"></span><button type="button" class="action" data-grammar-move="1" ${pool.length<2?'disabled':''}>Далее →</button></div>`;
  paintGrammar();
}
function renderGrammar(){
  const topic=grammarTopics.find(t=>t.id===grammarState.topic);
  document.getElementById('grammar-current').textContent=topic?.title||'Всё вперемешку';
  grammarPanel.querySelectorAll('[data-grammar-topic]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.grammarTopic===grammarState.topic)));
  document.getElementById('grammar-rules').innerHTML=(topic?[topic]:grammarTopics).map(t=>`<article class="study-block"><h2>${t.title}</h2>${t.rules}</article>`).join('');
  renderGrammarCard();
}
function showGrammarAnswer(check){
  const q=grammarExercises.find(q=>q.id===grammarState.id),input=document.getElementById('grammar-answer');
  if(check&&!input.value.trim()){input.focus();input.setCustomValidity('Сначала напиши свой ответ.');input.reportValidity();return;}
  document.getElementById('grammar-feedback').hidden=false;
  document.getElementById('grammar-result').textContent=!check?'Сравни с тем, что вспомнил сам.':q.answers.some(a=>normalizeGrammar(a)===normalizeGrammar(input.value))?'Верно ✓ Теперь отметь, получилось ли без подсказки.':'Формулировка отличается от сохранённых вариантов. Сравни смысл, время и конструкцию с разбором: другой правильный ответ тоже возможен.';
}
document.getElementById('grammar-choices').innerHTML=[...grammarTopics,{id:'all',title:'Всё вперемешку',subtitle:'36 переформулировок по всем темам'}].map(t=>`<button type="button" class="material-choice" data-grammar-topic="${t.id}" aria-pressed="false"><span>${t.title}<small>${t.subtitle}</small></span><span class="material-check" aria-hidden="true">✓</span></button>`).join('');
grammarPanel.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.grammarTopic){grammarState.topic=b.dataset.grammarTopic;grammarState.id=null;renderGrammar();document.getElementById('grammar-picker').open=false;document.querySelector('#grammar-picker>summary').focus();if(signedIn){setStudy('grammar-topic',grammarState.topic);setStudy('grammar-current',grammarState.id||'');}}
  if(b.dataset.grammarStage){grammarState.stage=b.dataset.grammarStage;grammarPanel.querySelectorAll('[data-grammar-view]').forEach(v=>v.hidden=v.dataset.grammarView!==grammarState.stage);grammarPanel.querySelectorAll('[data-grammar-stage]').forEach(v=>v.setAttribute('aria-pressed',String(v.dataset.grammarStage===grammarState.stage)));}
  if(b.hasAttribute('data-grammar-check'))showGrammarAnswer(true);
  if(b.hasAttribute('data-grammar-show'))showGrammarAnswer(false);
  if(b.dataset.grammarRate){setStudy('grammar-'+grammarState.id,Number(b.dataset.grammarRate));if(signedIn&&document.getElementById('grammar-only').checked&&b.dataset.grammarRate==='2'){renderGrammarCard();document.getElementById('grammar-answer')?.focus();}}
  if(b.dataset.grammarMove){const pool=grammarPool();if(!pool.length){renderGrammarCard();return;}const pos=pool.findIndex(q=>q.id===grammarState.id);grammarState.id=pool[(pos+Number(b.dataset.grammarMove)+pool.length)%pool.length].id;renderGrammarCard();document.getElementById('grammar-answer').focus();if(signedIn)setStudy('grammar-current',grammarState.id);}
});
grammarPanel.addEventListener('input',e=>{if(e.target.id==='grammar-answer'){e.target.setCustomValidity('');grammarDrafts[grammarState.id]=e.target.value;if(signedIn)setStudy('grammar-draft-'+grammarState.id,e.target.value);}});
grammarPanel.addEventListener('keydown',e=>{if(e.isComposing)return;if(e.target.id==='grammar-answer'&&e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();showGrammarAnswer(true);}if(e.key==='Escape'&&e.target.closest('#grammar-picker')){document.getElementById('grammar-picker').open=false;document.querySelector('#grammar-picker>summary').focus();}});
document.getElementById('grammar-only').onchange=()=>renderGrammarCard();
renderGrammar();

const readingList = document.getElementById('reading-list');
const materialCards = Object.fromEntries(readings.map(r => [r.id, {index:0, revealed:false}]));
const summaryPoints = section => `<ul lang="en">${section.points.map(p=>{const colon=p.indexOf(':');return `<li>${colon>0?`<strong>${escapeHTML(p.slice(0,colon+1))}</strong>${escapeHTML(p.slice(colon+1))}`:escapeHTML(p)}</li>`;}).join('')}</ul>`;
function renderReadings() {
  document.querySelector('#panel-reading .section-intro h2').textContent = 'Понять. Запомнить. Рассказать.';
  document.querySelector('#panel-reading .section-intro p').textContent = 'Шесть материалов к пересдаче. Сначала разбери полный саммари, затем вспомни детали по карточкам и восстанови весь материал без подсказок.';
  document.getElementById('reading-select').innerHTML = readings.map(r=>`<option value="${r.id}">${escapeHTML(r.label)} — ${escapeHTML(r.title)}</option>`).join('');
  document.getElementById('material-choices').innerHTML = [['Reading',false],['Listening · TED Talks',true]].map(([label,ted])=>`<div role="group" aria-label="${label}"><h3>${label}</h3>${readings.filter(r=>r.id.startsWith('ted-')===ted).map(r=>`<button type="button" class="material-choice" data-material="${r.id}" aria-pressed="false"><span class="material-number">${escapeHTML(r.label.split(' · ')[0])}</span><span>${escapeHTML(r.title)}${ted?`<small>${escapeHTML(r.label.split(' · ').at(-1))}</small>`:''}</span><span class="material-check" aria-hidden="true">✓</span></button>`).join('')}</div>`).join('');
  readingList.innerHTML = readings.map(r => `<article class="study-block material-lesson" id="reading-${r.id}" data-stage="summary">
    <div class="reading-label">${escapeHTML(r.label)}</div><div class="reading-title"><h3>${escapeHTML(r.title)}</h3><span class="badge" data-reading-count="${r.id}"></span></div>
    <nav class="learning-path" aria-label="Этапы изучения материала">${[['summary','Саммари'],['cards','Карточки'],['retell','Пересказ']].map(([stage,label])=>`<button type="button" data-stage-button="${stage}" aria-pressed="${stage==='summary'}" aria-controls="${r.id}-${stage}">${label}</button>`).join('')}</nav>
    <section id="${r.id}-summary" data-stage-view="summary" aria-label="Саммари">
      <div class="lesson-heading"><span class="eyebrow">01 · Understand</span><h4>Весь материал по смысловым блокам</h4><p class="muted">Читай сверху вниз. В каждом блоке — детали для устного ответа, ниже — пояснение на русском.</p></div>
      <div class="summary-lead"><p lang="en">${escapeHTML(r.lead || r.summary)}</p></div>
      <p class="source-context">${escapeHTML(r.note)}</p>
      ${r.sections.map(s=>`<section class="summary-section"><h5 lang="en">${escapeHTML(s.title)}</h5>${summaryPoints(s)}<p class="summary-ru" lang="ru">${escapeHTML(s.ru)}</p></section>`).join('')}
      <div class="lesson-next"><p>Теперь закрой саммари и проверь, какие детали ты можешь вспомнить.</p><button type="button" class="action" data-stage-button="cards">Перейти к карточкам →</button></div>
    </section>
    <section id="${r.id}-cards" data-stage-view="cards" aria-label="Карточки по материалу" hidden>
    <div class="lesson-heading"><span class="eyebrow">02 · Recall</span><h4>Вспомни ответ до подсказки</h4><p class="muted">Ответь по-английски вслух, открой ответ и оцени себя. «Помню» означает, что ты вспомнил главное самостоятельно.</p></div>
    <label class="toggle"><input type="checkbox" data-reading-filter="${r.id}"> Только то, что нужно повторить</label>
    <div class="material-trainer" tabindex="-1" aria-label="Тренажёр вопросов">
      <p class="material-card-position" role="status"></p>
      ${r.questions.map((q,i)=>`<div class="material-question" data-question="${r.id}-${i}" data-reading="${r.id}" hidden><p class="material-prompt" lang="en">${escapeHTML(q[0])}</p><div class="answer" id="answer-${r.id}-${i}" hidden><span class="eyebrow">Опорный ответ</span><p lang="en">${escapeHTML(q[1])}</p>${q[2]?`<p class="muted">${escapeHTML(q[2])}</p>`:''}</div><div class="rating" role="group" aria-label="Самооценка ответа" hidden><button type="button" class="action" data-rate="1" data-key="${r.id}-${i}" aria-pressed="false">Повторить</button><button type="button" class="action" data-rate="2" data-key="${r.id}-${i}" aria-pressed="false">Помню</button></div></div>`).join('')}
      <div class="material-empty" hidden><h5>Все ответы отмечены «Помню»</h5><p>Сними фильтр для нового круга или попробуй связный пересказ.</p></div>
      <button type="button" class="action material-flip" aria-expanded="false" aria-keyshortcuts="Space">Показать ответ</button>
      <div class="material-card-controls"><button type="button" class="action" data-material-move="-1" aria-keyshortcuts="ArrowLeft">← Назад</button><span class="material-card-mark"></span><button type="button" class="action" data-material-move="1" aria-keyshortcuts="ArrowRight">Далее →</button></div>
    </div>
    <p class="material-shortcuts muted">Когда карточка в фокусе: пробел — ответ; ← → — листать; 1 — повторить, 2 — помню.</p>
    ${r.vocab.length?`<details class="reading-summary"><summary>Применить target vocabulary · ${r.vocab.length} заданий</summary><div class="detail-body"><p class="muted">Вспомни точное слово из списка курса по контексту.</p>${r.vocab.map(v=>`<div class="cloze question"><p lang="en">${escapeHTML(v[1])}</p><label class="write-label">Какое слово из target vocabulary подходит?<input type="text" class="cloze-input" autocomplete="off" data-answer="${escapeHTML(v[2])}" aria-label="Пропущенное слово"></label><button type="button" class="action check-cloze">Проверить</button><p class="cloze-result" role="status"></p><details><summary>Подсказка: значение</summary><p lang="en">${escapeHTML(cards[v[0]].explanation)}</p><p class="muted">${escapeHTML(cards[v[0]].translation)}</p></details><button type="button" class="action vocab-jump" data-card-id="${v[0]}">Карточка «${escapeHTML(cards[v[0]].word)}» ↗</button></div>`).join('')}</div></details>`:''}
    <div class="lesson-next"><p>Отдельные ответы уже получаются? Собери их в связный рассказ.</p><button type="button" class="action" data-stage-button="retell">Пересказать без подсказок →</button></div>
    </section>
    <section id="${r.id}-retell" data-stage-view="retell" aria-label="Пересказ по памяти" hidden>
      <div class="lesson-heading"><span class="eyebrow">03 · Explain</span><h4>Восстанови материал по памяти</h4><p>Расскажи по-английски: о чём материал, как автор объясняет идею, какие приводит примеры и цифры, к чему приходит. Саммари сейчас скрыт.</p></div>
      <p class="muted">Можно говорить вслух или записать ответ. Сначала попробуй без плана; затем открой вопросы, если потерял нить. Это самопроверка, автоматической оценки текста здесь нет.</p>
      <details class="reading-summary"><summary>Нужна опора: вопросы для пересказа</summary><div class="detail-body"><ol class="retell-cues" lang="en">${r.sections.map(s=>`<li>${escapeHTML(s.cue)}</li>`).join('')}</ol></div></details>
      <label class="write-label" for="retell-${r.id}">Мой пересказ · черновик сохраняется после входа</label><textarea id="retell-${r.id}" lang="en" maxlength="12000" rows="7" placeholder="The material focuses on…" data-study-field="retell-${r.id}"></textarea>
      <details class="retell-check reading-summary"><summary>Проверить полноту своего ответа</summary><div class="detail-body"><p class="muted">Сравни с тем, что сказал до открытия подсказки. Отметь блоки, которые смог объяснить с деталями. Пропущенные пункты повтори в карточках.</p>${r.sections.map((s,i)=>`<section class="retell-section"><label class="retell-check-label"><input type="checkbox" data-study-field="retell-${r.id}-${i}"><span lang="en">${escapeHTML(s.title)}</span></label>${summaryPoints(s)}</section>`).join('')}</div></details>
      <div class="lesson-next"><p>Позже вернись и попробуй ещё раз, начиная с карточек. Ориентир — самостоятельный ответ, а не узнавание подсказки.</p><button type="button" class="action" data-stage-button="cards">Вернуться к карточкам</button></div>
    </section>
    <p class="source-note"><a href="${escapeHTML(r.source)}" target="_blank" rel="noopener">${r.id.startsWith('ted-')?'Оригинал и транскрипт на TED ↗':'Материал курса ↗'}</a> · ${r.id.startsWith('ted-')?'Опорные ответы по транскрипту.':'Подсказки и упражнения по сохранённому тексту.'}</p></article>`).join('');
}
function materialPool(r) {
  const only = document.querySelector(`[data-reading-filter="${r.id}"]`).checked;
  return r.questions.map((_,i)=>i).filter(i=>!only || study[`${r.id}-${i}`] !== 2);
}
function paintMaterialCard(r) {
  const box = document.getElementById('reading-'+r.id), state = materialCards[r.id], pool = materialPool(r);
  if (!pool.includes(state.index)) {state.index = pool.find(i=>i>=state.index) ?? pool[0]; state.revealed = false;}
  const current = pool.length ? `${r.id}-${state.index}` : null;
  box.querySelectorAll('.material-question').forEach(q=>{
    q.hidden = q.dataset.question !== current;
    q.querySelector('.answer').hidden = !state.revealed || q.hidden;
    q.querySelector('.rating').hidden = !state.revealed || q.hidden;
  });
  box.querySelector('.material-card-position').textContent = pool.length ? `Карточка ${pool.indexOf(state.index)+1} из ${pool.length}` : 'Повторение завершено';
  box.querySelector('.material-empty').hidden = !!pool.length;
  const flip = box.querySelector('.material-flip');
  flip.hidden = !pool.length; flip.textContent = state.revealed ? 'Скрыть ответ' : 'Показать ответ';
  flip.setAttribute('aria-expanded', String(state.revealed));
  if (current) flip.setAttribute('aria-controls','answer-'+current); else flip.removeAttribute('aria-controls');
  box.querySelectorAll('[data-material-move]').forEach(b=>b.disabled = pool.length<2);
  box.querySelector('.material-card-mark').textContent = current ? ({1:'Повторить',2:'Помню'}[study[current]] || 'Без отметки') : '';
}
function moveMaterialCard(r, step) {
  const pool = materialPool(r), state = materialCards[r.id];
  if (!pool.length) return;
  state.index = pool[(pool.indexOf(state.index)+step+pool.length)%pool.length]; state.revealed = false;
  paintMaterialCard(r);
}
function openMaterialStage(article, stage) {
  article.dataset.stage = stage;
  article.querySelectorAll('[data-stage-view]').forEach(s=>s.hidden=s.dataset.stageView!==stage);
  article.querySelectorAll('.learning-path [data-stage-button]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.stageButton===stage)));
  const target = stage==='cards' ? article.querySelector('.material-trainer') : article.querySelector('.learning-path');
  target.focus({preventScroll:true});
  article.scrollIntoView({block:'start'});
}
function paintStudy(fields = false) {
  paintGrammar(fields);
  const picker = document.getElementById('reading-select');
  if (fields && readings.some(r=>r.id === study['reading-choice'])) picker.value=study['reading-choice'];
  const selected = readings.find(r=>r.id===picker.value);
  document.getElementById('material-current').textContent = selected.title;
  document.getElementById('material-current-label').textContent = `${selected.id.startsWith('ted-')?'Listening':'Reading'} · ${selected.label.split(' · ')[0]}`;
  root.querySelectorAll('[data-material]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.material===picker.value)));
  readings.forEach(r=>document.getElementById('reading-'+r.id).hidden=r.id !== picker.value);
  root.querySelectorAll('.cloze').forEach(box=>{
    const key='cloze-'+box.closest('article').id.replace('reading-','')+'-'+box.querySelector('[data-card-id]').dataset.cardId;
    const result=box.querySelector('.cloze-result');
    if (!result.textContent && study[key]) result.textContent=study[key]===2?'Ранее: слово вспомнил ✓':'Ранее: нужно повторить';
  });
  root.querySelectorAll('[data-rate]').forEach(b => b.setAttribute('aria-pressed', String(study[b.dataset.key] === Number(b.dataset.rate))));
  root.querySelectorAll('[data-reading-count]').forEach(el => {
    const r = readings.find(r => r.id === el.dataset.readingCount);
    const known = r.questions.filter((_,i)=>study[`${r.id}-${i}`] === 2).length;
    el.textContent = `${known} / ${r.questions.length}`;
    el.setAttribute('aria-label',`Помню ${known} из ${r.questions.length} ответов`);
    el.title = 'Ответы с твоей отметкой «Помню»';
  });
  readings.forEach(paintMaterialCard);
  if (fields) root.querySelectorAll('[data-study-field]').forEach(input => {
    if (input.type === 'checkbox') input.checked = study[input.dataset.studyField] === true;
    else input.value = study[input.dataset.studyField] || '';
  });
  const draft = document.getElementById('essay-draft').value.trim();
  document.getElementById('essay-count').textContent = `${draft ? draft.split(/\s+/u).length : 0} слов`;
}
function openPanel(name) {
  const allowed = ['vocabulary', 'grammar', 'reading', 'essay', 'talk'];
  if (!allowed.includes(name)) name = 'vocabulary';
  allowed.forEach(id=>document.getElementById('panel-'+id).hidden = id !== name);
  root.querySelectorAll('[data-panel]').forEach(b=>name === b.dataset.panel ? b.setAttribute('aria-current','page') : b.removeAttribute('aria-current'));
  history.replaceState(null, '', '#'+name);
}
renderReadings(); paintStudy();
document.getElementById('reading-select').onchange = e => {paintStudy(); if(signedIn) setStudy('reading-choice',e.target.value);};
root.querySelectorAll('[data-material]').forEach(b=>b.onclick=()=>{
  const picker=document.getElementById('reading-select');
  picker.value=b.dataset.material;picker.dispatchEvent(new Event('change'));
  document.getElementById('material-picker').open=false;
  document.querySelector('#material-picker>summary').focus();
});
document.getElementById('material-picker').addEventListener('keydown',e=>{if(e.key==='Escape'){e.currentTarget.open=false;e.currentTarget.querySelector('summary').focus();}});
root.querySelectorAll('[data-panel]').forEach(b=>b.onclick=()=>openPanel(b.dataset.panel));
openPanel(location.hash.slice(1));
root.querySelectorAll('[data-rate]').forEach(b=>b.onclick=()=>{
  const article=b.closest('article'), r=readings.find(r=>'reading-'+r.id===article.id), previous=materialCards[r.id].index;
  setStudy(b.dataset.key, Number(b.dataset.rate));
  if (materialCards[r.id].index!==previous) article.querySelector('.material-trainer').focus();
});
root.querySelectorAll('[data-reading-filter]').forEach(f=>f.onchange=()=>{
  materialCards[f.dataset.readingFilter].revealed=false; paintStudy();
});
readingList.querySelectorAll('[data-stage-button]').forEach(b=>b.onclick=()=>openMaterialStage(b.closest('article'),b.dataset.stageButton));
readings.forEach(r=>{
  const article=document.getElementById('reading-'+r.id);
  article.querySelector('.learning-path').tabIndex=-1;
  article.querySelector('.material-flip').onclick=()=>{materialCards[r.id].revealed=!materialCards[r.id].revealed;paintMaterialCard(r);};
  article.querySelectorAll('[data-material-move]').forEach(b=>b.onclick=()=>moveMaterialCard(r,Number(b.dataset.materialMove)));
  article.querySelector('.material-trainer').addEventListener('keydown',e=>{
    if (el('login').open || e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
    if (e.code==='Space' && e.target.tagName==='BUTTON') return;
    let button;
    if (e.code==='Space') button=article.querySelector('.material-flip');
    if (e.code==='ArrowLeft') button=article.querySelector('[data-material-move="-1"]');
    if (e.code==='ArrowRight') button=article.querySelector('[data-material-move="1"]');
    if (materialCards[r.id].revealed && ['Digit1','Digit2'].includes(e.code)) button=article.querySelector(`[data-question="${r.id}-${materialCards[r.id].index}"] [data-rate="${e.code==='Digit1'?1:2}"]`);
    if (button && !button.hidden) {e.preventDefault();button.click();}
  });
});
root.querySelectorAll('[data-study-field]').forEach(input=>input.addEventListener('input',()=>setStudy(input.dataset.studyField,input.type === 'checkbox' ? input.checked : input.value)));
root.querySelectorAll('.check-cloze').forEach(b=>b.onclick=()=>{
  const box=b.closest('.cloze'), input=box.querySelector('input');
  const correct=input.value.trim().toLowerCase() === input.dataset.answer.toLowerCase();
  box.querySelector('.cloze-result').textContent=correct ? 'Верно ✓' : `Подходящий ответ: ${input.dataset.answer}`;
  if (signedIn) setStudy('cloze-'+box.closest('article').id.replace('reading-','')+'-'+box.querySelector('[data-card-id]').dataset.cardId,correct?2:1);
});
root.querySelectorAll('.vocab-jump').forEach(b=>b.onclick=()=>{
  el('unit').value='all';el('only').checked=false;deck=[...cards];index=Number(b.dataset.cardId);flipped=false;openPanel('vocabulary');render();window.scrollTo({top:0,behavior:'smooth'});
});
document.getElementById('panel-vocabulary').inert = hosted;
if (hosted) loadAccount().catch(error => accountLabel(error.message === '401' ? 'Гость · прогресс сохраняется после входа' : 'Не удалось загрузить прогресс. Обнови страницу.')).finally(()=>document.getElementById('panel-vocabulary').inert=false);
else accountLabel('Сохранение доступно на tryko.site');

render(false);
})();
