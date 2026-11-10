// The game. Part 1: the rules (game.ts, run in Node): the memory curve, which characters are asked, in which order.
// Part 2: the screen in a browser with a clock the test moves: one shared game for every child (only the characters differ), the ring, time-out, tick / cross,
// the wrong ones come back, the end screen, saving, leaving, every screen size, languages.
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { start, checks } = require('./harness.cjs');
const { ok, done } = checks();
const OUT = process.env.D || 'tests/out/work/';
const ROOT = path.resolve(__dirname, '../..');
const C = (s) => Array.from(s);
const A1 = '假辣酸贫纺炒缸锅烛扇', A2 = '鼓旧富言忙桶炉锤泉溪', A3 = '波坡板炭镜锁帆筐犁耙';
const B3 = '春夏秋冬风雨雷电云雪', B2 = '山水火土木金日月田人';
const TODAY = '2026-11-10';

(async () => {
  // ================= part 1: the rules
  const G = await import(pathToFileURL(path.join(ROOT, 'src/game.ts')).href);
  const kid = { weeks: [{ start: '2026-10-25', chars: C(A1) }, { start: '2026-11-01', chars: C(A2) }, { start: '2026-11-08', chars: C(A3) }] };
  ok(JSON.stringify(G.INTERVALS) === '[0,1,3,7,14,30]' && G.REVIEW_MAX === 10 && G.MAX_ROUNDS === 4, 'the memory curve: 1, 3, 7, 14, 30 days; at most 10 review characters; at most 4 rounds');
  // the box of a character over the days
  let card = G.applyOutcome(undefined, true, false, '2026-11-10');
  ok(card.box === 1 && card.due === '2026-11-11' && card.right === 1, 'right at the first try: box 1, asked again tomorrow');
  card = G.applyOutcome(card, true, false, '2026-11-11'); ok(card.box === 2 && card.due === '2026-11-14', 'the next day right again: box 2, in 3 days');
  card = G.applyOutcome(card, true, false, '2026-11-14'); ok(card.box === 3 && card.due === '2026-11-21', 'box 3: in 7 days');
  card = G.applyOutcome(card, true, false, '2026-11-21'); ok(card.box === 4 && card.due === '2026-12-05', 'box 4: in 14 days');
  card = G.applyOutcome(card, true, false, '2026-12-05'); ok(card.box === 5 && card.due === '2027-01-04', 'box 5: in 30 days');
  card = G.applyOutcome(card, true, false, '2027-01-04'); ok(card.box === 5 && card.due === '2027-02-03', 'the top box stays the top box');
  const miss = G.applyOutcome(card, false, true, '2027-02-03');
  ok(miss.box === 0 && miss.due === '2027-02-04' && miss.wrong === 1, 'wrong: back to box 0; fixed later in the same session: asked again tomorrow');
  ok(G.applyOutcome(card, false, false, '2027-02-03').due === '2027-02-03', 'wrong and not fixed (the game was left): asked again today');
  const day = G.applyOutcome(undefined, true, false, '2026-11-10');
  ok(G.applyOutcome(day, true, false, '2026-11-10').box === 1, 'playing twice on the same day does not climb twice');
  ok(G.applyOutcome({ box: 0, due: '2026-11-10', last: '2026-11-10', right: 0, wrong: 1 }, true, false, '2026-11-10').box === 1, '(but a miss earlier today, put right now, does climb to box 1)');
  ok(G.starsFor(10, 10) === 3 && G.starsFor(9, 10) === 3 && G.starsFor(8, 10) === 2 && G.starsFor(6, 10) === 2 && G.starsFor(5, 10) === 1 && G.starsFor(0, 10) === 1 && G.starsFor(0, 0) === 0, 'stars: 3 from 90 %, 2 from 60 %, otherwise 1');
  // which week to play
  ok(G.gameWeek(kid, '2026-11-10') === '2026-11-08' && G.gameWeek(kid, '2026-11-03') === '2026-11-01' && G.gameWeek(kid, '2026-10-01') === null && G.gameWeek({ weeks: [] }, TODAY) === null, 'the week to play: the week of today; else the newest earlier week with characters; none = nothing to play');
  ok(G.gameWeek({ weeks: [{ start: '2026-11-08', chars: C(A3) }, { start: '2026-11-15', chars: C(A1) }] }, '2026-11-10') === '2026-11-08', 'a week prepared in the future is not played yet');
  // which earlier characters
  const cards = { [A1[0]]: { box: 0, due: '2026-11-09', right: 0, wrong: 1 }, [A2[0]]: { box: 0, due: '2026-11-10', right: 0, wrong: 1 }, [A1[1]]: { box: 3, due: '2026-11-05', right: 3, wrong: 0 }, [A1[2]]: { box: 1, due: '2026-11-11', right: 1, wrong: 0 } };
  const rv = G.pickReview(kid, { cards }, '2026-11-08', TODAY, 10, () => 0.5);
  ok(rv.length === 10 && rv[0].ch === A1[0] && rv[1].ch === A2[0] && rv[2].ch === A1[1], 'review: due characters first, the lowest box (the failed ones) first, then the most overdue: ' + rv.slice(0, 3).map((x) => x.ch).join(''));
  ok(!rv.some((x) => x.ch === A1[2]) && rv.slice(3).every((x) => x.week === '2026-11-01'), 'a character that is not due yet is not asked; then never-asked ones, the NEWEST week first');
  ok(rv.every((x) => x.review && x.week < '2026-11-08') && !rv.some((x) => A3.includes(x.ch)), 'only characters of EARLIER weeks are reviews (nothing from this week or later)');
  ok(G.pickReview(kid, { cards: {} }, '2026-11-08', TODAY, 4, () => 0.5).length === 4 && G.pickReview(kid, { cards: {} }, '2026-10-25', TODAY).length === 0, 'at most "max" of them; the first week has nothing to review');
  const q = G.buildQueue(C(A3), '2026-11-08', rv, () => 0.3);
  ok(q.length === 20 && C(A3).every((c) => q.filter((x) => x.ch === c).length === 1) && new Set(q.map((x) => x.ch)).size === 20, 'the queue: ALL 10 characters of the week + the 10 review ones, each once');
  const q2 = G.buildQueue(C(A3), '2026-11-08', rv, () => 0.9);
  ok(q.map((x) => x.ch).join('') !== q2.map((x) => x.ch).join('') && q.some((x, i) => x.ch !== [...C(A3), ...rv.map((r) => r.ch)][i]), 'and shuffled (this week and the review characters mixed, a different order each time)');
  const rs = G.applyResults({ cards: {}, plays: 2 }, [{ ch: '假', firstTry: true, fixed: false }, { ch: '辣', firstTry: false, fixed: true }], TODAY, { score: 1, total: 2 });
  ok(rs.cards['假'].box === 1 && rs.cards['辣'].box === 0 && rs.plays === 3 && rs.last.stars === 1 && rs.last.date === TODAY && G.applyResults(rs, [], TODAY).last.score === 1, 'a session\'s results: the cards, the number of plays, "last time" (kept when a later session is left early)');

  // ================= part 2: the screen
  const seed = ({ kids }) => ({ kids });
  const initSeed = ({ kids, review }) => {
    localStorage.setItem('learn.storage', 'local');
    localStorage.setItem('learn.local.kids.json', JSON.stringify({ kids: kids.map((k) => ({ id: k.id, name: k.name, color: k.color })), startWeek: '2026-10-25' }));
    for (const k of kids) { localStorage.setItem(`learn.local.kids/${k.id}.json`, JSON.stringify({ weeks: k.weeks })); if (review && review[k.id]) localStorage.setItem(`learn.local.kids/${k.id}.review.json`, JSON.stringify(review[k.id])); }
    const so = JSON.parse(localStorage.getItem('learn.settings.v1') || '{}'); if (so.__seconds) localStorage.setItem('learn.settings.v1', JSON.stringify(so));
  };
  const DORY = { id: 'kdory', name: 'Dory', color: '#f2545b', weeks: [{ start: '2026-10-25', chars: C(A1) }, { start: '2026-11-01', chars: C(A2) }, { start: '2026-11-08', chars: C(A3) }] };
  const LEO = { id: 'kleo', name: 'Leo', color: '#1c7ed6', weeks: [{ start: '2026-11-01', chars: C(B2) }, { start: '2026-11-08', chars: C(B3) }] };
  const open = async (opts = {}) => {
    const t = await start(new Map(), { noLogin: true, clock: TODAY + 'T10:00:00', viewport: opts.viewport || { width: 390, height: 844 }, locale: opts.locale, touch: opts.touch, init: initSeed, initArg: { kids: opts.kids || [DORY, LEO], review: opts.review } });
    await t.page.evaluate((s) => { if (s) { const o = JSON.parse(localStorage.getItem('learn.settings.v1') || '{}'); o.gameSeconds = s; localStorage.setItem('learn.settings.v1', JSON.stringify(o)); } }, opts.seconds);
    return t;
  };
  const toGame = async (page, id = 'kdory') => { await page.evaluate((i) => (location.hash = `#/kid/${i}/game`), id); await page.waitForSelector('#game-start, .lobby .empty'); };
  const st = (page) => page.evaluate(() => ({ end: !!document.querySelector('#game-end'), banner: !!document.querySelector('#game-banner.show'), ch: document.querySelector('#game-char')?.textContent || '', progress: document.querySelector('#game-progress')?.textContent, score: document.querySelector('#game-score')?.textContent, round: document.querySelector('#game-round')?.textContent }));
  /** plays: decide(ch, n, state) = true -> the tick, false -> the cross; the clock is moved past each answer */
  const play = async (page, decide, max = 200) => {
    const asked = [];
    for (let n = 0; n < max; n++) {
      const s = await st(page);
      if (s.end) return asked;
      if (s.banner || !s.ch) { await page.clock.runFor(1700); continue; }
      const right = decide(s.ch, asked.length, s);
      asked.push({ ch: s.ch, right, round: s.round });
      await page.click(right ? '#game-right' : '#game-wrong');
      await page.clock.runFor(right ? 700 : 1800);
    }
    throw new Error('the game did not end');
  };
  const rec = (page, id) => page.evaluate((i) => JSON.parse(localStorage.getItem(`learn.local.kids/${i}.review.json`) || 'null'), id);

  // --- the lobby
  let t = await open();
  await t.page.evaluate(() => (location.hash = '#/kid/kdory'));
  await t.page.waitForSelector('#tab-game');
  ok((await t.page.textContent('#tab-game')) === '游戏', 'the child\'s page has a "Game" tab next to "This week" and "Learned"');
  await t.page.evaluate(() => (location.hash = '#/')); await t.page.waitForSelector('.kid'); await t.page.click('.kid >> nth=0'); await t.page.waitForSelector('.weekbar');
  const order = await t.page.evaluate(() => ({ labels: [...document.querySelectorAll('.tabs button')].map((b) => b.textContent.replace(/\s*\d+$/, '')), on: document.querySelector('.tabs button.on')?.textContent }));
  ok(order.labels.join('|') === '游戏|本周|已入库' && order.on === '本周', 'the tabs are Game | This week | Recorded, and opening a child lands on the middle one (This week): ' + order.labels.join('|'));
  await t.page.click('#tab-game'); await t.page.waitForSelector('#game-start');
  const lob = await t.page.evaluate(() => { const r = (s) => document.querySelector(s)?.getBoundingClientRect(); const hero = r('.lobby-hero'), st = r('#game-start'); return { counts: !!document.querySelector('#game-counts'), last: !!document.querySelector('#game-last'), secs: !!document.querySelector('#game-secs'), small: !!document.querySelector('.lobby .small, .lobby .muted, .lobby .mini-h'), text: document.querySelector('.lobby').innerText.replace(/\s+/g, ' ').trim(), gap: st.top - hero.bottom, startBottom: st.bottom, vh: innerHeight }; });
  ok(!lob.counts && !lob.last && !lob.secs && !lob.small && lob.text === '准备好了吗？ 开始游戏', 'the lobby shows only "Ready?" and the start button (no counts, no countdown, no explanation): "' + lob.text + '"');
  ok(!(await t.page.locator('#game-start').isDisabled()) && lob.gap > lob.vh * 0.12, 'the start button sits well below the title, not right under it (gap ' + Math.round(lob.gap) + ' px)');
  await t.page.emulateMedia({ reducedMotion: 'no-preference' });
  const mid = await t.page.evaluate(() => { const r = (s) => document.querySelector(s).getBoundingClientRect(); const hero = r('.lobby-hero'), st = r('#game-start'), tabs = r('.tabs, .seg, [role=tablist]'); const top = tabs.bottom; const freeMid = (top + st.top) / 2; return { off: Math.abs((hero.top + hero.bottom) / 2 - freeMid), free: st.top - top, anim: getComputedStyle(document.querySelector('.lobby-hero .mascot')).animationName, h2: getComputedStyle(document.querySelector('.lobby-hero h2')).animationName }; });
  ok(mid.off < mid.free * 0.12, 'the mascot and "Ready?" sit in the middle of the free space between the tabs and the button (off by ' + Math.round(mid.off) + ' of ' + Math.round(mid.free) + ' px)');
  ok(mid.anim === 'duang' && mid.h2 === 'pop', 'the mascot bounces (duang) and the title pops in');
  await t.page.emulateMedia({ reducedMotion: 'reduce' });
  await t.page.evaluate(() => (location.hash = '#/settings')); await t.page.waitForSelector('#game-secs');
  ok((await t.page.getAttribute('#game-secs .on', 'data-sec')) === '5', 'the countdown (in Settings) is 5 seconds unless changed');
  await t.page.click('#game-secs [data-sec="8"]');
  ok(await t.page.evaluate(() => JSON.parse(localStorage.getItem('learn.settings.v1')).gameSeconds) === 8 && (await t.page.getAttribute('#game-secs .on', 'data-sec')) === '8', 'choosing 8 seconds is remembered');
  await t.page.click('#game-secs [data-sec="5"]');
  await t.page.evaluate(() => (location.hash = '#/kid/kdory/game')); await t.page.waitForSelector('#game-start');
  await t.page.screenshot({ path: OUT + 'game-lobby-ui.png' });

  // --- the game is the same for every child; only the characters differ
  await t.page.click('#game-start'); await t.page.waitForSelector('#game');
  const domA = await t.page.evaluate(() => [...document.querySelectorAll('#game *')].map((e) => e.id || e.className).filter((x) => typeof x === 'string' && x).sort().join(','));
  const sA = await st(t.page);
  ok(sA.progress === '1 / 20' && sA.score === '★ 0', 'Dory: 20 questions (10 of this week + 10 review), score 0');
  const askedA = await play(t.page, () => true);
  const setA = new Set(askedA.map((x) => x.ch));
  ok(askedA.length === 20 && setA.size === 20 && C(A3).every((c) => setA.has(c)), 'all 10 characters of this week are asked, once each, in the first round');
  ok([...setA].filter((c) => !A3.includes(c)).every((c) => (A1 + A2).includes(c)) && [...setA].filter((c) => !A3.includes(c)).length === 10, 'the other 10 are characters of the earlier weeks');
  ok(askedA.map((x) => x.ch).join('') !== A3 + A2, 'in a mixed (shuffled) order');
  await t.page.click('#game-done'); await t.page.waitForSelector('#game-start');
  await toGame(t.page, 'kleo');
  ok(!(await t.page.locator('#game-start').isDisabled()), 'Leo: his own lobby, ready to start');
  await t.page.click('#game-start'); await t.page.waitForSelector('#game');
  const domB = await t.page.evaluate(() => [...document.querySelectorAll('#game *')].map((e) => e.id || e.className).filter((x) => typeof x === 'string' && x).sort().join(','));
  const askedB = await play(t.page, () => true);
  const setB = new Set(askedB.map((x) => x.ch));
  ok(domA === domB, 'the SAME game screen for Leo (identical structure): one shared game, loaded with the selected child\'s characters');
  ok(askedB.length === 20 && C(B3).every((c) => setB.has(c)) && [...setB].every((c) => (B3 + B2).includes(c)) && ![...setB].some((c) => (A1 + A2 + A3).includes(c)), 'Leo is asked his own characters only, none of Dory\'s');
  const rA = await rec(t.page, 'kdory'), rB = await rec(t.page, 'kleo');
  ok(Object.keys(rA.cards).length === 20 && Object.keys(rA.cards).every((c) => (A1 + A2 + A3).includes(c)) && Object.keys(rB.cards).length === 20 && Object.keys(rB.cards).every((c) => (B3 + B2).includes(c)), 'each child\'s progress is saved under that child (kids/<id>.review.json), nothing crosses over');
  ok(rA.cards[A3[0]].box === 1 && rA.cards[A3[0]].due === '2026-11-11' && rA.plays === 1 && rA.last.score === 20 && rA.last.total === 20 && rA.last.stars === 3, 'Dory: right at the first try = box 1, again tomorrow; last time 20 / 20, 3 stars');
  await t.browser.close();

  // --- the ring, the time-out, the tick and the cross
  t = await open({ kids: [{ ...DORY, weeks: [{ start: '2026-11-08', chars: C('波坡板') }] }] });
  await toGame(t.page); await t.page.click('#game-start'); await t.page.waitForSelector('#game');
  const left = async () => Number(await t.page.getAttribute('#game-dial', 'data-left'));
  const off = () => t.page.$eval('#game .fg', (e) => parseFloat(e.style.strokeDashoffset));
  const circ = await t.page.$eval('#game .fg', (e) => parseFloat(e.style.strokeDasharray));
  ok(Math.abs((await left()) - 5000) < 200 && Math.abs((await off())) < 12, 'the ring is full at the start (5 s)');
  await t.page.clock.runFor(2500);
  ok(Math.abs((await left()) - 2500) < 200 && Math.abs((await off()) - circ / 2) < 15, 'after 2.5 s it is half gone (' + Math.round(await left()) + ' ms left)');
  ok((await t.page.textContent('#game-seconds')) === '3', 'the number on the ring counts down (3)');
  // a thin ring that burns away, its colour moving smoothly from green to red (sampled every half second)
  const rgb = (c) => (c.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number);
  const sample = async () => ({ hue: Number(await t.page.getAttribute('#game-dial', 'data-hue')), off: await off(), col: rgb(await t.page.$eval('#game .fg', (e) => getComputedStyle(e).stroke)) });
  const samples = [await sample()];
  for (let i = 0; i < 4; i++) { await t.page.clock.runFor(500); samples.push(await sample()); }     // 2.5 s ... 4.5 s
  ok(samples[0].hue >= 60 && samples[0].hue <= 70 && samples[0].col[0] > 150 && samples[0].col[1] > 150 && samples[0].col[2] < 90, 'halfway the ring is yellow (hue ' + samples[0].hue + ', rgb ' + samples[0].col.join(',') + ')');
  ok(samples.every((x, i) => i === 0 || (x.hue < samples[i - 1].hue && x.off > samples[i - 1].off)), 'the colour keeps moving towards red and the ring keeps getting shorter (hue ' + samples.map((x) => x.hue).join(' > ') + ')');
  ok(samples.every((x, i) => i === 0 || samples[i - 1].hue - x.hue <= 16), 'in small even steps: no jumps from one colour to the next');
  ok(samples[4].hue <= 14 && samples[4].col[0] > samples[4].col[1] * 2.2, 'in the last half second it is red (hue ' + samples[4].hue + ', rgb ' + samples[4].col.join(',') + ')');
  const geo = await t.page.evaluate(() => { const d = document.querySelector('#game-dial').getBoundingClientRect(); const b = document.querySelector('#game .gbox').getBoundingClientRect(); const c = document.querySelector('#game-char'); const r = c.getBoundingClientRect(); const fs = parseFloat(getComputedStyle(c).fontSize);
    return { dial: d.width, stroke: parseFloat(getComputedStyle(document.querySelector('#game .fg')).strokeWidth), circles: document.querySelectorAll('#game .gring circle').length, fs, boxR: b.width / 2, dx: Math.hypot(r.left + r.width / 2 - (b.left + b.width / 2), r.top + r.height / 2 - (b.top + b.height / 2)), corner: Math.hypot(r.width / 2, r.height / 2) }; });
  ok(geo.stroke / 100 <= 0.035 && geo.circles === 1, 'the ring is thin: ' + (geo.stroke).toFixed(1) + ' % of the board, and there is no thick track behind it');
  ok(geo.fs >= geo.dial * 0.55 && geo.corner + geo.dx <= geo.boxR * 0.99, 'the character is big (' + Math.round(geo.fs) + 'px on a ' + Math.round(geo.dial) + 'px board) and lies completely inside the round board');
  // no frame, no board: only a dashed cross that fades away towards the edges
  const sty = await t.page.evaluate(() => { const b = document.querySelector('#game .gbox'); const c = getComputedStyle(b), p = getComputedStyle(b, '::before'); return { border: c.borderTopWidth, shadow: c.boxShadow, bg: c.backgroundImage, radius: c.borderTopLeftRadius, mask: p.maskImage || p.webkitMaskImage, lines: p.backgroundImage, chOpacity: getComputedStyle(document.querySelector('#game-char')).opacity }; });
  ok(sty.border === '0px' && sty.shadow === 'none' && sty.bg === 'none', 'the board has no frame, no shadow and no background (' + sty.border + ', ' + sty.shadow + ')');
  ok(/radial-gradient/.test(sty.mask) && /gradient/.test(sty.lines) && sty.chOpacity === '1', 'the dashed cross is faded out by a mask towards the edge, the character itself is not');
  const hideStyle = await t.page.addStyleTag({ content: '#game-char { visibility: hidden !important; } #game .gsec { visibility: hidden; }' });   // (so that the character does not hide the lines in the measurement)
  const lumDiff = async (fromR, toR) => {
    const box = await t.page.$eval('#game .gbox', (e) => { const r = e.getBoundingClientRect(); return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, R: r.width / 2 }; });
    const y0 = Math.round(box.cy - toR * box.R), y1 = Math.round(box.cy - fromR * box.R), x0 = Math.round(box.cx - 3);
    const png = await t.page.screenshot({ clip: { x: x0, y: y0, width: 24, height: Math.max(4, y1 - y0) } });
    return t.page.evaluate(async (b64) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data; const lum = (x, y) => { const i = (y * c.width + x) * 4; return 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]; };
      let line = 0, ref = 0, n = 0; for (let y = 0; y < c.height; y++) { for (let x = 1; x <= 5; x++) { line += lum(x, y); n++; } for (let x = 16; x <= 20; x++) ref += lum(x, y); }
      return (ref - line) / n;
    }, png.toString('base64'));
  };
  const near = await lumDiff(0.10, 0.40), far = await lumDiff(0.82, 0.96);
  ok(near > 3 && far < near * 0.4, 'measured on a screenshot: the cross is clear near the middle (' + near.toFixed(1) + ') and almost gone near the edge (' + far.toFixed(1) + ')');
  await hideStyle.evaluate((e) => e.remove());
  await t.page.screenshot({ path: OUT + 'game-urgent.png' });
  await t.page.clock.runFor(600);
  ok(await t.page.locator('#game-flash.no').count() === 1 && await t.page.locator('#game-py.show').count() === 1 && (await t.page.textContent('#game-score')) === '★ 0', 'time is up: counted as wrong (red cross), the right pinyin is shown, no point');
  ok(await t.page.locator('#game-right').isDisabled() && await t.page.locator('#game-wrong').isDisabled(), 'while the answer is shown the two buttons are off');
  const behind = await t.page.evaluate(() => {
    const f = document.querySelector('#game-flash'), c = document.querySelector('#game-char'), py = document.querySelector('#game-py');
    const r = c.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const fs = getComputedStyle(f), cs = getComputedStyle(c), ps = getComputedStyle(py);
    const kids = [...f.parentElement.children]; const prs = py.getBoundingClientRect(), fr = f.getBoundingClientRect();
    return { op: parseFloat(fs.opacity), bg: fs.backgroundColor, chOp: cs.opacity, chVis: cs.visibility, pyVis: ps.visibility, pyOp: ps.opacity, topIsChar: !!top && (top === c || !!top.closest('.gbox')), order: kids.indexOf(f) < kids.indexOf(document.querySelector('#game .gbox')), svg: f.querySelector('svg path')?.getAttribute('stroke') };
  });
  ok(behind.order && behind.topIsChar && behind.op <= 0.3 && behind.op > 0.05 && (behind.bg === 'rgba(0, 0, 0, 0)' || behind.bg === 'transparent'), 'the big red cross is a faint picture BEHIND the character: painted before it, ' + Math.round(behind.op * 100) + ' % strong, no solid background, the character is on top of it');
  ok(behind.chOp === '1' && behind.chVis === 'visible' && behind.pyVis === 'visible' && behind.pyOp === '1' && behind.svg === '#e03131', 'the character and the pinyin are fully visible while the cross is shown (so it can be looked at again)');
  await t.page.screenshot({ path: OUT + 'game-timeout.png' });
  const first = (await st(t.page)).ch;
  await t.page.clock.runFor(1800);
  const s2 = await st(t.page);
  ok(s2.ch !== first && s2.progress === '2 / 3' && !(await t.page.locator('#game-py.show').count()), 'then the next character, and its pinyin is hidden again');
  await t.page.dblclick('#game-right');                                                  // a double press counts once
  await t.page.clock.runFor(700);
  const s3 = await st(t.page);
  ok(s3.score === '★ 1' && s3.progress === '3 / 3', 'the green tick: +1 point; pressing it twice quickly counts once');
  await t.page.click('#game-dial');
  ok(await t.page.locator('#game-py.show').count() === 1 && (await t.page.textContent('#game-py')) !== '', 'a tap on the character shows the pinyin for the grown-up (' + await t.page.textContent('#game-py') + ')');
  await t.page.click('#game-dial');
  ok(await t.page.locator('#game-py.show').count() === 0, 'and another tap hides it');
  await t.page.click('#game-right'); await t.page.clock.runFor(700);
  // the time-out one comes back
  ok((await st(t.page)).banner && (await t.page.textContent('#game-banner')).includes('再练一遍：1 个字'), 'after the round: "once more: 1 character" (the one that ran out of time)');
  await t.page.clock.runFor(1700);
  const s4 = await st(t.page);
  ok(s4.ch === first && s4.round === '再练一遍' && s4.progress === '1 / 1', 'and it is that very character, marked "once more"');
  await t.page.click('#game-right'); await t.page.clock.runFor(700);
  ok(await t.page.locator('#game-end').count() === 1 && (await t.page.textContent('#game-final')) === '2' && (await t.page.textContent('#game-end')).includes('/ 3'), 'put right in the second round: the game ends, 2 of 3 (the retry gives no point)');
  ok(await t.page.locator('.gstar.on').count() === 2 && (await t.page.textContent('.gmissed')).includes(first) && await t.page.locator('.gchip.open').count() === 0, '2 stars; the character that was wrong is listed (not as an open one: it was put right)');
  await t.page.screenshot({ path: OUT + 'game-end.png' });
  await t.page.waitForSelector('#toasts .toast:has-text("已记录这次练习")');
  const r1 = await rec(t.page, 'kdory');
  ok(r1.cards[first].box === 0 && r1.cards[first].due === '2026-11-11' && r1.cards[first].wrong === 1 && Object.values(r1.cards).filter((c) => c.box === 1).length === 2 && r1.last.score === 2 && r1.last.stars === 2, 'saved: the missed one in box 0 (again tomorrow), the two right ones in box 1; last time 2 / 3, 2 stars');
  // playing again on the same day
  await t.page.click('#game-again'); await t.page.waitForSelector('#game');
  await play(t.page, () => true);
  await t.page.waitForSelector('#toasts .toast:has-text("已记录这次练习")');
  const r2 = await rec(t.page, 'kdory');
  ok(r2.cards[first].box === 1 && Object.entries(r2.cards).filter(([c]) => c !== first).every(([, c]) => c.box === 1) && r2.plays === 2, 'a second game on the same day: the ones already in box 1 stay (no double climb), the one that was missed climbs to box 1');
  await t.browser.close();

  // --- the wrong ones come back until right, at most 4 rounds
  t = await open({ kids: [{ ...DORY, weeks: [{ start: '2026-11-08', chars: C('波') }] }] });
  await toGame(t.page); await t.page.click('#game-start'); await t.page.waitForSelector('#game');
  const never = await play(t.page, () => false);
  ok(never.length === 4 && never.map((x) => x.round).join() === ',再练一遍,再练一遍,再练一遍', 'a character that is always wrong is asked 4 times (the round and 3 more), then the game ends');
  ok((await t.page.textContent('#game-final')) === '0' && await t.page.locator('.gchip.open').count() === 1 && await t.page.locator('.gstar.on').count() === 1, 'score 0, 1 star, the character is shown as one that still needs practice');
  await t.page.waitForSelector('#toasts .toast:has-text("已记录这次练习")');
  const r3 = await rec(t.page, 'kdory');
  ok(r3.cards['波'].box === 0 && r3.cards['波'].due === TODAY && r3.cards['波'].wrong === 1, 'saved: box 0 and asked again TODAY (it was never put right)');
  await t.browser.close();

  // --- leaving
  t = await open({ kids: [{ ...DORY, weeks: [{ start: '2026-11-08', chars: C('波坡板炭') }] }] });
  await toGame(t.page); await t.page.click('#game-start'); await t.page.waitForSelector('#game');
  await t.page.click('#game-quit');
  ok((await t.page.textContent('dialog')).includes('还没有答题'), 'leaving: asks first (and says nothing has been answered yet)');
  await t.page.clock.runFor(8000);                                                       // the clock must stand still while the question is open
  await t.page.click('dialog button:has-text("取消")'); await t.page.waitForSelector('dialog', { state: 'detached' });
  ok(await t.page.locator('#game').count() === 1 && (await left()) > 4000 && (await st(t.page)).progress === '1 / 4', 'cancelling goes on with the same question and the time that was left (the clock stood still: ' + Math.round(await left()) + ' ms)');
  ok(await t.page.locator('#toasts .toast:has-text("已记录")').count() === 0, 'and says nothing');
  await t.page.click('#game-quit'); await t.page.click('dialog button.danger'); await t.page.waitForSelector('#game', { state: 'detached' });
  await t.page.waitForTimeout(300);
  ok(await rec(t.page, 'kdory') === null && await t.page.locator('#toasts .toast:has-text("已记录")').count() === 0, 'leaving with nothing answered: nothing is saved and nothing is said');
  await t.page.click('#game-start'); await t.page.waitForSelector('#game');
  await play(t.page, (c, n) => n === 0 ? true : n === 1 ? false : true, 0).catch(() => {});
  for (const right of [true, false]) { const s = await st(t.page); await t.page.click(right ? '#game-right' : '#game-wrong'); await t.page.clock.runFor(right ? 700 : 1800); }
  await t.page.click('#game-quit');
  ok((await t.page.textContent('dialog')).includes('已经答过的题会保存'), 'after 2 answers the question says what has been answered is saved');
  await t.page.click('dialog button.danger'); await t.page.waitForSelector('#game', { state: 'detached' });
  await t.page.waitForSelector('#toasts .toast:has-text("已记录这次练习")');
  const rl = await rec(t.page, 'kdory');
  ok(Object.keys(rl.cards).length === 2 && !rl.last, 'leaving early saves the 2 answered characters only, and no "last time" (the game was not finished)');
  ok(await t.page.locator('#tab-game.on').count() === 1, 'and you are back in the Game tab');
  // "last time" in the lobby
  await t.browser.close();

  // --- the review selection seen from the screen: characters that are not due are not asked
  const future = Object.fromEntries(C(A1).map((c) => [c, { box: 2, due: '2026-11-20', last: '2026-11-08', right: 2, wrong: 0 }]));
  t = await open({ kids: [DORY], review: { kdory: { cards: future, last: { date: '2026-11-09', score: 17, total: 20, stars: 2 }, plays: 1 } } });
  await toGame(t.page);
  await t.page.click('#game-start'); await t.page.waitForSelector('#game');
  const asked3 = await play(t.page, () => true);
  ok(!asked3.some((x) => A1.includes(x.ch)) && asked3.filter((x) => A2.includes(x.ch)).length === 10, 'characters that are not due yet are not asked');
  await t.browser.close();

  // --- nothing to play
  t = await open({ kids: [{ ...DORY, weeks: [] }] });
  await toGame(t.page);
  ok(await t.page.locator('.lobby .empty').count() === 1 && await t.page.locator('#game-start').isDisabled(), 'a child without characters: a message and a start button that is off');
  await t.browser.close();

  // --- deleting a child removes the game's progress
  t = await open({ kids: [DORY, LEO], review: { kdory: { cards: { 波: { box: 1, due: '2026-11-11', right: 1, wrong: 0 } } } } });
  await t.page.evaluate(() => (location.hash = '#/settings')); await t.page.waitForSelector('.kidrow');
  await t.page.click('.kidrow:has-text("Dory") .delete'); await t.page.click('dialog button.danger');
  await t.page.waitForSelector('#toasts .toast:has-text("已删除")');
  ok(await rec(t.page, 'kdory') === null, 'deleting a child also deletes the progress of the game');
  await t.browser.close();

  // --- every screen size: centred, big buttons, nothing on top of anything, all inside
  const DEVICES = { 'iphone-se': [375, 667], 'iphone-14': [390, 844], 'iphone-landscape': [844, 390], 'ipad-portrait': [820, 1180], 'ipad-landscape': [1180, 820], 'desktop-narrow': [577, 768], desktop: [1440, 900] };
  for (const [name, [w, h]] of Object.entries(DEVICES)) {
    t = await open({ viewport: { width: w, height: h }, touch: /ip/.test(name), kids: [{ ...DORY, weeks: [{ start: '2026-11-08', chars: C(A3) }] }] });
    await toGame(t.page); await t.page.click('#game-start'); await t.page.waitForSelector('#game');
    await t.page.click('#game-dial'); await t.page.clock.runFor(400);                    // the pinyin is shown (the tallest state)
    await t.page.addStyleTag({ content: '#game * { letter-spacing: .04em !important; }' });
    const m = await t.page.evaluate(() => {
      const R = (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
      return { vw: innerWidth, vh: innerHeight, dial: R('#game-dial'), py: R('#game-py'), no: R('#game-wrong'), yes: R('#game-right'), quit: R('#game-quit'), prog: R('#game-progress'), score: R('#game-score'), hint: R('.ghint'), sec: R('#game-seconds') };
    });
    const cx = (m.dial.l + m.dial.r) / 2 - m.vw / 2;
    ok(Math.abs(cx) <= 2 && Math.abs(m.dial.w - m.dial.h) <= 1, `${name}: the round board is exactly in the middle (off by ${cx.toFixed(1)}px) and round (${Math.round(m.dial.w)}px)`);
    ok(Math.abs(m.no.l - (m.vw - m.yes.r)) <= 2 && m.no.w >= 96 && m.yes.w >= 96, `${name}: the red cross and the green tick are big (${Math.round(m.no.w)}px) and equally far from the edges (${Math.round(m.no.l)} / ${Math.round(m.vw - m.yes.r)})`);
    const hit = (a, b) => a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1;
    const parts = { quit: m.quit, progress: m.prog, score: m.score, board: m.dial, pinyin: m.py, wrong: m.no, right: m.yes, hint: m.hint };
    const clash = []; for (const [a, ra] of Object.entries(parts)) for (const [b2, rb] of Object.entries(parts)) if (a < b2 && ra && rb && hit(ra, rb)) clash.push(a + '/' + b2);
    ok(clash.length === 0, `${name}: nothing lies on anything else` + (clash.length ? ' -> ' + clash.join(', ') : ''));
    ok(Object.values(parts).every((r) => r && r.l >= -0.5 && r.t >= -0.5 && r.r <= m.vw + 0.5 && r.b <= m.vh + 0.5), `${name}: everything is inside the screen`);
    await t.page.screenshot({ path: OUT + `game-${name}.png` });
    await t.browser.close();
  }

  // --- the lobby and the end screen fit, in the other languages, without Chinese UI text
  for (const [locale, startLabel, tab] of [['en-US', 'Start the game', 'Game'], ['fr-FR', 'Commencer le jeu', 'Jeu']]) {
    t = await open({ locale, kids: [{ ...DORY, weeks: [{ start: '2026-11-08', chars: C('波坡') }] }] });
    const cn = () => t.page.evaluate(() => { const bad = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); for (let n; (n = w.nextNode());) if (/[一-鿿]/.test(n.nodeValue) && !n.parentElement.closest('.user, .user-title, #toasts')) bad.push(n.nodeValue.trim()); for (const el of document.querySelectorAll('[title],[aria-label]')) for (const a of ['title', 'aria-label']) { const v = el.getAttribute(a); if (v && /[一-鿿]/.test(v) && !el.closest('.user,.user-title')) bad.push(a + ':' + v); } return bad; });
    await toGame(t.page);
    ok((await t.page.textContent('#tab-game')) === tab && (await t.page.textContent('#game-start')) === startLabel && (await cn()).length === 0, locale + ': the lobby is translated (' + tab + ' / ' + startLabel + ')' + JSON.stringify(await cn()));
    await t.page.click('#game-start'); await t.page.waitForSelector('#game');
    ok((await cn()).length === 0, locale + ': the game screen has no Chinese UI text' + JSON.stringify(await cn()));
    await play(t.page, (c, n) => n !== 0);
    ok((await cn()).length === 0 && (await t.page.textContent('#game-end')).length > 0, locale + ': the end screen has no Chinese UI text' + JSON.stringify(await cn()));
    await t.page.screenshot({ path: OUT + `game-end-${locale}.png` });
    await t.browser.close();
  }
  await done();
})();
