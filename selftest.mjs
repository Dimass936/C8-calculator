// Прогон самопроверки браузерной версии под Node (DOM подменяется заглушкой).
// Проверяет и математику, и отрисовку всех экранов/режимов.
// Запуск: node tools/C8Calculations-web/selftest.mjs
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, "index.html"), "utf8");

const match = html.match(/<script>([\s\S]*?)<\/script>/);
if (!match) {
  console.error("Не найден <script> в index.html");
  process.exit(2);
}

/* --- минимальная заглушка браузерного окружения --- */
const makeEl = () => ({ innerHTML: "", value: "" });
globalThis.document = { getElementById: makeEl };
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v))
};
globalThis.confirm = () => true;
globalThis.window = { scrollTo() {} };

/* --- прогоняем математику + все ветки отрисовки --- */
const probe = `
  const errors = [];

  // 1) отрисовка каждой вкладки
  for (const t of ["home", "team", "dividend", "profit", "settings"]) {
    try { go(t); } catch (e) { errors.push("вкладка " + t + ": " + e.message); }
  }

  // 2) дивиденды с реальными данными
  try {
    S.team = { C1: 5, C2: 1, C3: 2, C4: 0, C5: 0, C6: 0 };
    S.divDays = "30";
    calcDividend();
    if (R.error) errors.push("дивиденды: " + R.error);
    if (!R.div || R.div.total !== dec("35.52")) errors.push("дивиденды: неверный итог");
    viewDividend();
  } catch (e) { errors.push("дивиденды: " + e.message); }

  // 3) все режимы × обе валюты, с отрисовкой результата
  try {
    S.team = { C1: 0, C2: 0, C3: 0, C4: 0, C5: 0, C6: 0 };
    S.balance = "300"; S.targetBalance = "1000"; S.targetProfit = "100";
    S.rate = "80"; S.x = "0"; S.l1 = false; S.vip = false; S.auto = true;
    for (const m of ["date", "balance", "profit"]) {
      S.mode = m;
      for (const cur of ["USDT", "RUB"]) {
        S.currency = cur;
        calcProfit();
        if (R.error) errors.push("режим " + m + "/" + cur + ": " + R.error);
        else if (!R.profit) errors.push("режим " + m + "/" + cur + ": нет результата");
        viewProfit();
        toggleDays();
        viewProfit();
      }
    }

    // 4) режим «до даты» со всеми флагами и другим уровнем
    S.mode = "date"; S.currency = "USDT"; S.level = "C3";
    S.l1 = true; S.vip = true; S.auto = true; S.x = "3";
    calcProfit();
    if (R.error) errors.push("date+флаги: " + R.error);
    viewProfit();

    // 5) цель уже достигнута (ветка с нулевым результатом)
    S.mode = "balance"; S.level = "C1"; S.balance = "5000"; S.targetBalance = "100";
    calcProfit();
    if (R.error) errors.push("цель достигнута: " + R.error);
    viewProfit();

    // 6) ошибки должны показываться, а не падать
    S.mode = "profit"; S.currency = "USDT"; S.balance = "300"; S.targetProfit = "100"; S.rate = "0";
    calcProfit();
    if (R.error !== "Курс USDT должен быть больше 0") errors.push("курс 0: нет ожидаемой ошибки");
    viewProfit();

    S.rate = "80"; S.mode = "date";
    S.start = "2026-02-10"; S.end = "2026-02-01";
    calcProfit();
    if (R.error !== "Дата окончания не может быть раньше даты начала") errors.push("конец < начало: нет ошибки");
    viewProfit();

    // 7) ГЛАВНОЕ: период фонда ВЫВОДИТСЯ из периода расчёта (отдельно задать нельзя)
    S.mode = "date"; S.start = "2026-10-15"; S.end = "2026-10-22";   // 8 дней
    S.level = "C1"; S.balance = "0"; S.x = "0";
    S.l1 = false; S.vip = false; S.auto = false;
    S.trust = true; S.trustLevels = [0];
    calcProfit();
    if (R.error) errors.push("фонд 8 дней: " + R.error);
    else if (!R.trust) errors.push("фонд: блок не посчитан");
    else {
      if (R.trust.days !== 8)
        errors.push("фонд: ожидалось 8 дней (как в расчёте), получено " + R.trust.days);
      if (R.trust.gross !== dec("285.6"))
        errors.push("фонд 8 дней VIP1: ожидалось 285,6, получено " + fmt(R.trust.gross));
    }
    const htmlTrust = viewProfit();
    if (!htmlTrust.includes("Чистыми по фонду, ₽"))
      errors.push("нет строки «Чистыми по фонду, ₽»");
    if (!htmlTrust.includes("Итого с фондом, ₽"))
      errors.push("нет строки «Итого с фондом, ₽»");
    if (!htmlTrust.includes("Чистая прибыль по сигналам + сверх депозит"))
      errors.push("нет строки «Чистая прибыль по сигналам + сверх депозит»");
    // VIP1, 8 дней: 285,6 × 0,7 = 199,92 $; × 80 ₽ = 15 993,6 ₽
    if (!htmlTrust.includes("15 993,6"))
      errors.push("₽ по фонду: не найдено 15 993,6");

    // меняем период расчёта — фонд едет за ним сам, без всяких кнопок
    S.start = "2026-01-05"; S.end = "2026-02-03";   // 30 дней
    calcProfit();
    if (R.error) errors.push("фонд 30 дней: " + R.error);
    else if (R.trust.days !== 30)
      errors.push("фонд: ожидалось 30 дней, получено " + R.trust.days + " (период не поехал)");
    else if (R.trust.gross !== dec("1071"))
      errors.push("фонд 30 дней VIP1: доход " + fmt(R.trust.gross));
    viewProfit();

    // уровень VIP Траст переключается
    S.trustLevels = [3];
    calcProfit();
    if (R.error) errors.push("фонд VIP4: " + R.error);
    else if (R.trust.net !== dec("10500")) errors.push("фонд VIP4: чистыми " + fmt(R.trust.net));
    viewProfit();

    // ДВА уровня сразу: VIP4 + VIP3 за те же 30 дней
    S.trustLevels = [3, 2];
    calcProfit();
    if (R.error) errors.push("два уровня: " + R.error);
    else if (R.trust.days !== 30) errors.push("два уровня: дней " + R.trust.days);
    else if (R.trust.perDay !== dec("717"))
      errors.push("два уровня: в день " + fmt(R.trust.perDay) + " вместо 717");
    else if (R.trust.net !== dec("15057"))
      errors.push("два уровня: чистыми " + fmt(R.trust.net) + " вместо 15 057");
    const htmlTwo = viewProfit();
    if (!htmlTwo.includes("VIP3") || !htmlTwo.includes("VIP4"))
      errors.push("два уровня: в результате нет обеих строк");

    // ни одного уровня — понятная ошибка, а не молчаливый ноль
    S.trustLevels = [];
    calcProfit();
    if (R.error !== "Выберите хотя бы один уровень трастового фонда")
      errors.push("без уровней: нет ожидаемой ошибки");
    viewProfit();
    S.trustLevels = [0];

    // 8) конец раньше начала → ошибка
    S.start = "2026-02-10"; S.end = "2026-02-01";
    calcProfit();
    if (R.error !== "Дата окончания не может быть раньше даты начала")
      errors.push("фонд: конец < начало — нет ожидаемой ошибки");
    viewProfit();

    // вне «до даты» периода нет → 6 месяцев от даты начала (срок по правилам)
    S.mode = "balance"; S.start = "2026-01-05"; S.balance = "0"; S.targetBalance = "1000";
    S.trustLevels = [0];
    calcProfit();
    if (R.error) errors.push("фонд вне «до даты»: " + R.error);
    else if (R.trust.days !== 182)
      errors.push("фонд вне «до даты»: ожидалось 182 дня (6 мес), получено " + R.trust.days);
    viewProfit();

    // выключенный фонд не должен влиять на расчёт
    S.trust = false; S.mode = "date"; S.start = "2026-10-15"; S.end = "2026-10-22";
    calcProfit();
    if (R.error) errors.push("фонд выключен: " + R.error);
    if (R.trust) errors.push("фонд выключен, а блок посчитан");
    viewProfit();

    // 10) свой период фонда: задаём — используется, а расчёт его больше не двигает
    S.mode = "date"; S.start = "2026-10-15"; S.end = "2026-10-22";   // период расчёта — 8 дней
    S.trust = true; S.trustLevel = "0";
    S.trustStart = "2026-01-05"; S.trustEnd = "2026-02-03";          // свой период — 30 дней
    calcProfit();
    if (R.error) errors.push("свой период: " + R.error);
    else if (R.trust.days !== 30)
      errors.push("свой период: ожидалось 30 дней, получено " + R.trust.days);
    else if (R.trust.gross !== dec("1071"))
      errors.push("свой период VIP1: доход " + fmt(R.trust.gross));
    viewProfit();

    // меняем период расчёта — свой период фонда не должен съезжать
    S.start = "2026-03-01"; S.end = "2026-03-05";
    calcProfit();
    if (R.error) errors.push("свой период + смена расчёта: " + R.error);
    else if (R.trust.days !== 30)
      errors.push("свой период съехал после смены расчёта: " + R.trust.days);
    viewProfit();

    // кнопка «К периоду расчёта» — снова следуем за расчётом (5 дней)
    clearTrustPeriod();
    calcProfit();
    if (R.error) errors.push("сброс периода: " + R.error);
    else if (R.trust.days !== 5)
      errors.push("после «К периоду расчёта»: ожидалось 5 дней, получено " + R.trust.days);
    viewProfit();

    // 9) таблица по дням: в Пт/Сб сигналов меньше, чем в будни (правило программы)
    S.level = "C6"; S.x = "0"; S.vip = false; S.l1 = false;
    S.start = "2026-10-15"; S.end = "2026-10-22";   // возвращаем октябрьский период
    calcProfit();
    const dFri = R.profit.days.find(d => iso(d.date) === "2026-10-16");   // пятница
    const dMon = R.profit.days.find(d => iso(d.date) === "2026-10-19");   // понедельник
    if (!dFri || dFri.signals !== 1) errors.push("Пт: ожидался 1 сигнал");
    if (!dMon || dMon.signals !== 4) errors.push("Пн: ожидалось 4 сигнала");
    if (!dMon || dMon.income !== dec("320")) errors.push("Пн: ожидался доход 320");
    viewProfit();

    // 11) прибыль от сигналов НЕ должна включать стартовый излишек над депозитом
    S.mode = "date"; S.start = "2026-10-15"; S.end = "2026-10-22";   // 8 дней
    S.level = "C6"; S.balance = "13500"; S.x = "0";
    S.vip = false; S.l1 = false; S.auto = false; S.trust = false;
    calcProfit();
    if (R.error) errors.push("прибыль от сигналов: " + R.error);
    else {
      if (R.profit.gross !== dec("5580"))
        errors.push("прибыль до удержания: ожидалось 5580, получено " + fmt(R.profit.gross));
      const inc = R.profit.days.reduce((s, d) => add(s, d.income), ZERO);
      if (inc !== dec("2080"))
        errors.push("доход за период: ожидалось 2080, получено " + fmt(inc));
      if (R.startBalance !== dec("13500"))
        errors.push("стартовый баланс не сохранён: " + fmt(R.startBalance));
    }
    const htmlRes = viewProfit();
    if (!htmlRes.includes("Доход за период (сигналы)"))
      errors.push("нет строки «Доход за период (сигналы)»");
    if (!htmlRes.includes("в т.ч. было сверх депозита"))
      errors.push("нет пояснения про стартовый излишек");
    if (!htmlRes.includes("2 080")) errors.push("нет значения дохода 2 080");
    if (!htmlRes.includes("3 500")) errors.push("нет значения излишка 3 500");

    // если стартовый баланс равен депозиту — пояснения быть не должно
    S.balance = "10000";
    calcProfit();
    const htmlNoSurplus = viewProfit();
    if (htmlNoSurplus.includes("в т.ч. было сверх депозита"))
      errors.push("излишка нет, а строка про него показана");
  } catch (e) { errors.push("прогноз: " + e.message); }

  return { tests: runSelfTests(), errors };
`;

