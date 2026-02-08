# Telegram MCP Server

MCP-сервер для извлечения истории чатов Telegram, включая текстовые сообщения, фото и документы. Использует GramJS (MTProto userbot) для полного доступа к личным чатам.

## Требования

- Node.js 18+
- Telegram API credentials ([my.telegram.org](https://my.telegram.org))

## Установка

```bash
npm install
cp .env.example .env
# Заполнить TELEGRAM_API_ID и TELEGRAM_API_HASH в .env
```

## Первый запуск — аутентификация

```bash
npm run auth
```

Введи номер телефона → код из Telegram → пароль 2FA (если есть).
Сессия сохранится в `telegram.session`.

## Сборка и запуск

```bash
npm run build
npm start
```

## Транспорты

Сервер поддерживает два режима работы, выбираемых переменной `TRANSPORT`:

| Переменная | Значение | Описание |
|---|---|---|
| `TRANSPORT=stdio` | по умолчанию | Локальный запуск через stdin/stdout, авторизация не нужна (процесс изолирован) |
| `TRANSPORT=http` | сетевой режим | HTTP-сервер на порту `PORT` (по умолчанию 3000), требуется `AUTH_TOKEN` |

### stdio (по умолчанию)

Сервер общается с клиентом через stdin/stdout. Безопасность обеспечивается изоляцией процесса — доступ имеет только тот, кто его запустил.

### HTTP с Bearer token авторизацией

Для сетевого доступа (например, сервер на удалённой машине). Каждый запрос должен содержать заголовок:

```
Authorization: Bearer <ваш_токен>
```

Без валидного токена сервер вернёт `401 Unauthorized`.

Сгенерировать токен:

```bash
node -e "console.log(crypto.randomUUID())"
```

Настроить в `.env`:

```bash
TRANSPORT=http
PORT=3000
AUTH_TOKEN=ваш-секретный-токен
```

## Подключение к Claude Code / Claude Desktop

### Claude Code — stdio (локально)

```bash
claude mcp add telegram-mcp -- node /path/to/telegram-mcp-server/dist/index.js
```

### Claude Code — HTTP (удалённый сервер)

```bash
claude mcp add telegram-mcp \
  --transport http \
  --url http://your-server:3000/mcp \
  --header "Authorization: Bearer ваш-секретный-токен"
```

### Claude Desktop (config)

```json
{
  "mcpServers": {
    "telegram": {
      "command": "node",
      "args": ["/path/to/telegram-mcp-server/dist/index.js"],
      "env": {
        "TELEGRAM_API_ID": "your_id",
        "TELEGRAM_API_HASH": "your_hash",
        "TELEGRAM_SESSION_PATH": "/path/to/telegram.session",
        "DATA_DIR": "/path/to/data"
      }
    }
  }
}
```

## Docker

### Сборка

```bash
docker build -t telegram-mcp .
```

### Запуск — stdio

```bash
docker run --rm -i \
  -e TELEGRAM_API_ID=12345 \
  -e TELEGRAM_API_HASH=abc123 \
  -v ./telegram.session:/app/telegram.session \
  -v ./data:/app/data \
  telegram-mcp
```

### Запуск — HTTP с авторизацией

```bash
docker run -d \
  -e TRANSPORT=http \
  -e AUTH_TOKEN=ваш-секретный-токен \
  -e TELEGRAM_API_ID=12345 \
  -e TELEGRAM_API_HASH=abc123 \
  -v ./telegram.session:/app/telegram.session \
  -v ./data:/app/data \
  -p 3000:3000 \
  telegram-mcp
```

## Инструменты (Tools)

| Tool | Описание |
|------|----------|
| `telegram_list_chats` | Список всех чатов |
| `telegram_find_chat` | Поиск чата по имени/username/ID |
| `telegram_get_history` | Получить сообщения (без скачивания медиа) |
| `telegram_sync_chat` | **Основной** — полная синхронизация чата с медиа |
| `telegram_download_media` | Скачать медиа из конкретного сообщения |
| `telegram_sync_status` | Статус последней синхронизации |
| `telegram_list_media` | Список скачанных медиафайлов |

## Типичный workflow

```
1. telegram_find_chat("Мама")           → получаем chat_id
2. telegram_sync_chat(chat_id)          → скачиваем всё
3. telegram_list_media(chat_id, "photo") → список фотографий
4. Загружаем файлы из data/raw/{chat_id}/media/ в Claude для анализа
```

Через 2 недели:
```
telegram_sync_chat(chat_id)  → скачает только новые сообщения
```

## Структура данных

```
data/
└── raw/
    └── {chat_id}/
        ├── messages.json      # все сообщения
        ├── media_index.json   # индекс медиафайлов
        ├── sync_state.json    # состояние синхронизации
        └── media/             # скачанные файлы
            ├── photo_123.jpg
            ├── doc_456.pdf
            └── ...
```

## Безопасность

- Сессия Telegram хранится в файле (добавлен в .gitignore)
- API credentials в .env (добавлен в .gitignore)
- HTTP транспорт защищён Bearer token авторизацией
- Данные хранятся только локально
