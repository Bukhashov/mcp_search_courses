#!/usr/bin/env node
import http from "node:http";
import os from "node:os";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

import {
  getCourses,
  filterCourses,
  findCourse,
  upcomingCourses,
  summarizeCourse,
} from "./src/coursesService.js";

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";

function getLanAddresses() {
  const addresses = [];
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces || []) {
      if (iface.family === "IPv4" && !iface.internal && !iface.address.startsWith("169.254.")) {
        addresses.push(iface.address);
      }
    }
  }
  return addresses;
}

function toolResult(payload, isError = false) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    isError,
  };
}

function getServer() {
  const server = new McpServer({
    name: "rs-school-courses-mcp",
    version: "1.0.0",
  });

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

  server.resource("courses_all", "courses://all", async (uri) => {
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
  });

  return server;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) return resolve(undefined);
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function jsonRpcError(res, status, code, message) {
  if (res.headersSent) return;
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id: null }));
}

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const { pathname } = url;

  if (pathname === "/health" || pathname === "/") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ status: "ok", service: "rs-school-courses-mcp", port: PORT }));
    return;
  }

  if (pathname !== "/mcp") {
    jsonRpcError(res, 404, -32000, "Not found");
    return;
  }

  if (req.method === "GET" || req.method === "DELETE") {
    jsonRpcError(res, 405, -32000, "Method not allowed.");
    return;
  }

  if (req.method !== "POST") {
    jsonRpcError(res, 405, -32000, "Method not allowed.");
    return;
  }

  const server = getServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  try {
    const body = await readJsonBody(req);
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch (error) {
    console.error("Ошибка обработки MCP-запроса:", error);
    jsonRpcError(res, 500, -32603, "Internal server error");
  } finally {
    res.on("close", () => {
      transport.close();
      server.close();
    });
  }
}

const httpServer = http.createServer((req, res) => {
  handle(req, res).catch((error) => {
    console.error("Ошибка сервера:", error);
    jsonRpcError(res, 500, -32603, "Internal server error");
  });
});

httpServer.listen(PORT, HOST, () => {
  console.log("MCP Streamable HTTP сервер запущен:");
  console.log(`  локально: http://127.0.0.1:${PORT}/mcp`);
  for (const address of getLanAddresses()) {
    console.log(`  сеть:     http://${address}:${PORT}/mcp`);
  }
});

process.on("SIGINT", () => {
  console.log("Остановка сервера...");
  httpServer.close(() => process.exit(0));
});
