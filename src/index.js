#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { Command } from "commander";
import {
  getCourses,
  filterCourses,
  summarizeCourse,
} from "./coursesService.js";

const program = new Command();

program
  .name("rs-parser")
  .description("Загружает страницу RS School courses и извлекает article.course-card_course-card__Ff1Xo.")
  .option("-u, --url <url>", "URL страницы", "https://rs.school/courses")
  .option("-s, --selector <selector>", "CSS-селектор блоков", "article.course-card_course-card__Ff1Xo")
  .option("-o, --out <file>", "Файл результата", "output.json")
  .option("-f, --format <format>", "json или csv", "json")
  .option("--limit <n>", "Ограничить число элементов (0 = без ограничения)", "0")
  .option("--no-html", "Не сохранять HTML блоков")
  .option("--pretty", "Красивый JSON", true)
  .parse(process.argv);

const opts = program.opts();

async function main() {
  const url = opts.url;
  const limit = parseInt(opts.limit, 10) || 0;

  console.log(`Загружаю: ${url}`);
  const courses = await getCourses({ url, refresh: true });
  console.log(`Найдено карточек: ${courses.length}`);

  const filtered = filterCourses(courses, { limit });

  const outPath = path.resolve(process.cwd(), opts.out);

  if (opts.format === "csv") {
    const header = ["index", "courseTitle", "detailLink", "language", "startDate", "endDate", "text"];
    const rows = filtered.map((r, i) => {
      const dates = r.dates || [];
      return [
        i + 1,
        r.courseTitle || "",
        r.detailLink || "",
        r.language || "",
        dates[0]?.datetime || dates[0]?.text || "",
        dates[1]?.datetime || dates[1]?.text || "",
        (r.text || "").replace(/"/g, '""'),
      ];
    });
    const csv = [header.join(","), ...rows.map((row) => row.map((c) => `"${String(c)}"`).join(","))].join("\n");
    await writeFile(outPath, csv, "utf8");
  } else {
    const output = opts.noHtml ? filtered.map((c) => summarizeCourse(c, false)) : filtered;
    const json = opts.pretty ? JSON.stringify(output, null, 2) : JSON.stringify(output);
    await writeFile(outPath, json, "utf8");
  }

  console.log(`Сохранено ${filtered.length} записей в ${outPath}`);

  console.log("\n--- Сводка ---");
  filtered.slice(0, 5).forEach((r, i) => {
    console.log(`${i + 1}. ${r.courseTitle || r.text.slice(0, 80)}`);
  });
  if (filtered.length > 5) console.log(`... и ещё ${filtered.length - 5}`);
}

main().catch((err) => {
  console.error("Ошибка:", err?.message || err);
  if (err?.response) {
    console.error("HTTP", err.response.status, err.response.statusText);
  }
  process.exit(1);
});
