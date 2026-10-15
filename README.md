# RS School Courses Parser

Node.js-парсер, который загружает страницу курсов https://rs.school/courses,
находит блоки `article.course-card_course-card__Ff1Xo` и сохраняет их
в структурированный JSON (или CSV).

## Установка

```bash
npm install
```

## Использование

Парсить страницу курсов по умолчанию:

```bash
npm start
# или
npm run parse
```

Запуск с параметрами:

```bash
node src/index.js \
  --url https://rs.school/courses \
  --selector "article.course-card_course-card__Ff1Xo" \
  --out courses.json \
  --format json
```

CSV-экспорт:

```bash
node src/index.js --format csv --out courses.csv --no-html
```

### Параметры

| Флаг | Описание | По умолчанию |
|------|----------|--------------|
| `-u, --url <url>` | Адрес страницы | `https://rs.school/courses` |
| `-s, --selector <selector>` | CSS-селектор блоков | `article.course-card_course-card__Ff1Xo` |
| `-o, --out <file>` | Файл результата | `output.json` |
| `-f, --format <format>` | `json` или `csv` | `json` |
| `--limit <n>` | Ограничить число элементов | `0` (без ограничения) |
| `--no-html` | Не сохранять HTML блоков | HTML сохраняется |
| `--pretty` | Красивый JSON | включено |

## Формат результата

Каждый элемент содержит:

- `tag`, `classes`, `text`
- `courseTitle` — название курса
- `detailLink` — ссылка на страницу курса
- `dates` — даты старта и окончания записи
- `language` — языки курса
- `headings`, `links`, `images`
- `attrs` — атрибуты элемента
- `html` — внутренний HTML блока

## HTTP-сервер

Запуск (порт берётся из `.env`, переменная `PORT`):

```bash
npm run serve
```

Эндпоинты:

| Метод | Путь | Описание |
|-------|------|----------|
| `GET` | `/health` | Проверка статуса и порта |
| `GET` | `/courses` | Список курсов. Параметры: `search`, `language`, `startDateAfter`, `startDateBefore`, `limit`, `includeHtml` |
| `GET` | `/courses/next?periodDays=30` | Ближайшие курсы за период |
| `GET` | `/courses/:query` | Детали курса по названию/slug |

## MCP-сервер для ИИ

В проекте есть MCP-сервер (stdio и HTTP Streamable), который позволяет
ИИ-агенту получать курсы RS School через инструменты.

### Запуск MCP-сервера

```bash
npm run mcp
```

Сервер работает по протоколу MCP через stdin/stdout, поэтому его нужно
подключать как локальный MCP в клиент (например OpenCode/Claude Desktop).

### Пример конфигурации (OpenCode)

Добавьте в конфигурацию MCP:

```json
{
  "mcp": {
    "rs-school-courses": {
      "type": "local",
      "command": ["node", "C:/путь/к/проекту/src/mcp-server.js"],
      "enabled": true
    }
  }
}
```

Путь нужно указать абсолютный для вашей машины.

### Инструменты

- `list_courses` — список курсов с фильтрами: `search`, `language`,
  `startDateAfter`, `startDateBefore`, `limit`, `includeHtml`.
- `get_course_details` — детали курса по названию/slug, например `javascript`,
  `react`, `nodejs`.
- `get_next_courses` — ближайшие курсы за период `periodDays` (по умолчанию 30).
- Ресурс `courses://all` — все курсы в JSON.

### HTTP Streamable MCP (для n8n и других клиентов)

Для клиентов, которые не поддерживают stdio (например AI Agent в n8n),
есть вариант MCP-сервера по HTTP Streamable. Запуск (порт берётся из `.env`):

```bash
npm run mcp:http
```

Эндпоинт: `http://<хост>:3000/mcp` (stateless). Дополнительно `GET /health` —
проверка статуса.

Сервер слушает `HOST` из `.env` (по умолчанию `0.0.0.0`), поэтому доступен
и другим устройствам в локальной сети. При запуске выводятся готовые адреса:

```
MCP Streamable HTTP сервер запущен:
  локально: http://127.0.0.1:3000/mcp
  сеть:     http://192.168.0.11:3000/mcp
```

Если другие устройства не могут подключиться, разрешите входящий TCP-порт 3000
в брандмауэре Windows (нужны права администратора):

```powershell
New-NetFirewallRule -DisplayName "RS MCP 3000" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
```

#### Подключение в n8n (AI Agent)

1. В workflow к узлу **AI Agent** на Tool-коннектор добавьте **MCP Client Tool**
   (type version ≥ 1.2).
2. **Server Transport**: `HTTP Streamable`.
3. **Endpoint**: `http://<хост>:3000/mcp` (Auth: None).
4. Если n8n в Docker, а сервер на хосте: `http://host.docker.internal:3000/mcp`.
5. Если n8n на другом устройстве в сети — используйте LAN-адрес из вывода
   при запуске, например `http://192.168.0.11:3000/mcp`.

## Структура проекта

```
rs-school-courses-parser/
├── index.js                 # MCP-сервер по HTTP Streamable (для n8n и т.п.)
├── src/
│   ├── index.js             # CLI-парсер (JSON/CSV)
│   ├── coursesService.js    # общая логика парсинга и фильтрации
│   ├── mcp-server.js        # MCP-сервер по stdio
│   └── server.js            # REST HTTP-сервер
├── package.json
├── README.md
└── .gitignore
```
