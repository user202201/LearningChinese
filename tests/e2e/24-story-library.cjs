// The built-in story library (public/stories.json): simple idiom stories, at most 150 characters (punctuation counted), written only with characters of the
// everyday list (GB2312 level 1, 3755 characters: the closest list available offline to what primary-school children know). Settings can fill them into the idioms
// that have no story yet when the next week is picked; a story the user wrote is never replaced.
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
  ok(await page.locator('#story-lib, #fill-stories').count() === 0, 'Settings has no story-library card or fill button any more (the stories come along with the weekly random pick)');
  // the weekly random pick brings the story along: next week's idioms get their built-in story at once (without pressing anything)
  const t2 = await start(new Map(), { local: true, today: '2026-11-10' });
  await addKid(t2.page, 'Leo');
  const six = ['井底之蛙', '刻舟求剑', '守株待兔', '夜郎自大', '大公无私', '见义勇为'];
  await t2.page.evaluate((six) => localStorage.setItem('learn.local.idioms.json', JSON.stringify({ weeks: [{ start: '2026-11-01', items: ['对牛弹琴'] }], pool: ['对牛弹琴', ...six], stories: { } })), six);
  await t2.page.reload(); await t2.page.waitForSelector('#toasts .toast:has-text("随机选好")');
  await t2.page.waitForTimeout(300);
  const ps = await t2.page.evaluate(() => JSON.parse(localStorage.getItem('learn.local.idioms.json')));
  const nxt = ps.weeks.find((w) => w.start === '2026-11-15');
  ok(nxt && nxt.items.length === 6 && nxt.items.every((x) => ps.stories[x] === lib[x]) && !ps.stories['对牛弹琴'], 'next week\'s six random idioms come with their built-in story right away (no button needed); an idiom that was not picked this time (对牛弹琴, learned earlier) gets nothing by itself');
  await t2.browser.close();
  await done(browser);
})();
