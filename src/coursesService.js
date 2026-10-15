import axios from "axios";
import * as cheerio from "cheerio";

const DEFAULT_URL = "https://rs.school/courses";
const DEFAULT_SELECTOR = "article.course-card_course-card__Ff1Xo";
const CACHE_TTL_MS = 5 * 60 * 1000;

let cache = { data: null, fetchedAt: 0 };

function normalizeUrl(base, href) {
  if (!href) return null;
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

function extractCard(el, $, baseUrl) {
  const $el = $(el);

  const text = $el.text().replace(/\s+/g, " ").trim();

  const links = [];
  $el.find("a").each((_, a) => {
    const $a = $(a);
    links.push({
      text: $a.text().replace(/\s+/g, " ").trim(),
      href: normalizeUrl(baseUrl, $a.attr("href")),
    });
  });

  const images = [];
  $el.find("img").each((_, img) => {
    const $img = $(img);
    images.push({
      alt: $img.attr("alt") || "",
      src: normalizeUrl(baseUrl, $img.attr("src") || $img.attr("data-src")),
    });
  });

  const headings = [];
  $el.find("h1,h2,h3,h4,h5,h6").each((_, h) => {
    headings.push($(h).text().replace(/\s+/g, " ").trim());
  });

  const courseTitle = headings[0] || "";

  const detailLinkEl = $el.find('a[data-testid="course-link"]').first();
  const detailLink = normalizeUrl(baseUrl, detailLinkEl.attr("href"));

  const dates = [];
  $el.find('time[data-testid="date-time-start"]').each((_, t) => {
    const $t = $(t);
    dates.push({
      text: $t.text().replace(/\s+/g, " ").trim(),
      datetime: $t.attr("datetime") || null,
    });
  });

  const language =
    $el.find('[data-testid="course-language"]').text().replace(/\s+/g, " ").trim() || null;

  const attrs = {};
  const rawEl = $el.get(0);
  if (rawEl && rawEl.attribs) {
    for (const [k, v] of Object.entries(rawEl.attribs)) {
      attrs[k] = v;
    }
  }

  const data = {
    tag: rawEl?.tagName || "unknown",
    classes: (attrs.class || "").split(/\s+/).filter(Boolean),
    text,
    headings,
    courseTitle,
    detailLink,
    dates,
    language,
    links,
    images,
    attrs,
    html: $el.html()?.trim() || "",
  };

  return data;
}

async function fetchPage(url) {
  const res = await axios.get(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9,ru;q=0.8",
    },
    timeout: 30000,
    maxRedirects: 5,
    responseType: "text",
    validateStatus: (s) => s < 400,
  });
  return res.data;
}

export async function parseCourses(options = {}) {
  const url = options.url || DEFAULT_URL;
  const selector = options.selector || DEFAULT_SELECTOR;

  const html = await fetchPage(url);
  const $ = cheerio.load(html);
  const elements = $(selector);

  const results = [];
  elements.each((_, el) => {
    results.push(extractCard(el, $, url));
  });

  return results;
}

export async function getCourses(options = {}) {
  if (!options.refresh && cache.data && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.data;
  }
  const data = await parseCourses(options);
  cache = { data, fetchedAt: Date.now() };
  return data;
}

export function parseDateValue(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function getCourseStartDate(course) {
  const first = Array.isArray(course.dates) && course.dates.length ? course.dates[0] : null;
  return parseDateValue(first?.datetime || first?.text);
}

export function filterCourses(courses, filters = {}) {
  let result = [...courses];

  if (filters.search) {
    const q = String(filters.search).toLowerCase();
    result = result.filter((c) =>
      [c.courseTitle, c.text, c.language, c.detailLink]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }

  if (filters.language) {
    const q = String(filters.language).toLowerCase();
    result = result.filter((c) => String(c.language || "").toLowerCase().includes(q));
  }

  const after = parseDateValue(filters.startDateAfter);
  const before = parseDateValue(filters.startDateBefore);
  if (after) {
    result = result.filter((c) => {
      const d = getCourseStartDate(c);
      return d ? d >= after : false;
    });
  }
  if (before) {
    result = result.filter((c) => {
      const d = getCourseStartDate(c);
      return d ? d <= before : false;
    });
  }

  if (filters.limit && Number(filters.limit) > 0) {
    result = result.slice(0, Number(filters.limit));
  }

  return result;
}

export function findCourse(courses, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return null;
  return (
    courses.find((c) => String(c.detailLink || "").toLowerCase().includes(q)) ||
    courses.find((c) => String(c.courseTitle || "").toLowerCase().includes(q)) ||
    courses.find((c) => String(c.courseTitle || "").toLowerCase() === q) ||
    null
  );
}

export function upcomingCourses(courses, periodDays = 30) {
  const now = new Date();
  const from = new Date(now);
  const to = new Date(now);
  to.setDate(to.getDate() + Number(periodDays || 30));
  return courses
    .map((c) => ({ course: c, start: getCourseStartDate(c) }))
    .filter(({ start }) => start && start >= from && start <= to)
    .sort((a, b) => a.start - b.start)
    .map(({ course }) => course);
}

export function summarizeCourse(course, includeHtml = false) {
  const summary = {
    courseTitle: course.courseTitle,
    detailLink: course.detailLink,
    dates: course.dates,
    language: course.language,
    text: course.text,
    headings: course.headings,
    links: course.links,
    imagesCount: Array.isArray(course.images) ? course.images.length : 0,
  };
  if (includeHtml) summary.html = course.html;
  return summary;
}

export default {
  parseCourses,
  getCourses,
  filterCourses,
  findCourse,
  upcomingCourses,
  summarizeCourse,
  getCourseStartDate,
};
