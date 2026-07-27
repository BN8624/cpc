// 이슈 #3: CDN SRI·Tailwind 인라인·로드 실패 안내 구조 검증 (의존성 없음)
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const https = require("https");

const htmlPath = path.join(__dirname, "건별_v5.0.html");
const html = fs.readFileSync(htmlPath, "utf8");
let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    failed++;
  } else {
    console.log("PASS:", msg);
  }
}

assert(!html.includes("cdn.tailwindcss.com"), "Play CDN removed");
assert((html.match(/integrity="/g) || []).length === 4, "4 SRI integrity attrs");
assert((html.match(/crossorigin="anonymous"/g) || []).length === 4, "4 crossorigin=anonymous");
assert((html.match(/onerror="reportCdnFailure\(\)"/g) || []).length === 4, "4 script onerror handlers");
assert(html.includes("function reportCdnFailure"), "reportCdnFailure defined");
assert(html.includes("인터넷 연결 또는 CDN 차단"), "offline/CDN failure message present");
assert(!html.includes("코드가 잘린"), "misleading truncate message removed");
assert(html.includes(".min-h-screen{") || html.includes(".min-h-screen {"), "inline Tailwind utilities present");
assert(html.includes("setTimeout"), "load timeout detection present");

const expected = [
  {
    src: "https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js",
    integrity: "sha384-tMH8h3BGESGckSAVGZ82T9n90ztNXxvdwvdM6UoR56cYcf+0iGXBliJ29D+wZ/x8",
  },
  {
    src: "https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js",
    integrity: "sha384-bm7MnzvK++ykSwVJ2tynSE5TRdN+xL418osEVF2DE/L/gfWHj91J2Sphe582B1Bh",
  },
  {
    src: "https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.2/babel.min.js",
    integrity: "sha384-aGlMNK3U/x0wl4lEH5jD1PGhJlX9hApuPmIiA5gtiYCOQ1J8ejIdC0btaU/TMoBD",
  },
  {
    src: "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js",
    integrity: "sha384-vtjasyidUo0kW94K5MXDXntzOJpQgBKXmE7e2Ga4LG0skTTLeBi97eFAXsqewJjw",
  },
];

for (const e of expected) {
  assert(html.includes(`src="${e.src}"`), `script src present: ${e.src.split("/").pop()}`);
  assert(html.includes(`integrity="${e.integrity}"`), `integrity present: ${e.src.split("/").pop()}`);
}

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetchBuffer(res.headers.location).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
      })
      .on("error", reject);
  });
}

async function verifyLiveSri() {
  for (const e of expected) {
    try {
      const buf = await fetchBuffer(e.src);
      const hash = "sha384-" + crypto.createHash("sha384").update(buf).digest("base64");
      assert(hash === e.integrity, `live SRI match: ${e.src.split("/").pop()}`);
    } catch (err) {
      console.error("FAIL: live SRI fetch:", e.src, err.message);
      failed++;
    }
  }
}

verifyLiveSri().then(() => {
  if (failed) {
    console.error(`\n${failed} check(s) failed`);
    process.exit(1);
  }
  console.log("\nAll structural checks passed");
  process.exit(0);
});
