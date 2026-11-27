/** Parse the legacy NJUST/Strongzhi timetable HTML without executing remote page scripts. */
const clean = (value = '') => decodeEntities(String(value)
  .replace(/<br\s*\/?\s*>/gi, '\n')
  .replace(/<\/(?:div|p|li|tr|td|th)\s*>/gi, '\n')
  .replace(/<[^>]+>/g, ' '))
  .replace(/[\u00a0\u3000]/g, ' ')
  .replace(/[ \t\f\v]+/g, ' ')
  .replace(/\r/g, '')
  .replace(/\n[ \t]+/g, '\n')
  .replace(/\n{2,}/g, '\n')
  .trim();

function decodeEntities(value) {
  return String(value)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}
function getAttr(tag, attr) {
  const escaped = attr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = tag.match(new RegExp(`\\b${escaped}\\s*=\\s*(["'])(.*?)\\1`, 'i'))
    || tag.match(new RegExp(`\\b${escaped}\\s*=\\s*([^\\s>]+)`, 'i'));
  return match ? decodeEntities(match[2] ?? match[1]) : '';
}
function tableInner(html, id) {
  const pattern = new RegExp(`<table\\b(?=[^>]*\\bid\\s*=\\s*["']${id}["'])[^>]*>([\\s\\S]*?)<\\/table\\s*>`, 'i');
  return html.match(pattern)?.[1] || '';
}
function rowsOf(html) { return [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)].map((m) => m[1]); }
function cellsOf(html) { return [...html.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]\s*>/gi)].map((m) => m[1]); }
function normalizeWeek(value) {
  return clean(value).replace(/[，、]/g, ',').replace(/\s+/g, '').replace(/\(周\)/g, '周').replace(/周周/g, '周');
}
function extractGridWeeks(html) {
  const table = tableInner(html, 'kbtable');
  const map = new Map();
  if (!table) return map;
  for (const row of rowsOf(table)) {
    const cells = cellsOf(row);
    for (const cell of cells) {
      const hidden = cell.match(/<input\b(?=[^>]*\bname\s*=\s*["']jx0415zbdiv_1["'])[^>]*>/i)?.[0]
        || cell.match(/<input\b[^>]*value\s*=\s*["'][^"']+-\d-1["'][^>]*>/i)?.[0] || '';
      const value = getAttr(hidden, 'value');
      const suffix = value.match(/-(\d)-1$/);
      const day = suffix ? Number(suffix[1]) : 0;
      if (!day) continue;
      const divMatch = cell.match(/<div\b(?=[^>]*\bclass\s*=\s*["'][^"']*\bkbcontent1\b[^"']*["'])[^>]*>([\s\S]*?)<\/div\s*>/i);
      if (!divMatch) continue;
      const segments = divMatch[1].split(/-{5,}/).map(clean).filter(Boolean);
      for (const segment of segments) {
        const lines = segment.split(/\n+/).map(clean).filter(Boolean);
        if (lines.length < 2) continue;
        const name = lines[0];
        const weekLine = lines.find((line) => /\(周\)/.test(line));
        if (!weekLine) continue;
        const match = weekLine.match(/([\d\s,，、~～至到-]+)\s*\(周\)/);
        if (!match) continue;
        const key = `${name}|${day}`;
        const list = map.get(key) || [];
        list.push(normalizeWeek(`${match[1]}周`));
        map.set(key, list);
      }
    }
  }
  return map;
}

/**
 * Returns { semester, title, sourceUrl, parser, courses }.
 * Each occurrence in the #dataList time column becomes one course slot.
 */
export function parseNjustTimetableHtml(html, sourceUrl = '') {
  const title = decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').trim();
  const semester = decodeEntities(html.match(/<select\b(?=[^>]*\bid\s*=\s*["']xnxq01id["'])[^>]*>[\s\S]*?<option\b[^>]*selected(?:\s*=\s*["'][^"']*["'])?[^>]*>([\s\S]*?)<\/option>/i)?.[1] || '').trim();
  const dataList = tableInner(html, 'dataList');
  if (!dataList) return { title, semester, sourceUrl, parser: 'njust-no-dataList', courses: [] };
  const rows = rowsOf(dataList);
  const headers = (rows[0] ? cellsOf(rows[0]) : []).map(clean);
  const find = (patterns) => headers.findIndex((h) => patterns.some((p) => p.test(h)));
  const nameI = find([/课程名称/, /课程名/]);
  const teacherI = find([/^教师$/, /任课教师/, /^老师$/]);
  const timeI = find([/^时间$/, /上课时间/, /节次/]);
  const roomI = find([/^地点$/, /上课地点/, /^教室$/]);
  if (nameI < 0 || timeI < 0) return { title, semester, sourceUrl, parser: 'njust-dataList-unrecognized', courses: [] };

  const gridWeeks = extractGridWeeks(html);
  const usedWeekIndex = new Map();
  const parsed = [];
  const dayNumber = (value) => ({ '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 7, '天': 7 }[value] || 0);
  const timePattern = /(?:星期|周)\s*([一二三四五六日天])\s*\(\s*(\d{1,2})\s*-\s*(\d{1,2})\s*小节\s*\)/g;

  for (let ri = 1; ri < rows.length; ri++) {
    const cells = cellsOf(rows[ri]);
    if (cells.length <= Math.max(nameI, timeI)) continue;
    const values = cells.map(clean);
    const name = values[nameI] || '';
    if (!name) continue;
    const teacher = teacherI >= 0 ? values[teacherI] || '未识别' : '未识别';
    const timeText = clean(cells[timeI] || '').replace(/\n{2,}/g, '\n');
    const roomText = roomI >= 0 ? values[roomI] || '' : '';
    const rooms = roomText.split(/[,，、]/).map(clean);
    const matches = [...timeText.matchAll(timePattern)];
    for (let slotIndex = 0; slotIndex < matches.length; slotIndex++) {
      const match = matches[slotIndex];
      const day = dayNumber(match[1]);
      const start = Number(match[2]);
      const end = Number(match[3]);
      if (!day || start < 1 || end < start || end > 16) continue;
      const room = rooms[slotIndex] || rooms.find(Boolean) || '未安排';
      const mapKey = `${name}|${day}`;
      const weekIndex = usedWeekIndex.get(mapKey) || 0;
      const weekList = gridWeeks.get(mapKey) || [];
      usedWeekIndex.set(mapKey, weekIndex + 1);
      const weeks = weekList[weekIndex] || (weekList.length === 1 ? weekList[0] : '周次需核对');
      parsed.push({
        id: `${name}-${day}-${start}-${end}-${slotIndex}-${ri}`,
        name, teacher, room, day, start, end, weeks,
      });
    }
  }
  const colorNames = ['blue', 'green', 'purple', 'orange', 'pink'];
  const seen = new Set();
  const courses = parsed.filter((c) => {
    const key = [c.name, c.teacher, c.room, c.day, c.start, c.end, c.weeks].join('|');
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).slice(0, 500).map((c, index) => ({ ...c, color: colorNames[index % colorNames.length] }));
  return { title, semester, sourceUrl, parser: 'njust-dataList', courses };
}

export function parseNjustLoginForm(html, currentUrl) {
  const forms = [...String(html).matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form\s*>/gi)];
  const candidate = forms.find((m) => /type\s*=\s*["']password["']/i.test(m[2])) || null;
  if (!candidate) return null;
  const action = getAttr(`<form ${candidate[1]}>`, 'action') || currentUrl;
  const method = (getAttr(`<form ${candidate[1]}>`, 'method') || 'post').toLowerCase();
  const inputs = [...candidate[2].matchAll(/<input\b[^>]*>/gi)].map((m) => {
    const tag = m[0];
    return { tag, name: getAttr(tag, 'name'), id: getAttr(tag, 'id'), type: (getAttr(tag, 'type') || 'text').toLowerCase(), value: getAttr(tag, 'value'), placeholder: getAttr(tag, 'placeholder') };
  }).filter((x) => x.name);
  const password = inputs.find((x) => x.type === 'password');
  const username = inputs.find((x) => x.type !== 'password' && /user|account|login|username|学号|账号/i.test(`${x.name} ${x.id} ${x.placeholder}`))
    || inputs.find((x) => x.type !== 'password' && !/captcha|verify|code|验证码/i.test(`${x.name} ${x.id} ${x.placeholder}`));
  const captcha = inputs.find((x) => /captcha|capcha|verify.?code|check.?code|验证码|validate.?code/i.test(`${x.name} ${x.id} ${x.placeholder}`));
  const hidden = Object.fromEntries(inputs.filter((x) => x.type === 'hidden').map((x) => [x.name, x.value]));
  const img = candidate[2].match(/<img\b(?=[^>]*(?:captcha|capcha|verify|验证码|validate)[^>]*)[^>]*>/i)?.[0]
    || String(html).match(/<img\b(?=[^>]*(?:captcha|capcha|verify|验证码|validate)[^>]*)[^>]*>/i)?.[0] || '';
  return {
    action: new URL(action, currentUrl).href,
    method: method === 'get' ? 'GET' : 'POST',
    usernameName: username?.name || '', passwordName: password?.name || '',
    captchaName: captcha?.name || '', hidden,
    captchaImageUrl: img ? new URL(getAttr(img, 'src'), currentUrl).href : '',
    formHtml: candidate[2],
  };
}
