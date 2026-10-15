# RS School Courses Parser (MCP HTTP)

Node.js-проект с MCP-сервером в режиме HTTP Streamable. Сервер загружает
страницу курсов https://rs.school/courses, извлекает карточки
`article.course-card_course-card__Ff1Xo` и отдаёт данные через MCP over HTTP
(эндпоинт `/mcp`), а также `/health`.

## Установка

```bash
npm install
```

## Конфигурация

Создайте `.env` (или скопируйте `.env.example`):

```env
PORT=3000
HOST=0.0.0.0
```

## Запуск

```bash
npm start
# или
npm run mcp:http
```

После запуска:

- MCP endpoint: `http://127.0.0.1:3000/mcp`
- Health check: `http://127.0.0.1:3000/health`
- В сети: `http://<LAN-IP>:3000/mcp`

Если другие устройства не могут подключиться, разрешите входящий TCP-порт 3000
в брандмауэре Windows:

```powershell
New-NetFirewallRule -DisplayName "RS MCP 3000" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
```

## Подключение в n8n (AI Agent)

1. В workflow к узлу **AI Agent** на Tool-коннектор добавьте **MCP Client Tool**
   (type version ≥ 1.2).
2. **Server Transport**: `HTTP Streamable`.
3. **Endpoint**: `http://<хост>:3000/mcp` (Auth: None).
4. Если n8n в Docker, а сервер на хосте: `http://host.docker.internal:3000/mcp`.
5. Если n8n на другом устройстве в сети — используйте LAN-адрес из вывода
   при запуске.

## Подключение в OpenCode

В `opencode.json` указан удалённый MCP:

```json
{
  "mcp": {
    "rs-school-courses": {
      "type": "remote",
      "url": "http://127.0.0.1:3000/mcp",
      "enabled": true
    }
  }
}
```

Запустите сервер `npm start`, затем OpenCode сможет использовать инструменты.

## Инструменты MCP

- `list_courses` — список курсов с фильтрами: `search`, `language`,
  `startDateAfter`, `startDateBefore`, `limit`, `includeHtml`.
- `get_course_details` — детали курса по названию/slug, например `javascript`,
  `react`, `nodejs`.
- `get_next_courses` — ближайшие курсы за период `periodDays` (по умолчанию 30).
- Ресурс `courses://all` — все курсы в JSON.

## Формат карточки курса

Каждая карточка содержит:

- `courseTitle` — название курса
- `detailLink` — ссылка на страницу курса
- `dates` — даты старта и окончания записи
- `language` — языки курса
- `text`, `headings`, `links`, `imagesCount`
- опционально `html`

## Структура проекта

```
rs-school-courses-parser/
├── index.js                  # HTTP Streamable MCP-сервер (entry point)
├── src/
│   └── coursesService.js    # загрузка, парсинг, фильтрация и кэш курсов
├── package.json
├── README.md
├── .env.example
└── .gitignore
```

## Требования

- Node.js `>=20.6`
- Доступ к `https://rs.school/courses`