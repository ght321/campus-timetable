import assert from 'node:assert/strict';
import { parseNjustTimetableHtml, parseNjustLoginForm } from './njust-parser.mjs';
import { parseNjustExamHtml } from './njust-exam-parser.mjs';

const html = `<!doctype html><html><head><title>学期理论课表</title></head><body>
<select id="xnxq01id"><option value="2026-2027-1" selected="selected">2026-2027-1</option></select>
<table id="kbtable"><tr><th>节次</th><th>星期一</th><th>星期二</th></tr>
<tr><th>第一大节</th><td><input type="hidden" name="jx0415zbdiv_1" value="aaa-1-1"><div class="kbcontent1">软件工程<br><font title='周次(节次)'>11-16(周)</font></div></td>
<td><input type="hidden" name="jx0415zbdiv_1" value="aaa-2-1"><div class="kbcontent1">计算机科学中的建模技术<br/><font title='周次(节次)'>4-5,8-12(周)</font><br/>----------------------<br/>计算机科学中的建模技术<br/><font title='周次(节次)'>13(周)</font></div></td></tr></table>
<table id="dataList"><tr><th>序号</th><th>课程号</th><th>课序号</th><th>课程名称</th><th>教师</th><th>时间</th><th>学分</th><th>地点</th><th>课程属性</th><th>选课阶段</th></tr>
<tr><td>1</td><td>06036001</td><td>0</td><td>计算机科学中的建模技术</td><td>王慧慧</td><td>星期二(06-07小节)<br/>星期二(06-07小节)</td><td>2</td><td>Ⅳ-A103,Ⅳ-A103</td><td>必修</td><td>预置</td></tr>
<tr><td>2</td><td>123</td><td>0</td><td>软件工程</td><td>李老师</td><td>星期一(01-02小节)</td><td>2</td><td>A101</td><td>必修</td><td>预置</td></tr>
<tr><td>3</td><td>36700002</td><td>8</td><td>形势与政策（Ⅶ）</td><td>张娜</td><td>星期四(14-14小节)</td><td>0.2</td><td>线上</td><td>必修</td><td>预置</td></tr></table></body></html>`;
const parsed = parseNjustTimetableHtml(html, 'https://bkjw.njust.edu.cn/njlgdx/xskb/xskb_list.do');
assert.equal(parsed.semester, '2026-2027-1');
assert.equal(parsed.courses.length, 4);
assert.equal(parsed.courses[0].day, 2);
assert.equal(parsed.courses[0].start, 6);
assert.equal(parsed.courses[0].end, 7);
assert.match(parsed.courses[0].weeks, /4-5,8-12/);
assert.match(parsed.courses[1].weeks, /13周/);
assert.equal(parsed.courses[2].room, 'A101');
assert.equal(parsed.courses[3].start, 14);
assert.equal(parsed.courses[3].end, 14);
assert.equal(parsed.courses[3].room, '线上');
const loginHtml = `<html><form id="fm1" action="/authserver/login?service=x" method="post"><input type="hidden" name="execution" value="e1s1"><input type="text" name="username"><input type="password" name="password"><input type="text" name="captchaResponse"><img src="/authserver/captcha.html" /></form></html>`;
const login = parseNjustLoginForm(loginHtml, 'https://ids.njust.edu.cn/authserver/login');
assert.equal(login.usernameName, 'username');
assert.equal(login.passwordName, 'password');
assert.equal(login.captchaName, 'captchaResponse');
assert.equal(login.action, 'https://ids.njust.edu.cn/authserver/login?service=x');
console.log('Parser smoke test passed:', parsed.courses.length, 'course slots; auth form parser passed.');


const examHtml = `<!doctype html><html><body>
<table id="dataList"><tr><th>序号</th><th>考试场次</th><th>课程编号</th><th>课程名称</th><th>考试时间</th><th>考场</th><th>座位号</th></tr>
<tr><td>1</td><td>2026-001</td><td>06036001</td><td>软件工程</td><td>2026-12-18 09:00-11:00</td><td>第四教学楼 A203</td><td>18</td></tr>
<tr><td>2</td><td>2026-002</td><td>06036002</td><td>数据结构</td><td>2026年12月20日 14:00-16:00</td><td>第二教学楼 302</td><td>07</td></tr>
</table></body></html>`;
const exams = parseNjustExamHtml(examHtml, 'https://bkjw.njust.edu.cn/njlgdx/xsks/xsksap_list');
assert.equal(exams.exams.length, 2);
assert.equal(exams.exams[0].name, '软件工程');
assert.equal(exams.exams[0].date, '2026-12-18');
assert.equal(exams.exams[0].time, '09:00-11:00');
assert.equal(exams.exams[0].room, '第四教学楼 A203');
assert.equal(exams.exams[0].seatNumber, '18');
assert.equal(exams.exams[1].date, '2026-12-20');
assert.equal(exams.exams[1].source, 'school');
console.log('Exam parser smoke test passed:', exams.exams.length, 'seven-column exam rows.');

const namedExamHtml = `<html><body><table><tr><th>课程名称</th><th>考试日期</th><th>考场</th><th>座位号</th><th>课程编号</th></tr>
<tr><td>高等数学</td><td>2026/12/22 08:30-10:30</td><td>第三教学楼 101</td><td>21</td><td>07001001</td></tr></table></body></html>`;
const namedExams = parseNjustExamHtml(namedExamHtml);
assert.equal(namedExams.exams.length, 1);
assert.equal(namedExams.exams[0].name, '高等数学');
assert.equal(namedExams.exams[0].date, '2026-12-22');
assert.equal(namedExams.exams[0].seatNumber, '21');
console.log('Exam parser named-header fallback passed:', namedExams.exams.length, 'exam row.');
