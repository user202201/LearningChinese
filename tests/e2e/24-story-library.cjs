// The built-in story library (public/stories.json): simple idiom stories, at most 150 characters (punctuation counted), written only with characters of the
// everyday list (GB2312 level 1, 3755 characters: the closest list available offline to what primary-school children know). Settings can fill them into the idioms
// that have no story yet; a story the user wrote is never replaced.
const fs = require('fs');
const path = require('path');
const { start, checks, addKid, openSettings } = require('./harness.cjs');
const { ok, done } = checks();
const lib = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../public/stories.json'), 'utf8')).stories;
const dec = new TextDecoder('gb2312');
const level1 = new Set(); for (let hi = 0xb0; hi <= 0xd7; hi++) for (let lo = 0xa1; lo <= 0xfe; lo++) { const c = dec.decode(new Uint8Array([hi, lo])); if (c.length === 1 && /[一-鿿]/.test(c)) level1.add(c); }
const SHOWN = ['对牛弹琴', '指鹿为马', '井底之蛙', '刻舟求剑', '守株待兔', '尊老爱幼', '知错就改', '夜郎自大', '大公无私', '见义勇为', '助人为乐', '笨鸟先飞', '日积月累', '百密一疏', '自强不息', '百折不挠', '再接再厉', '兴高采烈', '招财进宝', '财源广进', '年年有余', '心想事成', '万事如意'];
const store = (page, key) => page.evaluate((k) => JSON.parse(localStorage.getItem('learn.local.' + k) || 'null'), key);
(async () => {
  const names = Object.keys(lib);
  ok(SHOWN.every((x) => lib[x]) && names.length >= SHOWN.length, 'the library has a story for each of the idioms on the sheet shown so far (' + names.length + ' stories)');
  ok(names.every((k) => lib[k].length <= 150 && lib[k].length >= 60), 'every story is at most 150 characters, punctuation counted (longest ' + Math.max(...names.map((k) => lib[k].length)) + ', shortest ' + Math.min(...names.map((k) => lib[k].length)) + ')');
  const outside = names.flatMap((k) => [...lib[k]].filter((c) => /[一-鿿]/.test(c) && !level1.has(c)).map((c) => k + ':' + c));
  ok(outside.length === 0 && level1.size === 3755, 'only characters of the everyday list (3755 characters of GB2312 level 1) are used' + (outside.length ? ' - outside: ' + outside.join(' ') : ''));
  ok(names.every((k) => !/[a-zA-Z0-9]/.test(lib[k]) && /[。！]$/.test(lib[k]) && !/\n/.test(lib[k])), 'plain text: no Latin letters or digits, one paragraph, ends with a full stop');

  const { browser, page } = await start(new Map(), { local: true, today: '2026-11-10' });
  await addKid(page, 'Dory');
  await page.evaluate(() => localStorage.setItem('learn.local.idioms.json', JSON.stringify({ weeks: [{ start: '2026-11-08', items: ['对牛弹琴', '指鹿为马', '自编成语'] }, { start: '2026-11-15', items: ['井底之蛙', '刻舟求剑', '守株待兔', '没有故事的成语', '乙一乙一', '丙二丙二'] }], pool: ['井底之蛙', '刻舟求剑', '守株待兔', '没有故事的成语', '自编成语', '乙一乙一', '丙二丙二'], stories: { 指鹿为马: '我自己写的故事。' } })));
  await openSettings(page);
  ok((await page.textContent('#story-lib h3')) === '成语故事库' && (await page.textContent('#fill-stories')) === '把自带的故事填进成语', 'Settings has an "idiom story library" card with a button');
  await page.click('#fill-stories');
  await page.waitForSelector('#toasts .toast:has-text("已填入")');
  const s = await store(page, 'idioms.json');
  ok((await page.textContent('#toasts')).includes('已填入 4 个成语故事') && s.stories['对牛弹琴'] === lib['对牛弹琴'] && s.stories['井底之蛙'] === lib['井底之蛙'] && s.stories['刻舟求剑'] === lib['刻舟求剑'] && s.stories['守株待兔'] === lib['守株待兔'], 'the idioms of the app (in a week or in the library) that have no story get the built-in one: "4 idiom stories filled in"');
  ok(s.stories['指鹿为马'] === '我自己写的故事。', 'a story the user wrote is never replaced');
  ok(!('没有故事的成语' in s.stories) && !('自编成语' in s.stories) && !('夜郎自大' in s.stories) && Object.keys(s.stories).length === 5, 'idioms the app does not have get nothing (no story is added for the 18 others of the library), idioms without a built-in story stay without');
  ok(s.weeks.length === 2 && s.weeks[0].items.join() === '对牛弹琴,指鹿为马,自编成语' && s.weeks[1].items.length === 6 && s.pool.length === 7, 'weeks and library are untouched');
  await page.waitForSelector('#toasts .toast', { state: 'detached' }).catch(() => {});
  await page.click('#fill-stories'); await page.waitForSelector('#toasts .toast:has-text("没有需要填的故事")');
  ok(JSON.stringify(await store(page, 'idioms.json')) === JSON.stringify(s), 'pressing it again changes nothing and says so');
  // the printout and the story page use them
  await page.evaluate(() => (location.hash = '#/')); await page.waitForSelector('.kid');
  await page.evaluate(() => (location.hash = '#/idiom/' + encodeURIComponent('对牛弹琴'))); await page.waitForSelector('#idiom-story');
  ok((await page.textContent('#idiom-story')) === lib['对牛弹琴'], 'the story page shows the built-in story');
  for (const [loc, title, btn, msg] of [['en', 'Idiom story library', 'Fill in the built-in stories', 'No story needs to be filled in'], ['fr', "Bibliothèque d'histoires de chengyu", 'Remplir avec les histoires intégrées', 'Aucune histoire à ajouter']]) {
    await page.evaluate((l) => { const x = JSON.parse(localStorage.getItem('learn.settings.v1') || '{}'); x.lang = l; localStorage.setItem('learn.settings.v1', JSON.stringify(x)); }, loc);
    await page.reload(); await openSettings(page);
    const bad = await page.evaluate(() => /[一-鿿]/.test(document.querySelector('#story-lib').textContent));
    await page.click('#fill-stories'); await page.waitForSelector(`#toasts .toast:has-text("${msg}")`);
    ok((await page.textContent('#story-lib h3')) === title && (await page.textContent('#fill-stories')) === btn && !bad, loc + ': the card, the button and the message are translated');
  }
  await done(browser);
})();
