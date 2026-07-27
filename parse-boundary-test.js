// 금액·날짜 파싱 경계값 테스트 (건별_v5.0.html 함수 추출 실행)
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const htmlPath = path.join(__dirname, '건별_v5.0.html');
const html = fs.readFileSync(htmlPath, 'utf8');

const extractConstFn = (name) => {
  const start = html.indexOf(`const ${name} = `);
  if (start < 0) throw new Error(`함수를 찾을 수 없음: ${name}`);
  let i = html.indexOf('{', start);
  if (i < 0) throw new Error(`본문 시작 없음: ${name}`);
  let depth = 0;
  for (; i < html.length; i += 1) {
    const ch = html[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        // include trailing semicolon if present
        let end = i + 1;
        if (html[end] === ';') end += 1;
        return html.slice(start, end);
      }
    }
  }
  throw new Error(`본문 끝 없음: ${name}`);
};

const sandbox = {};
vm.createContext(sandbox);
const bundle = [
  extractConstFn('expandTwoDigitYear'),
  extractConstFn('makeValidDate'),
  extractConstFn('detectDateOrder'),
  extractConstFn('filterByModeYear'),
  extractConstFn('parseDate'),
  extractConstFn('parseAmount'),
  '({ expandTwoDigitYear, makeValidDate, detectDateOrder, filterByModeYear, parseDate, parseAmount })',
].join('\n');
const { parseDate, parseAmount, detectDateOrder, filterByModeYear } = vm.runInContext(bundle, sandbox);

let passed = 0;
let failed = 0;
const failures = [];

const ymd = (d) => {
  if (!d) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const assertEq = (label, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    failures.push({ label, actual, expected });
    console.log(`  FAIL  ${label}`);
    console.log(`        expected=${e} actual=${a}`);
  }
};

console.log('=== parseDate 경계값 ===');
// 기존 포맷
assertEq('YYYY.MM.DD', ymd(parseDate('2024.01.05')), '2024-01-05');
assertEq('YYYY-MM-DD', ymd(parseDate('2024-01-05')), '2024-01-05');
assertEq('YYYY/MM/DD', ymd(parseDate('2024/1/5')), '2024-01-05');
assertEq('YYYYMMDD', ymd(parseDate('20240105')), '2024-01-05');
// 이슈 대상 텍스트 포맷
assertEq('M/D/Y 1/5/2024', ymd(parseDate('1/5/2024')), '2024-01-05');
assertEq('M/D/Y 12/31/2024', ymd(parseDate('12/31/2024')), '2024-12-31');
assertEq('D/M/Y 25/1/2024', ymd(parseDate('25/1/2024', 'DMY')), '2024-01-25');
assertEq('D/M/Y 1/12/2024', ymd(parseDate('1/12/2024', 'DMY')), '2024-12-01');
assertEq('M/D/Y 1/12/2024', ymd(parseDate('1/12/2024', 'MDY')), '2024-01-12');
assertEq('YY.MM.DD 24.01.05', ymd(parseDate('24.01.05')), '2024-01-05');
assertEq('YY/MM/DD 24/01/05', ymd(parseDate('24/01/05')), '2024-01-05');
assertEq('2자리 연도 69→2069', ymd(parseDate('69.12.31')), '2069-12-31');
assertEq('2자리 연도 70→1970', ymd(parseDate('70.01.01')), '1970-01-01');
assertEq('한글 2024년 1월 5일', ymd(parseDate('2024년 1월 5일')), '2024-01-05');
assertEq('한글 공백 변형', ymd(parseDate('2024년1월5일')), '2024-01-05');
// Date / 일련번호 / 무효
assertEq('Date 객체', ymd(parseDate(new Date(2024, 0, 5))), '2024-01-05');
assertEq('빈 문자열', parseDate(''), null);
assertEq('무효 텍스트', parseDate('not-a-date'), null);
assertEq('무효 일자 2/30', parseDate('2/30/2024'), null);
assertEq('무효 2024.13.01', parseDate('2024.13.01'), null);

