# Используем официальный Node.js образ (LTS версия)
FROM node:20-alpine

# Устанавливаем рабочую директорию
WORKDIR /app

# Копируем package.json и package-lock.json для кэширования слоя зависимостей
COPY package*.json ./

# Устанавливаем зависимости (production only)
RUN npm ci --omit=dev

# Копируем исходный код
COPY index.js ./
COPY src/ ./src/

# Создаём не-root пользователя для безопасности
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs && \
    chown -R nodejs:nodejs /app
USER nodejs

# Открываем порт (по умолчанию 3000, можно переопределить через ENV)
EXPOSE 3000

# Переменные окружения (можно переопределить при запуске)
ENV PORT=3000
ENV HOST=0.0.0.0

# Healthcheck для проверки работоспособности контейнера
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/health || exit 1

# Запуск приложения
CMD ["node", "index.js"]