#!/usr/bin/env node
import http from "node:http";
import {
  getCourses,
  filterCourses,
  findCourse,
  upcomingCourses,
  summarizeCourse,
} from "./coursesService.js";

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "127.0.0.1";

function send(res, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(body);
}

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const { pathname, searchParams } = url;

  try {
    if (pathname === "/" || pathname === "/health") {
      return send(res, 200, { status: "ok", service: "rs-school-courses", port: PORT });
    }

    if (pathname === "/courses") {
      const courses = await getCourses();
      const filtered = filterCourses(courses, {
        search: searchParams.get("search") || undefined,
        language: searchParams.get("language") || undefined,
        startDateAfter: searchParams.get("startDateAfter") || undefined,
        startDateBefore: searchParams.get("startDateBefore") || undefined,
        limit: searchParams.get("limit") || undefined,
      });
      const includeHtml = searchParams.get("includeHtml") === "true";
      return send(res, 200, {
        count: filtered.length,
        courses: filtered.map((c) => summarizeCourse(c, includeHtml)),
      });
    }

    if (pathname === "/courses/next") {
      const periodDays = Number(searchParams.get("periodDays")) || 30;
      const courses = await getCourses();
      const next = upcomingCourses(courses, periodDays);
      return send(res, 200, {
        periodDays,
        count: next.length,
        courses: next.map((c) => summarizeCourse(c, false)),
      });
    }

    if (pathname.startsWith("/courses/")) {
      const query = decodeURIComponent(pathname.slice("/courses/".length));
      const courses = await getCourses();
      const course = findCourse(courses, query);
      if (!course) {
        return send(res, 404, { found: false, message: `Курс "${query}" не найден` });
      }
      const includeHtml = searchParams.get("includeHtml") === "true";
      return send(res, 200, { found: true, course: summarizeCourse(course, includeHtml) });
    }

    return send(res, 404, { error: "Not found" });
  } catch (error) {
    return send(res, 500, { error: error?.message || String(error) });
  }
}

const server = http.createServer(handle);

server.listen(PORT, HOST, () => {
  console.log(`Сервер запущен: http://${HOST}:${PORT}`);
});
