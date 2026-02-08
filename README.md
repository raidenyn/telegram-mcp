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

## Подключение к Claude Code / Claude Desktop

### Claude Code

```bash
claude mcp add telegram-mcp -- node /path/to/telegram-mcp-server/dist/index.js
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
- Транспорт stdio — сервер не открывает сетевых портов
- Медицинские данные хранятся только локально
