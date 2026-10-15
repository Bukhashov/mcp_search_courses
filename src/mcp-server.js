#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  getCourses,
  filterCourses,
  findCourse,
  upcomingCourses,
  summarizeCourse,
} from "./coursesService.js";

const server = new McpServer({
  name: "rs-school-courses-mcp",
  version: "1.0.0",
});

function toolResult(payload, isError = false) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    isError,
  };
}

server.tool(
  "list_courses",
  "Получить список курсов RS School. Поддерживает поиск, фильтр по языку и по датам старта, а также лимит.",
  {
    search: z.string().optional().describe("Поиск по названию/описанию/языку"),
    language: z.string().optional().describe("Фильтр по языку курса, например English или Русский"),
    startDateAfter: z.string().optional().describe("Начало курса не раньше этой даты (ISO 8601)"),
    startDateBefore: z.string().optional().describe("Начало курса не позже этой даты (ISO 8601)"),
    limit: z.number().int().min(1).max(100).optional().describe("Максимальное число курсов"),
    includeHtml: z.boolean().optional().describe("Включать HTML карточек в ответ"),
  },
  async ({ search, language, startDateAfter, startDateBefore, limit, includeHtml }) => {
    try {
      const courses = await getCourses();
      const filtered = filterCourses(courses, {
        search,
        language,
        startDateAfter,
        startDateBefore,
        limit,
      });
      return toolResult({
        count: filtered.length,
        courses: filtered.map((c) => summarizeCourse(c, Boolean(includeHtml))),
      });
    } catch (error) {
      return toolResult({ error: error?.message || String(error) }, true);
    }
  }
);

server.tool(
  "get_course_details",
  "Получить подробную информацию о конкретном курсе по названию или slug (например javascript, react, nodejs).",
  {
    query: z.string().describe("Название курса или slug из URL"),
    includeHtml: z.boolean().optional().describe("Включать HTML карточки"),
  },
  async ({ query, includeHtml }) => {
    try {
      const courses = await getCourses();
      const course = findCourse(courses, query);
      if (!course) {
        return toolResult(
          {
            found: false,
            message: `Курс "${query}" не найден`,
            available: courses.map((c) => c.courseTitle),
          },
          true
        );
      }
      return toolResult({
        found: true,
        course: includeHtml ? course : summarizeCourse(course, false),
      });
    } catch (error) {
      return toolResult({ error: error?.message || String(error) }, true);
    }
  }
);

server.tool(
  "get_next_courses",
  "Получить ближайшие курсы, которые стартуют в заданный период (по умолчанию 30 дней).",
  {
    periodDays: z.number().int().min(1).max(365).optional().describe("Период в днях от текущей даты"),
  },
  async ({ periodDays }) => {
    try {
      const courses = await getCourses();
      const next = upcomingCourses(courses, periodDays || 30);
      return toolResult({
        periodDays: periodDays || 30,
        count: next.length,
        courses: next.map((c) => summarizeCourse(c, false)),
      });
    } catch (error) {
      return toolResult({ error: error?.message || String(error) }, true);
    }
  }
);

server.resource(
  "courses_all",
  "courses://all",
  async (uri) => {
    const courses = await getCourses();
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(courses.map((c) => summarizeCourse(c, false)), null, 2),
        },
      ],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Keep process alive; stdio transport handles lifecycle.
}

main().catch((error) => {
  console.error("MCP server error:", error?.message || error);
  process.exit(1);
});