console.log('=== detectDateOrder 경계값 ===');
assertEq('빈 배열 → MDY', detectDateOrder([]), 'MDY');
assertEq('전부 ≤12 → MDY', detectDateOrder(['1/5/2024', '12/31/2024', '6/15/2024']), 'MDY');
assertEq('첫 숫자 13 → DMY', detectDateOrder(['1/5/2024', '13/1/2024']), 'DMY');
assertEq('첫 숫자 25 → DMY', detectDateOrder(['25/12/2024']), 'DMY');
assertEq('첫 숫자 31 경계 → DMY', detectDateOrder(['31/1/2024', '2/1/2024']), 'DMY');
assertEq('첫 숫자 12 경계 → MDY', detectDateOrder(['12/1/2024', '1/12/2024']), 'MDY');
assertEq('YYYY-MM-DD만 → MDY', detectDateOrder(['2024-01-05', '2024-12-31']), 'MDY');
assertEq('Date 객체 무시 → MDY', detectDateOrder([new Date(2024, 0, 5), '5/1/2024']), 'MDY');
assertEq('혼합 중 하루>12 → DMY', detectDateOrder(['2024.01.05', '5/1/2024', '20/3/2024']), 'DMY');

console.log('=== filterByModeYear 경계값 ===');
const item = (y, m, d) => ({ d: new Date(y, m - 1, d), o: 0, n: 0 });
const mixedYears = [
  item(2024, 1, 5), item(2024, 5, 10), item(2024, 12, 1),
  item(2001, 5, 24), item(1999, 1, 15),
];
const fy = filterByModeYear(mixedYears);
assertEq('최빈 연도 2024', fy.modeYear, 2024);
assertEq('다른 연도 2건 제외', fy.excludedCount, 2);
assertEq('남은 건수 3', fy.list.length, 3);
assertEq('남은 연도 모두 2024', fy.list.every((i) => i.d.getFullYear() === 2024), true);
const singleYear = [item(2024, 3, 1), item(2024, 6, 1)];
const fy1 = filterByModeYear(singleYear);
assertEq('단일 연도 제외 0', fy1.excludedCount, 0);
assertEq('단일 연도 모드 2024', fy1.modeYear, 2024);
assertEq('빈 목록', filterByModeYear([]).excludedCount, 0);
const typoYears = [item(2024, 1, 5), item(2024, 2, 1), item(2024, 3, 1), item(1989, 12, 25)];
const fyTypo = filterByModeYear(typoYears);
assertEq('오타 연도 제외 1', fyTypo.excludedCount, 1);
assertEq('오타 제외 후 모드 2024', fyTypo.modeYear, 2024);

console.log('=== parseAmount 경계값 ===');
assertEq('숫자 그대로', parseAmount(1000), { ok: true, value: 1000 });
assertEq('콤마 1,000', parseAmount('1,000'), { ok: true, value: 1000 });
assertEq('통화 ₩1,000', parseAmount('₩1,000'), { ok: true, value: 1000 });
assertEq('통화 공백 ₩ 1,000', parseAmount('₩ 1,000'), { ok: true, value: 1000 });
assertEq('회계 음수 (1,000)', parseAmount('(1,000)'), { ok: true, value: -1000 });
assertEq('회계 음수+통화 (₩1,000)', parseAmount('(₩1,000)'), { ok: true, value: -1000 });
assertEq('선행 부호 -1,000', parseAmount('-1,000'), { ok: true, value: -1000 });
assertEq('선행 부호 +500', parseAmount('+500'), { ok: true, value: 500 });
assertEq('빈 문자열 → 0', parseAmount(''), { ok: true, value: 0 });
assertEq('null → 0', parseAmount(null), { ok: true, value: 0 });
assertEq('실패 텍스트 abc', parseAmount('abc'), { ok: false, value: 0 });
assertEq('실패 ₩만', parseAmount('₩'), { ok: false, value: 0 });
assertEq('소수 1,234.5', parseAmount('1,234.5'), { ok: true, value: 1234.5 });
assertEq('NaN number', parseAmount(NaN), { ok: false, value: 0 });

// 제외율 계산 헬퍼 (로그 조건과 동일 임계)
const exclusionRate = (invalid, total) => (total > 0 ? invalid / total : 0);
const shouldWarnExclude = (invalid, total) => exclusionRate(invalid, total) > 0.2;
console.log('=== 제외율 경고 임계 ===');
assertEq('제외 0/10 → 경고 없음', shouldWarnExclude(0, 10), false);
assertEq('제외 2/10=20% → 경고 없음', shouldWarnExclude(2, 10), false);
assertEq('제외 3/10=30% → 경고', shouldWarnExclude(3, 10), true);
assertEq('제외 1/4=25% → 경고', shouldWarnExclude(1, 4), true);

console.log('');
console.log(`결과: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('실패 목록:', failures);
  process.exit(1);
}
console.log('모든 경계값 테스트 통과');