const run = new Function(match[1] + "\n;" + probe);
const r = run();

/* --- проверки <head>: мета для «Добавить на экран Домой» --- */
const headChecks = [
  ["apple-mobile-web-app-capable", /<meta\s+name="apple-mobile-web-app-capable"\s+content="yes"/],
  ["theme-color (светлая)", /<meta\s+name="theme-color"[^>]*media="\(prefers-color-scheme: light\)"/],
  ["theme-color (тёмная)", /<meta\s+name="theme-color"[^>]*media="\(prefers-color-scheme: dark\)"/],
  ["viewport-fit=cover", /viewport-fit=cover/],
  ["apple-mobile-web-app-title", /apple-mobile-web-app-title/],
  ["apple-touch-icon", /<link\s+rel="apple-touch-icon"/],
  ["manifest", /<link\s+rel="manifest"/],
  ["favicon", /<link\s+rel="icon"/]
];
const headErrors = headChecks.filter(([, re]) => !re.test(html)).map(([n]) => n);

/* --- файлы, на которые ссылается head --- */
const assetFiles = ["icon-180.png", "icon-192.png", "icon-32.png", "icon-512.png", "manifest.webmanifest"];
const missingFiles = assetFiles.filter((f) => !existsSync(join(here, f)));

console.log(`Математика:            ${r.tests.passed} из ${r.tests.total}, провалов: ${r.tests.failed}`);
console.log(`Отрисовка/сценарии:    ошибок: ${r.errors.length}`);
console.log(`Мета для телефона:     ошибок: ${headErrors.length}`);
console.log(`Файлы иконок:          отсутствует: ${missingFiles.length}`);
for (const f of r.tests.failures) console.log("  FAIL  " + f);
for (const e of r.errors) console.log("  ERR   " + e);
for (const h of headErrors) console.log("  ERR   нет мета: " + h);
for (const m of missingFiles) console.log("  ERR   нет файла: " + m);

process.exit(r.tests.failed || r.errors.length || headErrors.length || missingFiles.length ? 1 : 0);
