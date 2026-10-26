const API = 'http://127.0.0.1:3001';
const statusBox = document.getElementById('status');
const previewBox = document.getElementById('preview');
const listBox = document.getElementById('courseList');
const countBox = document.getElementById('count');
const scanButton = document.getElementById('scanButton');
const syncButton = document.getElementById('syncButton');
let scanResult = null;

function setStatus(message, kind = '') {
  statusBox.textContent = message;
  statusBox.className = `status ${kind}`.trim();
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) throw new Error('无法获取当前标签页。');
  const url = new URL(tab.url);
  if (!(url.hostname === 'njust.edu.cn' || url.hostname.endsWith('.njust.edu.cn'))) {
    throw new Error('为保护隐私，请先打开南京理工大学官方教务系统页面（网址应属于 njust.edu.cn），再点击扩展。');
  }
  return { tab, url };
}

// This function is injected into the active, user-selected school page after the user clicks Scan.
// It only inspects rendered DOM text and table/grid layout; it cannot read browser cookies or passwords.
function extractVisibleTimetable() {
  const dayPatterns = [
    [/星期\s*一|周\s*一|星期\s*1|周\s*1/, 1],
    [/星期\s*二|周\s*二|星期\s*2|周\s*2/, 2],
    [/星期\s*三|周\s*三|星期\s*3|周\s*3/, 3],
    [/星期\s*四|周\s*四|星期\s*4|周\s*4/, 4],
    [/星期\s*五|周\s*五|星期\s*5|周\s*5/, 5],
    [/星期\s*六|周\s*六|星期\s*6|周\s*6/, 6],
    [/星期\s*(?:日|天|7)|周\s*(?:日|天|7)/, 7],
  ];
  const clean = (value) => String(value || '').replace(/\u00a0/g, ' ').replace(/[\t\r]+/g, ' ').replace(/[ ]{2,}/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
  const getDay = (text) => {
    for (const [pattern, day] of dayPatterns) if (pattern.test(text)) return day;
    return null;
  };
  const getPeriod = (text) => {
    const patterns = [
      /(?:第\s*)?(\d{1,2})\s*[-—~～至到]\s*(\d{1,2})\s*(?:小节|节次|节|课时)/,
      /(?:第\s*)?(\d{1,2})\s*(?:小节|节次|节)/,
    ];
    for (let i = 0; i < patterns.length; i++) {
      const match = text.match(patterns[i]);
      if (match) {
        const start = Number(match[1]);
        const end = match[2] ? Number(match[2]) : start;
        if (start >= 1 && start <= 13 && end >= start && end <= 13) return { start, end };
      }
    }
    return null;
  };
  const getWeeks = (text) => {
    const normalized = clean(text).replace(/[–—~～至到]/g, '-');
    const match = normalized.match(/(?:第\s*)?(\d{1,2})\s*(?:周)?\s*-\s*(?:第\s*)?(\d{1,2})\s*周/);
    if (match) return `${Number(match[1])}-${Number(match[2])}周`;
    if (/单周/.test(normalized)) return '单周';
    if (/双周/.test(normalized)) return '双周';
    const singleWeeks = normalized.match(/(?:第\s*)?\d{1,2}\s*周(?:、|,|，\s*)/);
    if (singleWeeks) return singleWeeks[0].replace(/\s/g, '');
    return '周次未识别';
  };
  const pickValue = (value, labels) => {
    const text = clean(value);
    for (const label of labels) {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const match = text.match(new RegExp(`${escaped}\\s*[：:]\\s*([^\\n]+)`, 'i'));
      if (match) return clean(match[1]);
    }
    return '';
  };
  const looksLikeHeader = (text) => /课程名称|课程名|任课教师|上课地点|教室|上课时间|周次|课程性质|学分/.test(text);
  const isMetadata = (line) => /^(任课教师|教师|老师|上课地点|地点|教室|上课时间|时间|周次|上课周次|课程性质|学分|星期|周[一二三四五六日天])\s*[：:]?/.test(line) || /(?:星期|周[一二三四五六日天])/.test(line) || /\d{1,2}\s*[-—~至]\s*\d{1,2}\s*(?:周|节|小节)/.test(line);
  const guessName = (text) => {
    const labeled = pickValue(text, ['课程名称', '课程名', '课程']);
    if (labeled) return labeled;
    const lines = clean(text).split(/\n|\|/).map(clean).filter(Boolean);
    const candidate = lines.find((line) => !isMetadata(line) && !looksLikeHeader(line) && line.length >= 2 && line.length <= 90);
    return candidate || '';
  };
  const guessTeacher = (text) => {
    const labeled = pickValue(text, ['任课教师', '教师', '老师']);
    if (labeled) return labeled;
    const lines = clean(text).split(/\n|\|/).map(clean).filter(Boolean);
    // On many timetable cards the course title is the first line and the teacher is the next short Chinese-name line.
    return lines.slice(1).find((line) => /^[\u4e00-\u9fff·]{2,5}$/.test(line) && !isMetadata(line)) || '';
  };
  const guessRoom = (text) => {
    const labeled = pickValue(text, ['上课地点', '地点', '教室']);
    if (labeled) return labeled;
    const lines = clean(text).split(/\n|\|/).map(clean).filter(Boolean);
    return lines.find((line) => !isMetadata(line) && /(教室|教学楼|教\s*\d|[一二三四五六七八九十]教|楼|室|馆|场|中心|校区|[A-Z]{1,3}[-_]?[A-Z0-9]{2,})/i.test(line)) || '';
  };
  const makeSlotsFromText = (row, fallbackDay = null, fallbackPeriod = null, span = 1) => {
    const text = clean(row.text);
    const name = row.name || guessName(text);
    if (!name || name.length > 100 || /^(课程|教师|地点|时间|周次|学分)$/.test(name)) return [];
    const teacher = row.teacher || guessTeacher(text) || '未识别';
    const room = row.room || guessRoom(text) || '';
    const weeks = row.weeks || getWeeks(text);
    const slots = [];
    const dayRegex = /(?:星期|周)\s*(一|二|三|四|五|六|日|天|1|2|3|4|5|6|7)/g;
    const dayMap = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 7, '天': 7, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7 };
    const dayMatches = [...text.matchAll(dayRegex)];
    if (dayMatches.length) {
      for (let i = 0; i < dayMatches.length; i++) {
        const match = dayMatches[i];
        const endAt = i + 1 < dayMatches.length ? dayMatches[i + 1].index : text.length;
        const nearby = text.slice(match.index, endAt);
        const period = getPeriod(nearby) || fallbackPeriod;
        if (period) slots.push({ name, teacher, room: room || '', day: dayMap[match[1]], start: period.start, end: period.end, weeks });
      }
    } else {
      const period = getPeriod(text) || fallbackPeriod;
      if (fallbackDay && period) slots.push({ name, teacher, room: room || '', day: fallbackDay, start: period.start, end: period.end, weeks });
      else if (fallbackDay && fallbackPeriod) slots.push({ name, teacher, room: room || '', day: fallbackDay, start: fallbackPeriod.start, end: fallbackPeriod.end || (fallbackPeriod.start + Math.max(0, span - 1)), weeks });
    }
    return slots;
  };

  const allCourses = [];
  const seen = new Set();
  const add = (items) => {
    for (const item of items) {
      if (!item.name || !item.day || !item.start || !item.end || item.end < item.start) continue;
      const key = [item.name, item.teacher, item.room, item.day, item.start, item.end, item.weeks].join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      allCourses.push({ ...item, id: `scan-${allCourses.length + 1}`, color: ['blue', 'green', 'purple', 'orange', 'pink'][allCourses.length % 5] });
    }
  };

  // Mode A: course list tables whose headers include course, teacher, time, room and/or week fields.
  for (const table of document.querySelectorAll('table')) {
    const rows = [...table.querySelectorAll('tr')];
    if (rows.length < 2) continue;
    let headerIndex = -1;
    let headers = [];
    for (let r = 0; r < Math.min(rows.length, 5); r++) {
      const cells = [...rows[r].querySelectorAll(':scope > th, :scope > td')].map((cell) => clean(cell.innerText));
      const joined = cells.join(' ');
      if (/课程名称|课程名/.test(joined) && /教师|时间|地点|教室|周次/.test(joined)) {
        headerIndex = r; headers = cells; break;
      }
    }
    if (headerIndex >= 0) {
      const indexFor = (patterns) => headers.findIndex((h) => patterns.some((p) => p.test(h)));
      const nameIndex = indexFor([/课程名称|课程名|课程$/]);
      const teacherIndex = indexFor([/任课教师|教师|老师/]);
      const roomIndex = indexFor([/上课地点|地点|教室/]);
      const timeIndex = indexFor([/上课时间|时间|节次/]);
      const weeksIndex = indexFor([/上课周次|周次|教学周/]);
      for (let r = headerIndex + 1; r < rows.length; r++) {
        const cells = [...rows[r].querySelectorAll(':scope > th, :scope > td')];
        if (cells.length < 2) continue;
        const values = cells.map((cell) => clean(cell.innerText));
        const name = values[nameIndex] || guessName(values.join('\n'));
        if (!name || looksLikeHeader(name)) continue;
        const text = values.join('\n');
        const slotText = (timeIndex >= 0 ? values[timeIndex] : '') || text;
        const times = makeSlotsFromText({
          text: `${name}\n${text}`,
          name,
          teacher: teacherIndex >= 0 ? values[teacherIndex] : guessTeacher(text),
          room: roomIndex >= 0 ? values[roomIndex] : guessRoom(text),
          weeks: weeksIndex >= 0 && values[weeksIndex] ? getWeeks(values[weeksIndex]) : getWeeks(text),
        });
        if (slotText !== text && !times.length) add(makeSlotsFromText({ text: `${name}\n${slotText}`, name, teacher: values[teacherIndex] || '', room: values[roomIndex] || '', weeks: getWeeks(values[weeksIndex] || text) }));
        else add(times);
      }
    }

    // Mode B: timetable matrix tables with weekday headings across columns.
    for (let headerRow = 0; headerRow < Math.min(rows.length, 8); headerRow++) {
      const cells = [...rows[headerRow].querySelectorAll(':scope > th, :scope > td')];
      const dayColumns = cells.map((cell, index) => ({ index, day: getDay(clean(cell.innerText)) })).filter((v) => v.day);
      if (dayColumns.length < 3) continue;
      for (let r = headerRow + 1; r < rows.length; r++) {
        const rowCells = [...rows[r].querySelectorAll(':scope > th, :scope > td')];
        if (!rowCells.length) continue;
        let rowPeriod = null;
        const labelText = clean(rowCells[0].innerText);
        rowPeriod = getPeriod(labelText);
        if (!rowPeriod) {
          const n = Number(labelText.match(/^\s*(\d{1,2})\s*$/)?.[1]);
          if (n >= 1 && n <= 13) rowPeriod = { start: n, end: n };
        }
        for (const col of dayColumns) {
          const cell = rowCells[col.index];
          if (!cell) continue;
          const text = clean(cell.innerText);
          if (!text || text.length < 2 || looksLikeHeader(text)) continue;
          const rowSpan = Math.max(1, Number(cell.rowSpan) || 1);
          let period = rowPeriod;
          if (period && rowSpan > 1 && period.end === period.start) period = { start: period.start, end: Math.min(13, period.start + rowSpan - 1) };
          add(makeSlotsFromText({ text }, col.day, period, rowSpan));
        }
      }
      break;
    }
  }

  // Mode C: visible course blocks that print their own weekday and section, even outside tables.
  const candidates = [...document.querySelectorAll('body *')].filter((el) => {
    if (el.children.length > 6) return false;
    const text = clean(el.innerText);
    if (text.length < 5 || text.length > 180 || !/[\u4e00-\u9fff]{2,}/.test(text)) return false;
    if (!getDay(text) || !getPeriod(text)) return false;
    const rect = el.getBoundingClientRect();
    return rect.width >= 35 && rect.height >= 18 && rect.width < 650 && rect.height < 260 && rect.bottom > 0 && rect.right > 0;
  });
  for (const el of candidates) {
    const text = clean(el.innerText);
    const lines = text.split('\n').map(clean).filter(Boolean);
    // Prefer the smallest visible element; deduplication removes parent/child repeats.
    add(makeSlotsFromText({ text, name: guessName(text), teacher: guessTeacher(text), room: guessRoom(text), weeks: getWeeks(text) }));
  }

  const title = clean(document.title || '');
  const bodyText = clean(document.body?.innerText || '').slice(0, 600);
  return {
    title,
    url: location.origin + location.pathname,
    scannedAt: new Date().toISOString(),
    courses: allCourses,
    diagnostics: {
      tablesFound: document.querySelectorAll('table').length,
      rowsFound: document.querySelectorAll('tr').length,
      message: allCourses.length ? `已识别 ${allCourses.length} 条课程时段，请检查预览中的课程名、星期、节次和周次。` : '没有识别到课程时段。请打开完整的个人课表或课程课表查询页面；如果页面是日历网格且未标注节次，需要根据实际页面结构调整解析器。',
      pagePreview: bodyText,
    },
  };
}

