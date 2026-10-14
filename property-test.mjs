// Property-тест: итог целевых расчётов обязан быть НЕ НИЖЕ цели.
// Запуск: node tools/C8Calculations-web/property-test.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, "index.html"), "utf8");
const code = html.match(/<script>([\s\S]*?)<\/script>/)[1];

const makeEl = () => ({ innerHTML: "", value: "" });
globalThis.document = { getElementById: makeEl };
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v))
};
globalThis.confirm = () => true;
globalThis.window = { scrollTo() {} };

const probe = `
  const start = new Date(2026, 0, 5, 12);
  const badBal = [], badNet = [];
  let n = 0, skipped = 0;

  for (let lvl = 0; lvl < 6; lvl++) {
    for (const auto of [false, true]) {
      for (const x of [0, 3]) {
        for (const target of [1, 10, 60, 300, 1500, 9000]) {
          n++;
          try {
            const t = dec(String(target));
            const r = targetBalance(start, lvl, 0n, t, auto, x, false, 0);
            if (r.finalBalance < t) {
              badBal.push({ lvl, auto, x, target, final: fmt(r.finalBalance),
                            days: r.daysCount, lastSignals: r.lastSignals });
            }
          } catch (e) { skipped++; }
        }
      }
    }
  }

  for (let lvl = 0; lvl < 6; lvl++) {
    for (const auto of [false, true]) {
      for (const target of [1, 50, 400, 3000, 20000]) {
        n++;
        try {
          const t = dec(String(target));
          const r = targetProfit(start, lvl, 0n, t, auto, 0, false, 0);
          if (r.net < t) {
            badNet.push({ lvl, auto, target, net: fmt(r.net),
                          days: r.daysCount, lastSignals: r.lastSignals });
          }
        } catch (e) { skipped++; }
      }
    }
  }

  const r10 = targetBalance(start, 0, 0n, dec("10"), false, 0, false, 0);
  const demo = { target: "10", finalBalance: fmt(r10.finalBalance),
                 days: r10.daysCount, lastSignals: r10.lastSignals,
                 reached: r10.finalBalance >= dec("10") };

  return { n, skipped, badBal, badNet, demo };
`;

const r = new Function(code + "\n;" + probe)();

console.log(`Конфигураций проверено: ${r.n} (пропущено из-за лимита 36500 дней: ${r.skipped})`);
console.log(`\nСпорный случай «цель 10»: итог ${r.demo.finalBalance}, дней ${r.demo.days}, ` +
            `сигналов в последний день ${r.demo.lastSignals}, цель достигнута: ${r.demo.reached}`);
console.log(`\nНарушений «баланс < цели»:          ${r.badBal.length}`);
r.badBal.slice(0, 10).forEach(b => console.log("  " + JSON.stringify(b)));
console.log(`Нарушений «чистая прибыль < цели»:  ${r.badNet.length}`);
r.badNet.slice(0, 10).forEach(b => console.log("  " + JSON.stringify(b)));
