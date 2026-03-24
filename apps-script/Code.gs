const SHEET_NAME = "Access";
const REQUIRED_HEADERS = [
  "platform_id",
  "access",
  "progress_json",
  "current_lesson_id",
  "progress_percent",
  "updated_at"
];

function doGet(e) {
  try {
    const action = String((e && e.parameter && e.parameter.action) || "bootstrap").toLowerCase();

    if (action === "bootstrap") {
      const platformId = String((e && e.parameter && e.parameter.platform_id) || "").trim();
      return jsonResponse_(handleBootstrap_(platformId));
    }

    return jsonResponse_({
      ok: false,
      message: "Unknown action"
    });
  } catch (error) {
    return jsonResponse_({
      ok: false,
      message: String(error)
    });
  }
}

function doPost(e) {
  try {
    const payload = parsePostPayload_(e);
    const action = String(payload.action || "").toLowerCase();

    if (action === "saveprogress") {
      return jsonResponse_(handleSaveProgress_(payload));
    }

    return jsonResponse_({
      ok: false,
      message: "Unknown action"
    });
  } catch (error) {
    return jsonResponse_({
      ok: false,
      message: String(error)
    });
  }
}

function handleBootstrap_(platformId) {
  if (!platformId) {
    return {
      ok: false,
      access: false,
      message: "platform_id is required"
    };
  }

  const ctx = getSheetContext_();
  const rowIndex = findRowByPlatformId_(ctx.sheet, ctx.map, platformId);
  if (!rowIndex) {
    return {
      ok: true,
      access: false,
      message: "Platform not found"
    };
  }

  const accessRaw = ctx.sheet.getRange(rowIndex, ctx.map.access).getValue();
  const access = normalizeAccess_(accessRaw);
  const progressRaw = ctx.sheet.getRange(rowIndex, ctx.map.progress_json).getValue();
  const completedLessons = access ? parseProgress_(progressRaw) : [];
  const currentLessonId = access
    ? String(ctx.sheet.getRange(rowIndex, ctx.map.current_lesson_id).getValue() || "").trim()
    : "";
  const progressPercent = access
    ? Number(ctx.sheet.getRange(rowIndex, ctx.map.progress_percent).getValue() || 0)
    : 0;

  return {
    ok: true,
    access: access,
    platform_id: platformId,
    completed_lessons: completedLessons,
    current_lesson_id: currentLessonId,
    last_lesson_id: currentLessonId,
    progress_json: progressRaw || "",
    progress_percent: progressPercent
  };
}

function handleSaveProgress_(payload) {
  const platformId = String(payload.platform_id || "").trim();
  if (!platformId) {
    return {
      ok: false,
      message: "platform_id is required"
    };
  }

  const ctx = getSheetContext_();
  const rowIndex = findRowByPlatformId_(ctx.sheet, ctx.map, platformId);
  if (!rowIndex) {
    return {
      ok: false,
      access: false,
      message: "Platform not found"
    };
  }

  const accessRaw = ctx.sheet.getRange(rowIndex, ctx.map.access).getValue();
  const access = normalizeAccess_(accessRaw);
  if (!access) {
    return {
      ok: false,
      access: false,
      message: "Access denied"
    };
  }

  const completed = normalizeCompletedLessons_(
    payload.completed_lessons || payload.completedLessons || []
  );
  const currentLessonId = String(
    payload.current_lesson_id || payload.currentLessonId || ""
  ).trim();
  const progressPercent = Number(payload.progress_percent || payload.progressPercent || 0);
  const progressValue = JSON.stringify({
    completed_lessons: completed,
    current_lesson_id: currentLessonId,
    progress_percent: progressPercent
  });
  ctx.sheet.getRange(rowIndex, ctx.map.progress_json).setValue(progressValue);
  ctx.sheet.getRange(rowIndex, ctx.map.current_lesson_id).setValue(currentLessonId);
  ctx.sheet.getRange(rowIndex, ctx.map.progress_percent).setValue(progressPercent);
  ctx.sheet.getRange(rowIndex, ctx.map.updated_at).setValue(new Date());

  return {
    ok: true,
    access: true,
    saved_lessons: completed.length,
    current_lesson_id: currentLessonId,
    progress_percent: progressPercent
  };
}

function getSheetContext_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.getSheets()[0];
  ensureHeaders_(sheet);

  const headerValues = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const map = {};
  for (let i = 0; i < headerValues.length; i++) {
    const key = String(headerValues[i] || "").trim().toLowerCase();
    if (key) {
      map[key] = i + 1;
    }
  }

  return { sheet: sheet, map: map };
}

function ensureHeaders_(sheet) {
  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  const values = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  const normalized = values.map(function(value) {
    return String(value || "").trim().toLowerCase();
  });

  const missing = REQUIRED_HEADERS.filter(function(header) {
    return normalized.indexOf(header) === -1;
  });

  if (missing.length) {
    const startCol = normalized.filter(Boolean).length + 1;
    sheet.getRange(1, startCol, 1, missing.length).setValues([missing]);
  }
}

function findRowByPlatformId_(sheet, map, platformId) {
  const platformCol = map.platform_id;
  if (!platformCol) return 0;

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  const values = sheet.getRange(2, platformCol, lastRow - 1, 1).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0] || "").trim() === platformId) {
      return i + 2;
    }
  }
  return 0;
}

function normalizeAccess_(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "yes" || normalized === "true" || normalized === "1";
}

function parseProgress_(value) {
  if (!value) return [];

  try {
    const parsed = JSON.parse(String(value));
    if (Array.isArray(parsed)) {
      return normalizeCompletedLessons_(parsed);
    }
    return normalizeCompletedLessons_(
      parsed.completed_lessons || parsed.completedLessons || []
    );
  } catch (error) {
    return [];
  }
}

function normalizeCompletedLessons_(input) {
  if (!Array.isArray(input)) return [];
  const unique = {};
  const result = [];

  input.forEach(function(item) {
    const id = String(item || "").trim();
    if (!id) return;
    if (unique[id]) return;
    unique[id] = true;
    result.push(id);
  });

  return result;
}

function parsePostPayload_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    return {};
  }

  const raw = String(e.postData.contents || "").trim();
  if (!raw) return {};

  return JSON.parse(raw);
}

function jsonResponse_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON
  );
}
