
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


const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const readingList = document.getElementById('reading-list');
function renderReadings() {
  document.getElementById('reading-select').innerHTML = readings.map(r=>`<option value="${r.id}">${escapeHTML(r.label)} — ${escapeHTML(r.title)}</option>`).join('');
  document.getElementById('material-choices').innerHTML = [['Reading',false],['Listening · TED Talks',true]].map(([label,ted])=>`<div role="group" aria-label="${label}"><h3>${label}</h3>${readings.filter(r=>r.id.startsWith('ted-')===ted).map(r=>`<button type="button" class="material-choice" data-material="${r.id}" aria-pressed="false"><span class="material-number">${escapeHTML(r.label.split(' · ')[0])}</span><span>${escapeHTML(r.title)}${ted?`<small>${escapeHTML(r.label.split(' · ').at(-1))}</small>`:''}</span><span class="material-check" aria-hidden="true">✓</span></button>`).join('')}</div>`).join('');
  readingList.innerHTML = readings.map(r => `<article class="study-block" id="reading-${r.id}">
    <div class="reading-label">${escapeHTML(r.label)}</div><div class="reading-title"><h3>${escapeHTML(r.title)}</h3><span class="badge" data-reading-count="${r.id}"></span></div>
    <details class="reading-summary"><summary>Главная мысль и опорные факты</summary><div class="detail-body"><p class="english" lang="en">${escapeHTML(r.summary)}</p><p class="muted">${escapeHTML(r.ru)}</p>${r.facts.length?`<ul>${r.facts.map(f=>`<li>${escapeHTML(f)}</li>`).join('')}</ul>`:''}</div></details>
    <label class="toggle"><input type="checkbox" data-reading-filter="${r.id}"> Только то, что нужно повторить</label>
    <p class="muted">${r.id.startsWith('ted-')?'Вопросы по транскрипту выступления.':'Вопросы по тексту.'} Сначала ответь вслух, потом проверь. Отметка «Помню» — твоя самооценка.</p>
    ${r.questions.map((q,i)=>`<div class="question" data-question="${r.id}-${i}" data-reading="${r.id}"><p lang="en">${escapeHTML(q[0])}</p><details><summary>Проверить ответ</summary><div class="answer"><p lang="en">${escapeHTML(q[1])}</p>${q[2]?`<p class="muted">${escapeHTML(q[2])}</p>`:''}</div></details><div class="rating" role="group" aria-label="Самооценка ответа"><button type="button" class="action" data-rate="1" data-key="${r.id}-${i}" aria-pressed="false">Повторить</button><button type="button" class="action" data-rate="2" data-key="${r.id}-${i}" aria-pressed="false">Помню</button></div></div>`).join('')}
    ${r.vocab.length?`<details class="reading-summary"><summary>Target vocabulary в контексте</summary><div class="detail-body">${r.vocab.map(v=>`<div class="cloze question"><p lang="en">${escapeHTML(v[1])}</p><label class="write-label">Какое слово из target vocabulary подходит?<input type="text" class="cloze-input" autocomplete="off" data-answer="${escapeHTML(v[2])}" aria-label="Пропущенное слово"></label><button type="button" class="action check-cloze">Проверить</button><p class="cloze-result" role="status"></p><details><summary>Подсказка: значение</summary><p lang="en">${escapeHTML(cards[v[0]].explanation)}</p><p class="muted">${escapeHTML(cards[v[0]].translation)}</p></details><button type="button" class="action vocab-jump" data-card-id="${v[0]}">Карточка «${escapeHTML(cards[v[0]].word)}» ↗</button></div>`).join('')}</div></details>`:''}
    <p class="source-note"><a href="${escapeHTML(r.source)}" target="_blank" rel="noopener">${r.id.startsWith('ted-')?'Оригинал и транскрипт на TED ↗':'Материал курса ↗'}</a> · ${r.id.startsWith('ted-')?'Опорные ответы по транскрипту.':'Подсказки и упражнения по сохранённому тексту.'}</p></article>`).join('');
}
function paintStudy(fields = false) {
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
    el.textContent = `${r.questions.filter((_,i)=>study[`${r.id}-${i}`] === 2).length} / ${r.questions.length}`;
  });
  root.querySelectorAll('[data-reading-filter]').forEach(filter => {
    root.querySelectorAll(`[data-reading="${filter.dataset.readingFilter}"]`).forEach(q => q.hidden = filter.checked && study[q.dataset.question] === 2);
  });
  if (fields) root.querySelectorAll('[data-study-field]').forEach(input => {
    if (input.type === 'checkbox') input.checked = study[input.dataset.studyField] === true;
    else input.value = study[input.dataset.studyField] || '';
  });
  const draft = document.getElementById('essay-draft').value.trim();
  document.getElementById('essay-count').textContent = `${draft ? draft.split(/\s+/u).length : 0} слов`;
}
function openPanel(name) {
  const allowed = ['vocabulary', 'reading', 'essay', 'talk'];
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
root.querySelectorAll('[data-rate]').forEach(b=>b.onclick=()=>setStudy(b.dataset.key, Number(b.dataset.rate)));
root.querySelectorAll('[data-reading-filter]').forEach(f=>f.onchange=()=>paintStudy());
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
