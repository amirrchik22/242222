# Курс Pro Photo

## Запуск
- Открывай: `demo.html?platform_id=934505415`
- `index.html` автоматически перенаправляет на `demo.html`

## Подключение Google Sheets
1. Настрой Apps Script по инструкции: [apps-script/README.md](./apps-script/README.md)
2. Вставь URL web app в [demo-config.js](./demo-config.js)

## Пересборка структуры курса из Telegram экспорта
Скрипт:
- [scripts/build-course-data.ps1](./scripts/build-course-data.ps1)

Запуск:
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-course-data.ps1
```

Скрипт:
- берет `messages.html` из `ChatExport_2026-03-24 (1)`,
- группирует фото/доп.материалы в уроки,
- нормализует названия уроков,
- формирует [course-data.js](./course-data.js) для `demo.html`.
