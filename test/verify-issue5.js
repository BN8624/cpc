// 이슈 #5: 분배 리팩터 전후 동등성·구조 검증 (의존성 없음)
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const htmlPath = path.join(__dirname, '..', '건별_v5.0.html');
const goldenPath = path.join(__dirname, 'golden-issue5-baseline.json');
const html = fs.readFileSync(htmlPath, 'utf8');
const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));

let failed = 0;
let passed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    failed += 1;
  } else {
    console.log('PASS:', msg);
    passed += 1;
  }
}

// --- 구조 검증: 호출 복제 제거, minCountByMax 반환 재사용 ---
const distCallMatches = html.match(/await\s+distributeAmounts\s*\(/g) || [];
assert(distCallMatches.length === 1, `distributeAmounts 호출 1회 (실제 ${distCallMatches.length})`);
assert(html.includes('const distOpts = sp250'), '250원/일반 옵션 객체 분기(distOpts) 존재');
assert(
  html.includes('return { n, reason, hardMin, maxPerRow, minCountByMax }'),
  'chooseDateCount가 minCountByMax를 반환'
);
// distributeAmounts 본문에서 minCountByMax 전체 재계산식은 비정상 maxPerRow 보정 분기에만 허용
const distStart = html.indexOf('const distributeAmounts = ');
const distEnd = html.indexOf('function App()');
const distBody = html.slice(distStart, distEnd);
const fullRecalc = distBody.match(/minCountByMax\s*=\s*Math\.max\(1,\s*Math\.ceil\(tA\s*\/\s*maxPerRow\)\)/g) || [];
assert(
  fullRecalc.length === 0,
  'distributeAmounts에서 maxPerRow 미보정 전체 재계산식 없음'
);
assert(
  distBody.includes('minCountByMax } = chooseDateCount'),
  'distributeAmounts가 chooseDateCount의 minCountByMax를 구조 분해로 수신'
);

// --- 함수 추출 ---
const extractConstFn = (name) => {
  const start = html.indexOf(`const ${name} = `);
  if (start < 0) throw new Error(`함수를 찾을 수 없음: ${name}`);
  let i = start + `const ${name} = `.length;
  while (/\s/.test(html[i])) i += 1;
  if (html.startsWith('async ', i)) i += 6;

  let paren = 0;
  let bracket = 0;
  let brace = 0;
  let seenArrow = false;
  let inBlock = false;

  for (; i < html.length; i += 1) {
    const ch = html[i];
    const next2 = html.slice(i, i + 2);

    if (!seenArrow) {
      if (ch === '(') paren += 1;
      else if (ch === ')') paren -= 1;
      else if (next2 === '=>' && paren === 0) {
        seenArrow = true;
        i += 1;
        let j = i + 1;
        while (/\s/.test(html[j])) j += 1;
        if (html[j] === '{') inBlock = true;
      }
      continue;
    }

    if (inBlock) {
      if (ch === '{') brace += 1;
      else if (ch === '}') {
        brace -= 1;
        if (brace === 0) {
          let end = i + 1;
          if (html[end] === ';') end += 1;
          return html.slice(start, end);
        }
      }
    } else {
      if (ch === '(') paren += 1;
      else if (ch === ')') paren -= 1;
      else if (ch === '[') bracket += 1;
      else if (ch === ']') bracket -= 1;
      else if (ch === '{') brace += 1;
      else if (ch === '}') brace -= 1;
      else if (ch === ';' && paren === 0 && bracket === 0 && brace === 0) {
        return html.slice(start, i + 1);
      }
    }
  }
  throw new Error(`본문 끝 없음: ${name}`);
};

const sandbox = { setTimeout, console };
vm.createContext(sandbox);
const bundle = [
  extractConstFn('randGen'),
  extractConstFn('breathe'),
  extractConstFn('roundUpToUnit'),
  extractConstFn('roundDownToUnit'),
  extractConstFn('clamp'),
  extractConstFn('chooseDateCount'),
  extractConstFn('distributeAmounts'),
  '({ randGen, chooseDateCount, distributeAmounts })',
].join('\n');
const { randGen, chooseDateCount, distributeAmounts } = vm.runInContext(bundle, sandbox);

function makeItems(n, base = 10000) {
  return Array.from({ length: n }, (_, i) => ({
    d: new Date(2024, 0, 1 + (i % 28)),
    o: base + i * 100,
    n: 0,
  }));
}

const cases = [
  { name: 'normal-mid', target: 5_000_000, avail: 20, unit: 1000, min: 0, max: 0 },
  { name: 'normal-min', target: 3_000_000, avail: 30, unit: 1000, min: 50000, max: 0 },
  { name: 'normal-max', target: 10_000_000, avail: 40, unit: 1000, min: 0, max: 500000 },
  { name: 'normal-minmax', target: 8_000_000, avail: 25, unit: 1000, min: 100000, max: 800000 },
  { name: 'unit-100', target: 1_234_500, avail: 15, unit: 100, min: 0, max: 0 },
  { name: 'unit-10', target: 555_550, avail: 12, unit: 10, min: 10000, max: 100000 },
  { name: 'small-target', target: 500, avail: 10, unit: 1000, min: 0, max: 0 },
  { name: 'tiny-target', target: 50, avail: 10, unit: 1000, min: 0, max: 0 },
  { name: 'sp250-mid', target: 2_500_000, avail: 20, unit: 250, min: 1000, max: 0 },
  { name: 'sp250-small', target: 50_000, avail: 15, unit: 250, min: 1000, max: 0 },
  { name: 'sp250-large', target: 15_000_000, avail: 50, unit: 250, min: 1000, max: 0 },
  { name: 'all-days', target: 50_000_000, avail: 30, unit: 1000, min: 0, max: 0 },
  { name: 'few-days-max', target: 1_000_000, avail: 5, unit: 1000, min: 0, max: 250000 },
  { name: 'boundary-min-eq-avg', target: 1_500_000, avail: 10, unit: 1000, min: 150000, max: 0 },
];

(async () => {
  assert(golden.length === cases.length, `골든 케이스 수 ${golden.length} === 테스트 케이스 수 ${cases.length}`);

  for (let i = 0; i < cases.length; i += 1) {
    const c = cases[i];
    const g = golden[i];
    assert(g.name === c.name, `케이스 순서/이름 일치: ${c.name}`);

    const cdc = chooseDateCount(c.target, c.avail, {
      unitSize: c.unit,
      minAmount: c.min,
      maxAmount: c.max,
    });
    assert(cdc.n === g.choose.n, `${c.name} chooseDateCount.n ${cdc.n} === ${g.choose.n}`);
    assert(cdc.reason === g.choose.reason, `${c.name} chooseDateCount.reason`);
    assert(cdc.hardMin === g.choose.hardMin, `${c.name} chooseDateCount.hardMin`);
    assert(cdc.maxPerRow === g.choose.maxPerRow, `${c.name} chooseDateCount.maxPerRow`);
    assert(typeof cdc.minCountByMax === 'number' && cdc.minCountByMax >= 1, `${c.name} minCountByMax 반환`);

    const items = makeItems(c.avail);
    const rand = randGen('golden-' + c.name);
    const result = await distributeAmounts(items, c.target, {
      rand,
      unitSize: c.unit,
      minAmount: c.min,
      maxAmount: c.max,
      shouldCancel: () => false,
    });
    const amounts = items.filter((it) => it.n > 0).map((it) => it.n).sort((a, b) => a - b);
    const sum = amounts.reduce((s, a) => s + a, 0);

    assert(result.count === g.result.count, `${c.name} count ${result.count} === ${g.result.count}`);
    assert(result.avg === g.result.avg, `${c.name} avg`);
    assert(result.low === g.result.low, `${c.name} low`);
    assert(result.high === g.result.high, `${c.name} high`);
    assert(result.available === g.result.available, `${c.name} available`);
    assert(result.reason === g.result.reason, `${c.name} reason`);
    assert(sum === g.sum && sum === c.target, `${c.name} sum ${sum} === target ${c.target}`);
    assert(
      amounts.length === g.amounts.length && amounts.every((v, idx) => v === g.amounts[idx]),
      `${c.name} amounts 완전 일치`
    );
  }

  // 추가 경계: 빈 목록 / 0원
  {
    const empty = await distributeAmounts([], 1000, {
      rand: randGen('empty'),
      unitSize: 1000,
      minAmount: 0,
      maxAmount: 0,
    });
    assert(empty.count === 0 && empty.reason === '데이터 없음', '빈 목록 조기 반환');
    const zero = await distributeAmounts(makeItems(5), 0, {
      rand: randGen('zero'),
      unitSize: 1000,
      minAmount: 0,
      maxAmount: 0,
    });
    assert(zero.count === 0 && zero.reason === '데이터 없음', '목표 0원 조기 반환');
  }

  console.log(`\n결과: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
