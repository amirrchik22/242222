# Google Apps Script Setup

## 1) Формат таблицы Google Sheets
Создай лист `Access` (или оставь первый лист). Обязательные колонки:

- `platform_id`
- `access` (`yes` или `no`)

Скрипт автоматически добавит и будет заполнять:

- `progress_json`
- `current_lesson_id`
- `progress_percent`
- `updated_at`

## 2) Публикация Apps Script
1. Открой [script.google.com](https://script.google.com), создай проект.
2. Вставь код из [Code.gs](./Code.gs).
3. Привяжи нужную таблицу Google Sheets.
4. Нажми `Deploy` -> `New deployment` -> `Web app`.
5. Execute as: `Me`.
6. Who has access: `Anyone with the link`.
7. Скопируй URL вида:
   `https://script.google.com/macros/s/AKfycb.../exec`

## 3) Подключение в сайт
Вставь URL в [demo-config.js](../demo-config.js):

```js
window.DEMO_CONFIG = {
  apiBaseUrl: "https://script.google.com/macros/s/AKfycb.../exec",
  requestTimeoutMs: 15000
};
```

## 4) Как работает прогресс
- При входе `demo.html?platform_id=...` сайт проверяет доступ в таблице.
- Если `access = yes`, открывается курс.
- Если `access = no` или ID не найден, показывается экран без доступа.
- При клике `Отметить пройденным` прогресс сразу отправляется в таблицу:
  - список пройденных уроков,
  - текущий урок,
  - процент прогресса.
- При снятии отметки урок удаляется из прогресса в таблице.
- При следующем входе платформа читает данные и открывает пользователя на том уроке, где он остановился.
