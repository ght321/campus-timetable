/**
 * Parser for the authenticated NJUST xsksap_list exam-results page.
 * Supports the mobile app's seven-column #dataList table and named-header fallbacks.
 * Only visible result-table cell text is processed; credentials, cookies and form values
 * are never read by this module.
 */
function decodeEntities(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, value) => String.fromCodePoint(Number(value)))
    .replace(/&#x([\da-f]+);/gi, (_, value) => String.fromCodePoint(parseInt(value, 16)));
}

function clean(value = '') {
  return decodeEntities(String(value)
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(?:div|p|li|tr|td|th)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[\u00a0\u3000]/g, ' ')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\r/g, '')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function rowsOf(html) {
  return [...String(html || '').matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)].map((match) => match[1]);
}

function cellsOf(html) {
  return [...String(html || '').matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]\s*>/gi)].map((match) => match[1]);
}

function tableInner(html, id) {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`<table\\b(?=[^>]*\\bid\\s*=\\s*["']${escaped}["'])[^>]*>([\\s\\S]*?)<\\/table\\s*>`, 'i');
  return String(html || '').match(pattern)?.[1] || '';
}

function parseDate(value) {
  const match = String(value || '').match(/(20\d{2})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?/);
  if (!match) return '';
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return '';
  return `${match[1]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseTime(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  const range = text.match(/\d{1,2}:\d{2}\s*[-~～至到—–]\s*\d{1,2}:\d{2}/);
  if (range) return range[0].replace(/\s+/g, '');
  const date = text.match(/(20\d{2})\s*[-/.年]\s*\d{1,2}\s*[-/.月]\s*\d{1,2}\s*日?/);
  return date ? text.slice(date.index + date[0].length).trim() || '时间待公布' : text || '时间待公布';
}

export function parseNjustExamHtml(html, sourceUrl = '') {
  const source = String(html || '');
  if (!source.trim()) return { sourceUrl, parser: 'njust-exam-empty', exams: [] };

  const dataList = tableInner(source, 'dataList');
  const tables = [...source.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table\s*>/gi)].map((match) => match[1]);
  const candidates = dataList ? [dataList] : tables;
  const tidy = (value) => clean(value).replace(/[\u00a0\u3000]/g, ' ').replace(/\s+/g, ' ').trim();
  let selected = null;

  for (const table of candidates) {
    const rows = rowsOf(table);
    if (rows.length < 2) continue;
    const headers = (rows[0] ? cellsOf(rows[0]) : []).map(tidy);
    const find = (patterns) => headers.findIndex((header) => patterns.some((pattern) => pattern.test(header)));
    const columns = {
      name: find([/考试名称/, /课程名称/, /科目名称/, /^考试科目$/, /^课程$/]),
      date: find([/考试日期/, /^日期$/, /考试时间/, /^时间$/]),
      room: find([/考试地点/, /考试教室/, /^地点$/, /^教室$/, /^考场$/]),
      level: find([/考试级别/, /考试类型/, /类别/, /等级/]),
      invigilator: find([/监考教师/, /监考人/]),
      examNumber: find([/考试场次/, /场次/, /考试编号/]),
      courseCode: find([/课程编号/, /课程代码/, /课程号/]),
      seat: find([/座位号/, /座号/, /座位/]),
    };
    const namedHeaders = columns.name >= 0 && (columns.date >= 0 || columns.room >= 0);
    const sevenColumnRows = rows.slice(1).some((row) => {
      const values = cellsOf(row).map(tidy);
      return values.length >= 7 && Boolean(parseDate(values[4]));
    });
    if (namedHeaders || sevenColumnRows) {
      selected = { rows, columns, namedHeaders };
      break;
    }
  }

  if (!selected) return { sourceUrl, parser: 'njust-exam-unrecognized', exams: [] };

  const exams = [];
  const seen = new Set();
  for (let rowIndex = 1; rowIndex < selected.rows.length; rowIndex++) {
    const values = cellsOf(selected.rows[rowIndex]).map(tidy);
    if (!values.length) continue;
    const sequence = values[0] || String(rowIndex);
    let examNumber = '';
    let courseCode = '';
    let name = '';
    let dateTime = '';
    let room = '';
    let seatNumber = '';
    let level = '';
    let invigilator = '';

    if (selected.namedHeaders) {
      const columns = selected.columns;
      name = values[columns.name] || '';
      dateTime = columns.date >= 0 ? values[columns.date] || '' : '';
      room = columns.room >= 0 ? values[columns.room] || '' : '';
      examNumber = columns.examNumber >= 0 ? values[columns.examNumber] || '' : '';
      courseCode = columns.courseCode >= 0 ? values[columns.courseCode] || '' : '';
      seatNumber = columns.seat >= 0 ? values[columns.seat] || '' : '';
      level = columns.level >= 0 ? values[columns.level] || '' : '';
      invigilator = columns.invigilator >= 0 ? values[columns.invigilator] || '' : '';
    } else {
      // The mobile app's confirmed NJUST #dataList order:
      // sequence | exam number | course code | course name | date/time | room | seat.
      [, examNumber, courseCode, name, dateTime, room, seatNumber] = values;
    }

    if (!name || /暂无|无考试|没有考试/.test(name)) continue;
    const date = parseDate(dateTime) || '日期待公布';
    const time = parseTime(dateTime);
    const uniqueKey = [examNumber, courseCode, name, date, time, room, seatNumber].join('|');
    if (seen.has(uniqueKey)) continue;
    seen.add(uniqueKey);
    const id = `njust-${examNumber || sequence || rowIndex}-${courseCode}-${date}`
      .replace(/[^\w\u4e00-\u9fff-]/g, '-')
      .slice(0, 220);
    exams.push({
      id,
      name: name.slice(0, 160),
      date,
      time,
      room: (room || '暂未安排').slice(0, 160),
      seatNumber: (seatNumber || '暂未安排').slice(0, 80),
      examNumber: examNumber.slice(0, 80),
      courseCode: courseCode.slice(0, 80),
      level: (level || '学校考试安排').slice(0, 80),
      invigilator: invigilator.slice(0, 120),
      source: 'school',
    });
  }

  exams.sort((left, right) => left.date.localeCompare(right.date) || left.time.localeCompare(right.time));
  return {
    sourceUrl,
    parser: exams.length ? 'njust-xsksap-list' : 'njust-exam-no-records',
    exams: exams.slice(0, 500),
  };
}