function renderPreview() {
  listBox.replaceChildren();
  for (const course of (scanResult?.courses || []).slice(0, 40)) {
    const item = document.createElement('div');
    item.className = 'course-item';
    const title = document.createElement('div');
    title.className = 'course-name';
    title.textContent = course.name;
    const meta = document.createElement('div');
    meta.className = 'course-meta';
    meta.textContent = `周${['一','二','三','四','五','六','日'][course.day - 1]} · 第 ${course.start}-${course.end} 节 · ${course.weeks} · ${course.room || '地点未识别'}`;
    item.append(title, meta);
    listBox.append(item);
  }
  countBox.textContent = `${scanResult?.courses?.length || 0} 条`;
  previewBox.classList.remove('hidden');
  syncButton.disabled = !(scanResult?.courses?.length);
}

scanButton.addEventListener('click', async () => {
  scanButton.disabled = true;
  syncButton.disabled = true;
  setStatus('正在读取当前教务页面……');
  previewBox.classList.add('hidden');
  try {
    const { tab, url } = await activeTab();
    const results = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractVisibleTimetable });
    scanResult = results?.[0]?.result || null;
    if (!scanResult) throw new Error('读取页面失败。请确保已经登录，并停留在完整课表页面。');
    renderPreview();
    if (scanResult.courses.length) setStatus(scanResult.diagnostics.message, 'success');
    else setStatus(`${scanResult.diagnostics.message}\n页面标题：${scanResult.title}\n页面元素：${scanResult.diagnostics.tablesFound} 个表格、${scanResult.diagnostics.rowsFound} 行。`, 'error');
    scanResult.url = `${url.origin}${url.pathname}`;
  } catch (error) {
    scanResult = null;
    setStatus(error.message || String(error), 'error');
    previewBox.classList.add('hidden');
  } finally {
    scanButton.disabled = false;
  }
});

syncButton.addEventListener('click', async () => {
  if (!scanResult?.courses?.length) return;
  syncButton.disabled = true;
  setStatus('正在保存到本机课表服务……');
  try {
    const response = await fetch(`${API}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceUrl: scanResult.url,
        semester: '',
        courses: scanResult.courses,
      }),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.message || `同步失败（HTTP ${response.status}）`);
    setStatus(`${result.message}。课表网页会在 30 秒内自动刷新；也可以手动刷新网页。`, 'success');
  } catch (error) {
    setStatus(`无法连接本机同步服务：${error.message || error}。请确认 IDEA 的另一个终端正在运行 node server/index.mjs。`, 'error');
  } finally {
    syncButton.disabled = false;
  }
});

(async () => {
  try {
    const response = await fetch(`${API}/api/health`);
    if (response.ok) setStatus('本机同步服务已连接。请在另一个标签页打开已登录的官方个人课表，然后点击“读取当前页面并预览”。', 'success');
    else setStatus('本机同步服务未正常响应，请在 IDEA 终端启动 node server/index.mjs。', 'error');
  } catch {
    setStatus('尚未连接本机同步服务。请先在 IDEA 终端运行 node server/index.mjs。', 'error');
  }
})();
