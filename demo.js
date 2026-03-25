(() => {
  "use strict";

  const data = window.COURSE_DATA;
  const config = window.DEMO_CONFIG || {};

  if (!data || !Array.isArray(data.lessons) || !Array.isArray(data.sections)) {
    return;
  }

  const SUPPORT_URL = "https://t.me/das8ash";
  const CHAT_URL = String(config.chatUrl || "https://t.me/+npNA7tqyVyMyMDcy").trim();

  const el = {
    bootLoader: document.getElementById("bootLoader"),
    bootBar: document.getElementById("bootBar"),
    bootStatus: document.getElementById("bootStatus"),
    deniedScreen: document.getElementById("deniedScreen"),
    deniedText: document.getElementById("deniedText"),
    app: document.getElementById("app"),
    courseTitle: document.getElementById("courseTitle"),
    platformIdLabel: document.getElementById("platformIdLabel"),
    sectionList: document.getElementById("sectionList"),
    activeSectionTitle: document.getElementById("activeSectionTitle"),
    activeSectionSubtitle: document.getElementById("activeSectionSubtitle"),
    lessonRail: document.getElementById("lessonRail"),
    postFeed: document.getElementById("postFeed"),
    globalProgressCircle: document.getElementById("globalProgressCircle"),
    globalProgressText: document.getElementById("globalProgressText"),
    globalProgressDone: document.getElementById("globalProgressDone"),
    globalProgressTotal: document.getElementById("globalProgressTotal"),
    chatLink: document.getElementById("chatLink"),
    supportLink: document.getElementById("supportLink"),
    photoModal: document.getElementById("photoModal"),
    modalImage: document.getElementById("modalImage"),
    closeModalBtn: document.getElementById("closeModalBtn"),
    modalPrevBtn: document.getElementById("modalPrevBtn"),
    modalNextBtn: document.getElementById("modalNextBtn"),
    modalCounter: document.getElementById("modalCounter")
  };

  const platformId = (new URLSearchParams(window.location.search).get("platform_id") || "").trim();
  const apiBaseUrl = String(config.apiBaseUrl || "").trim();
  const requestTimeoutMs = Number(config.requestTimeoutMs || 15000);
  const localStorageKey = `course_progress_${platformId || "unknown"}`;

  const lessons = data.lessons
    .slice()
    .map((lesson, index) => ({
      ...lesson,
      id: String(lesson.id || `lesson-${index + 1}`),
      order: Number(lesson.order || index + 1),
      sectionId: String(lesson.sectionId || ""),
      content: String(lesson.content || ""),
      title: normalizeLessonTitle(String(lesson.title || "")),
      timeLabel: String(lesson.timeLabel || ""),
      videoFiles: Array.isArray(lesson.videoFiles) ? lesson.videoFiles : [],
      photoFiles: Array.isArray(lesson.photoFiles) ? lesson.photoFiles : [],
      stickerFiles: Array.isArray(lesson.stickerFiles) ? lesson.stickerFiles : [],
      links: Array.isArray(lesson.links) ? lesson.links : []
    }))
    .sort((a, b) => a.order - b.order);

  const sections = data.sections.map((section) => ({
    ...section,
    id: String(section.id),
    title: String(section.title || "Раздел"),
    subtitle: String(section.subtitle || ""),
    lessons: lessons.filter((lesson) => lesson.sectionId === section.id)
  }));

  const lessonIndexMap = new Map(lessons.map((lesson, index) => [lesson.id, index]));

  const state = {
    completed: new Set(),
    selectedSectionId: sections[0]?.id || null,
    currentLessonId: lessons[0]?.id || null,
    loaderTimer: null,
    syncTimer: null,
    modalPhotos: [],
    modalIndex: 0,
    touchStartX: null,
    touchStartY: null,
    inlinePhotoIndexByLesson: Object.create(null)
  };

  function setBootProgress(value, statusText) {
    el.bootBar.style.width = `${Math.max(0, Math.min(100, value))}%`;
    if (statusText) {
      el.bootStatus.textContent = statusText;
    }
  }

  function startLoader() {
    let progress = 10;
    setBootProgress(progress, "Проверяем доступ...");
    state.loaderTimer = setInterval(() => {
      progress = Math.min(progress + Math.random() * 9, 82);
      setBootProgress(progress);
    }, 230);
  }

  function stopLoader() {
    if (state.loaderTimer) {
      clearInterval(state.loaderTimer);
      state.loaderTimer = null;
    }
  }

  function showDenied(message) {
    stopLoader();
    setBootProgress(100, "Проверка завершена");
    el.bootLoader.classList.add("hidden");
    el.deniedText.innerHTML = `${message}<br><a href="${SUPPORT_URL}" target="_blank" rel="noopener noreferrer">Обратиться в поддержку</a>`;
    el.deniedScreen.classList.remove("hidden");
  }

  function showApp() {
    stopLoader();
    setBootProgress(100, "Готово");
    setTimeout(() => {
      el.bootLoader.classList.add("hidden");
      el.app.classList.remove("hidden");
    }, 140);
  }

  function normalizeCompleted(list) {
    if (!Array.isArray(list)) return [];
    const allowed = new Set(lessons.map((lesson) => lesson.id));
    return list
      .map((item) => String(item).trim())
      .filter((id) => id && allowed.has(id));
  }

  function normalizeLessonId(value) {
    const id = String(value || "").trim();
    if (!id) return "";
    return lessons.some((lesson) => lesson.id === id) ? id : "";
  }

  function loadLocalProgress() {
    try {
      const parsed = JSON.parse(localStorage.getItem(localStorageKey) || "[]");
      return normalizeCompleted(parsed);
    } catch {
      return [];
    }
  }

  function saveLocalProgress() {
    localStorage.setItem(localStorageKey, JSON.stringify([...state.completed]));
  }

  async function fetchWithTimeout(url, options) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs);

    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  async function checkAccessAndLoadProgress() {
    if (!platformId || !apiBaseUrl) {
      return { access: false, message: "Нет доступа, обратитесь в поддержку." };
    }

    const url = `${apiBaseUrl}?action=bootstrap&platform_id=${encodeURIComponent(platformId)}&t=${Date.now()}`;

    const response = await fetchWithTimeout(url, { method: "GET" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    const accessRaw = String(payload.access || "").toLowerCase();
    const access = payload.access === true || accessRaw === "yes" || accessRaw === "true";

    let completedSource = payload.completed_lessons || payload.completedLessons || [];
    if (!Array.isArray(completedSource) && payload.progress_json) {
      try {
        const parsedProgress = JSON.parse(String(payload.progress_json));
        completedSource = Array.isArray(parsedProgress)
          ? parsedProgress
          : parsedProgress?.completed_lessons || parsedProgress?.completedLessons || [];
      } catch {
        completedSource = [];
      }
    }

    const completedLessons = normalizeCompleted(completedSource);
    const currentLessonId = normalizeLessonId(
      payload.current_lesson_id || payload.currentLessonId || payload.last_lesson_id || ""
    );

    return {
      access,
      message: String(payload.message || ""),
      completedLessons,
      currentLessonId
    };
  }

  function globalProgress() {
    const total = lessons.length;
    const done = lessons.filter((lesson) => state.completed.has(lesson.id)).length;
    const percent = total ? Math.round((done / total) * 100) : 0;
    return { total, done, percent };
  }

  function sectionProgress(section) {
    const total = section.lessons.length;
    const done = section.lessons.filter((lesson) => state.completed.has(lesson.id)).length;
    const percent = total ? Math.round((done / total) * 100) : 0;
    return { total, done, percent };
  }

  function findLesson(lessonId) {
    return lessons.find((lesson) => lesson.id === lessonId) || null;
  }

  function findSectionByLesson(lessonId) {
    const lesson = findLesson(lessonId);
    if (!lesson) return null;
    return sections.find((section) => section.id === lesson.sectionId) || null;
  }

  function inferCurrentLessonId() {
    const firstNotDone = lessons.find((lesson) => !state.completed.has(lesson.id));
    if (firstNotDone) return firstNotDone.id;
    return lessons[lessons.length - 1]?.id || lessons[0]?.id || null;
  }

  function queueSync() {
    if (state.syncTimer) {
      clearTimeout(state.syncTimer);
    }
    state.syncTimer = setTimeout(() => {
      syncProgress();
    }, 260);
  }

  async function syncProgress() {
    if (!apiBaseUrl || !platformId) return;

    const progress = globalProgress();
    const body = {
      action: "saveProgress",
      platform_id: platformId,
      completed_lessons: [...state.completed],
      current_lesson_id: state.currentLessonId,
      progress_percent: progress.percent
    };

    try {
      await fetchWithTimeout(apiBaseUrl, {
        method: "POST",
        body: JSON.stringify(body)
      });
    } catch (error) {
      console.warn("Sync failed:", error);
    }
  }

  function syncProgressNow() {
    syncProgress();
  }

  function setCurrentLesson(lessonId, shouldSync = true) {
    const normalized = normalizeLessonId(lessonId);
    if (!normalized) return;

    state.currentLessonId = normalized;
    const section = findSectionByLesson(normalized);
    if (section) {
      state.selectedSectionId = section.id;
    }

    if (shouldSync) {
      queueSync();
    }
  }

  function toggleLessonDone(lessonId) {
    setCurrentLesson(lessonId, false);

    if (state.completed.has(lessonId)) {
      state.completed.delete(lessonId);
    } else {
      state.completed.add(lessonId);
    }

    saveLocalProgress();
    syncProgressNow();
    render();
  }

  function getNeighborLesson(lessonId, step) {
    const index = lessonIndexMap.get(lessonId);
    if (typeof index !== "number") return null;
    const targetIndex = index + step;
    if (targetIndex < 0 || targetIndex >= lessons.length) return null;
    return lessons[targetIndex] || null;
  }

  function getSelectedSection() {
    return sections.find((section) => section.id === state.selectedSectionId) || sections[0] || null;
  }

  function ensureCurrentContext() {
    let lesson = findLesson(state.currentLessonId);
    let section = lesson ? findSectionByLesson(lesson.id) : null;

    if (!section) {
      section = getSelectedSection();
    }

    if (!section) {
      return { section: null, lesson: null };
    }

    state.selectedSectionId = section.id;

    if (!lesson || lesson.sectionId !== section.id) {
      lesson = section.lessons.find((item) => !state.completed.has(item.id)) || section.lessons[0] || null;
      if (lesson) {
        state.currentLessonId = lesson.id;
      }
    }

    return { section, lesson };
  }

  function normalizeLessonTitle(rawTitle) {
    return String(rawTitle || "")
      .replace(/^[\s\u2600-\u27BF\u{1F300}-\u{1FAFF}\u{1F1E6}-\u{1F1FF}\u200D\uFE0F]+/gu, "")
      .replace(/^[\s\-–—•·]+/u, "")
      .trim();
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatLessonInline(rawLine) {
    let html = escapeHtml(rawLine);

    html = html.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/__([^_\n]+)__/g, "<u>$1</u>");
    html = html.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
    html = html.replace(/«([^»\n]+)»/g, "«<em>$1</em>»");
    html = html.replace(/(⚠️\s*Важно:?)/giu, "<u><strong>$1</strong></u>");
    html = html.replace(/(^|\s)([1-9]\d*️⃣?)(?=\s|$)/gu, "$1<strong>$2</strong>");

    const badTokens = [];
    html = html.replace(/неправильно|ошибк[а-я]*/giu, (match) => {
      const token = `@@BAD_${badTokens.length}@@`;
      badTokens.push(match);
      return token;
    });

    html = html.replace(/правильно|верно/giu, '<span class="inline-good">$&</span>');
    html = html.replace(/@@BAD_(\d+)@@/g, (_, idx) => `<span class="inline-bad">${badTokens[Number(idx)]}</span>`);

    html = html.replace(
      /(https?:\/\/[^\s<]+)/gi,
      '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
    );

    return html;
  }

  function detectLessonLineTone(line, currentTone) {
    const value = String(line || "").trim();
    if (!value) return "neutral";

    if (/^⚠️/u.test(value) || /важно/iu.test(value)) {
      return "warning";
    }

    if (/^❌/u.test(value) || /ошибк|неправильно|не продающ|избег/iu.test(value)) {
      return "bad";
    }

    if (/^✅/u.test(value) || /как правильно|правильно|верно|рекоменд|лучше/iu.test(value)) {
      return "good";
    }

    if (/^[-—–•]/u.test(value) && (currentTone === "good" || currentTone === "bad")) {
      return currentTone;
    }

    return "neutral";
  }

  function renderLessonTextContent(rawContent) {
    const lines = String(rawContent || "").replace(/\r/g, "").split("\n");
    let contextTone = "neutral";

    return lines
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed) {
          contextTone = "neutral";
          return '<p class="lesson-line spacer" aria-hidden="true"></p>';
        }

        const classes = ["lesson-line"];
        const isHeading = /^[💎🔹📌✨🎯💬⚠️]/u.test(trimmed) || /:\s*$/u.test(trimmed);
        const tone = detectLessonLineTone(trimmed, contextTone);

        if (isHeading) {
          classes.push("heading");
        }

        if (tone === "good") {
          classes.push("good");
          contextTone = "good";
        } else if (tone === "bad") {
          classes.push("bad");
          contextTone = "bad";
        } else if (tone === "warning") {
          classes.push("warning");
          contextTone = "warning";
        } else if (!/^[-—–•]/u.test(trimmed)) {
          contextTone = "neutral";
        }

        const normalizedLine = trimmed.replace(/^[-—–]\s*/u, "• ");
        return `<p class="${classes.join(" ")}">${formatLessonInline(normalizedLine)}</p>`;
      })
      .join("");
  }

  function trimTitle(title, max = 62) {
    const value = String(title || "").trim();
    if (!value) return "";
    if (value.length <= max) return value;
    return value.slice(0, max).trim() + "…";
  }

  function getInlinePhotoIndex(lesson) {
    const total = lesson.photoFiles.length;
    if (!total) return 0;

    const raw = Number(state.inlinePhotoIndexByLesson[lesson.id] || 0);
    if (!Number.isFinite(raw)) return 0;
    if (raw < 0) return 0;
    if (raw >= total) return total - 1;
    return raw;
  }

  function setInlinePhotoIndex(lessonId, index, total) {
    const safe = Math.max(0, Math.min(index, total - 1));
    state.inlinePhotoIndexByLesson[lessonId] = safe;
  }

  function renderModalPhoto() {
    if (!state.modalPhotos.length) return;
    const safeIndex = Math.max(0, Math.min(state.modalIndex, state.modalPhotos.length - 1));
    state.modalIndex = safeIndex;

    const currentPath = state.modalPhotos[state.modalIndex];
    el.modalImage.src = currentPath;
    el.modalCounter.textContent = `${state.modalIndex + 1} / ${state.modalPhotos.length}`;
    el.modalPrevBtn.disabled = state.modalIndex === 0;
    el.modalNextBtn.disabled = state.modalIndex === state.modalPhotos.length - 1;
  }

  function openPhotoGallery(photos, startIndex = 0) {
    if (!Array.isArray(photos) || !photos.length) return;
    state.modalPhotos = photos.slice();
    state.modalIndex = Math.max(0, Math.min(startIndex, photos.length - 1));
    renderModalPhoto();
    el.photoModal.classList.remove("hidden");
  }

  function goModal(step) {
    if (!state.modalPhotos.length) return;
    const nextIndex = state.modalIndex + step;
    if (nextIndex < 0 || nextIndex >= state.modalPhotos.length) return;
    state.modalIndex = nextIndex;
    renderModalPhoto();
  }

  function closePhoto() {
    el.photoModal.classList.add("hidden");
    el.modalImage.src = "";
    state.modalPhotos = [];
    state.modalIndex = 0;
    state.touchStartX = null;
    state.touchStartY = null;
  }

  function toKinescopeEmbedUrl(rawUrl) {
    try {
      const parsed = new URL(String(rawUrl || "").trim(), window.location.href);
      if (!/(^|\.)kinescope\.io$/i.test(parsed.hostname)) {
        return "";
      }

      const parts = parsed.pathname.split("/").filter(Boolean);
      if (!parts.length) return "";

      const id = parts[0] === "embed" ? parts[1] : parts[0];
      if (!id) return "";

      return `https://kinescope.io/embed/${id}`;
    } catch {
      return "";
    }
  }

  function buildVideoStage(lesson) {
    if (!lesson.videoFiles.length) return null;

    const wrap = document.createElement("section");
    wrap.className = `video-stage${lesson.videoFiles.length > 1 ? " multi" : ""}`;

    lesson.videoFiles.forEach((path, index) => {
      const source = String(path || "").trim();
      if (!source) return;

      const card = document.createElement("div");
      card.className = "video-card";

      const label = document.createElement("span");
      label.className = "media-label";
      label.textContent = lesson.videoFiles.length > 1 ? `Видео ${index + 1}` : "Видео";

      const kinescopeEmbed = toKinescopeEmbedUrl(source);
      if (kinescopeEmbed) {
        const frame = document.createElement("iframe");
        frame.src = kinescopeEmbed;
        frame.loading = "lazy";
        frame.title = lesson.videoFiles.length > 1 ? `Видео ${index + 1}` : "Видео урока";
        frame.allow =
          "autoplay; fullscreen; picture-in-picture; encrypted-media; gyroscope; accelerometer; clipboard-write";
        frame.setAttribute("allowfullscreen", "true");
        frame.referrerPolicy = "strict-origin-when-cross-origin";
        card.append(label, frame);
      } else {
        const video = document.createElement("video");
        video.controls = true;
        video.preload = "metadata";
        video.playsInline = true;
        video.src = source;
        card.append(label, video);
      }

      wrap.append(card);
    });

    return wrap;
  }

  function buildPhotoStage(lesson) {
    if (!lesson.photoFiles.length) return null;

    const photos = lesson.photoFiles;
    const stage = document.createElement("section");
    stage.className = "photo-stage";

    const frame = document.createElement("div");
    frame.className = "photo-frame";

    const mainButton = document.createElement("button");
    mainButton.type = "button";
    mainButton.className = "photo-main-btn";

    const mainImage = document.createElement("img");
    mainImage.loading = "lazy";

    const counter = document.createElement("div");
    counter.className = "inline-photo-counter";

    const prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.className = "photo-stage-nav photo-stage-prev";
    prevBtn.textContent = "‹";
    prevBtn.setAttribute("aria-label", "Предыдущее фото");

    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "photo-stage-nav photo-stage-next";
    nextBtn.textContent = "›";
    nextBtn.setAttribute("aria-label", "Следующее фото");

    const thumbs = document.createElement("div");
    thumbs.className = "photo-thumbs";

    const thumbButtons = photos.map((path, index) => {
      const thumb = document.createElement("button");
      thumb.type = "button";
      thumb.className = "photo-thumb";

      const img = document.createElement("img");
      img.loading = "lazy";
      img.src = path;
      img.alt = `${lesson.title || "Фото"} ${index + 1}`;

      thumb.append(img);
      thumb.addEventListener("click", (event) => {
        event.stopPropagation();
        setInlinePhotoIndex(lesson.id, index, photos.length);
        updateInline();
      });

      thumbs.append(thumb);
      return thumb;
    });

    function updateInline() {
      const index = getInlinePhotoIndex(lesson);
      const src = photos[index];
      mainImage.src = src;
      mainImage.alt = `${lesson.title || "Фото"} ${index + 1}`;
      counter.textContent = `${index + 1} / ${photos.length}`;
      prevBtn.disabled = index === 0;
      nextBtn.disabled = index === photos.length - 1;
      thumbButtons.forEach((button, buttonIndex) => {
        button.classList.toggle("active", buttonIndex === index);
      });
    }

    mainButton.addEventListener("click", (event) => {
      event.stopPropagation();
      openPhotoGallery(photos, getInlinePhotoIndex(lesson));
    });

    prevBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      const index = getInlinePhotoIndex(lesson);
      if (index <= 0) return;
      setInlinePhotoIndex(lesson.id, index - 1, photos.length);
      updateInline();
    });

    nextBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      const index = getInlinePhotoIndex(lesson);
      if (index >= photos.length - 1) return;
      setInlinePhotoIndex(lesson.id, index + 1, photos.length);
      updateInline();
    });

    mainButton.append(mainImage);
    frame.append(mainButton, counter);

    if (photos.length > 1) {
      frame.append(prevBtn, nextBtn);
    }

    stage.append(frame);
    if (photos.length > 1) {
      stage.append(thumbs);
    }

    updateInline();
    return stage;
  }

  function buildStickerStage(lesson) {
    if (!lesson.stickerFiles.length) return null;

    const wrap = document.createElement("section");
    wrap.className = "sticker-stage";

    lesson.stickerFiles.forEach((path) => {
      const img = document.createElement("img");
      img.loading = "lazy";
      img.src = path;
      img.alt = "Стикер";
      wrap.append(img);
    });

    return wrap;
  }

  function buildLinks(lesson) {
    if (!lesson.links.length) return null;

    const list = document.createElement("ul");
    list.className = "links-list";

    lesson.links.forEach((url) => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = url;
      li.append(a);
      list.append(li);
    });

    return list;
  }

  function renderTopProgress() {
    const progress = globalProgress();

    el.globalProgressText.textContent = `${progress.percent}%`;
    el.globalProgressDone.textContent = `${progress.done}`;
    el.globalProgressTotal.textContent = `${progress.total}`;

    const ring = el.globalProgressCircle;
    if (!ring) return;

    const radius = Number(ring.getAttribute("r")) || 54;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference * (1 - progress.percent / 100);

    ring.style.strokeDasharray = `${circumference}`;
    ring.style.strokeDashoffset = `${offset}`;
  }

  function renderSections() {
    el.sectionList.innerHTML = "";

    sections.forEach((section) => {
      if (!section.lessons.length) return;

      const progress = sectionProgress(section);
      const isActive = section.id === state.selectedSectionId;

      const card = document.createElement("button");
      card.type = "button";
      card.className = `section-item${isActive ? " active" : ""}`;
      card.innerHTML = `
        <strong>${section.title}</strong>
        <span>${section.subtitle || "Раздел курса"}</span>
        <div class="section-meta">
          <span>${progress.done}/${progress.total}</span>
          <span>${progress.percent}%</span>
        </div>
        <div class="section-progress progress-track small">
          <div class="progress-fill" style="width:${progress.percent}%"></div>
        </div>
      `;

      card.addEventListener("click", () => {
        state.selectedSectionId = section.id;
        const currentInside = section.lessons.some((item) => item.id === state.currentLessonId);
        const target = currentInside
          ? findLesson(state.currentLessonId)
          : section.lessons.find((item) => !state.completed.has(item.id)) || section.lessons[0] || null;

        if (target) {
          setCurrentLesson(target.id, true);
          render();
          setTimeout(() => scrollToCurrentPost(true), 10);
        }
      });

      el.sectionList.append(card);
    });
  }

  function renderLessonRail(section, currentLesson) {
    el.lessonRail.innerHTML = "";

    if (!section || !section.lessons.length) {
      return;
    }

    const railTitle = document.createElement("h4");
    railTitle.className = "lesson-rail-title";
    railTitle.textContent = "Уроки раздела";

    const railGrid = document.createElement("div");
    railGrid.className = "lesson-rail-grid";

    section.lessons.forEach((lesson, index) => {
      const done = state.completed.has(lesson.id);
      const current = currentLesson && lesson.id === currentLesson.id;
      const sectionOrder = index + 1;

      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = `lesson-chip${current ? " current" : ""}${done ? " done" : ""}`;
      chip.innerHTML = `
        <span class="chip-number">${sectionOrder}</span>
        <span class="chip-mobile-title">${sectionOrder} урок</span>
        <span class="chip-title">${trimTitle(lesson.title || `Урок ${sectionOrder}`, 58)}</span>
      `;

      chip.addEventListener("click", () => {
        setCurrentLesson(lesson.id);
        render();
        setTimeout(() => scrollToCurrentPost(true), 10);
      });

      railGrid.append(chip);
    });

    el.lessonRail.append(railTitle, railGrid);
  }

  function renderLessonStage(section, lesson) {
    el.postFeed.innerHTML = "";

    if (!section || !lesson) {
      return;
    }

    const done = state.completed.has(lesson.id);
    const prevLesson = getNeighborLesson(lesson.id, -1);
    const nextLesson = getNeighborLesson(lesson.id, 1);

    el.activeSectionTitle.textContent = `${section.title} · Урок ${lesson.order}`;
    el.activeSectionSubtitle.textContent = lesson.title || section.subtitle || "";

    const stage = document.createElement("article");
    stage.className = "lesson-stage";
    stage.id = `post-${lesson.id}`;

    const head = document.createElement("header");
    head.className = "lesson-stage-head";
    head.innerHTML = `
      <span class="lesson-badge">${section.title}</span>
      <span class="lesson-time">${lesson.timeLabel || ""}</span>
    `;

    const title = document.createElement("h4");
    title.className = "lesson-title";
    title.textContent = lesson.title || `Урок ${lesson.order}`;

    const meta = document.createElement("p");
    meta.className = "lesson-meta";
    meta.textContent = done
      ? "Урок отмечен как пройденный"
      : "Пройдите урок и отметьте его как завершенный";

    stage.append(head, title, meta);

    const videoStage = buildVideoStage(lesson);
    if (videoStage) stage.append(videoStage);

    const photoStage = buildPhotoStage(lesson);
    if (photoStage) stage.append(photoStage);

    const stickerStage = buildStickerStage(lesson);
    if (stickerStage) stage.append(stickerStage);

    if (lesson.content) {
      const text = document.createElement("div");
      text.className = "lesson-text";
      text.innerHTML = renderLessonTextContent(lesson.content);
      stage.append(text);
    }

    const links = buildLinks(lesson);
    if (links) stage.append(links);

    const controls = document.createElement("div");
    controls.className = "lesson-controls";

    const prevButton = document.createElement("button");
    prevButton.type = "button";
    prevButton.className = "nav-btn";
    prevButton.textContent = "← Предыдущий";
    prevButton.disabled = !prevLesson;
    prevButton.addEventListener("click", () => {
      if (!prevLesson) return;
      setCurrentLesson(prevLesson.id);
      render();
      setTimeout(() => scrollToCurrentPost(true), 10);
    });

    const doneButton = document.createElement("button");
    doneButton.type = "button";
    doneButton.className = `complete-btn${done ? " done" : ""}`;
    doneButton.textContent = done ? "✓ Пройдено" : "○ Отметить пройденным";
    doneButton.addEventListener("click", () => {
      toggleLessonDone(lesson.id);
    });

    const nextButton = document.createElement("button");
    nextButton.type = "button";
    nextButton.className = "nav-btn";
    nextButton.textContent = "Следующий →";
    nextButton.disabled = !nextLesson;
    nextButton.addEventListener("click", () => {
      if (!nextLesson) return;
      setCurrentLesson(nextLesson.id);
      render();
      setTimeout(() => scrollToCurrentPost(true), 10);
    });

    controls.append(prevButton, doneButton, nextButton);
    stage.append(controls);

    el.postFeed.append(stage);
  }

  function scrollToCurrentPost(smooth = true) {
    const node = document.getElementById(`post-${state.currentLessonId}`) || el.postFeed;
    node.scrollIntoView({
      behavior: smooth ? "smooth" : "auto",
      block: "start"
    });
  }

  function render() {
    const context = ensureCurrentContext();

    renderTopProgress();
    renderSections();
    renderLessonRail(context.section, context.lesson);
    renderLessonStage(context.section, context.lesson);
  }

  function bindEvents() {
    el.closeModalBtn.addEventListener("click", closePhoto);
    el.modalPrevBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      goModal(-1);
    });
    el.modalNextBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      goModal(1);
    });

    el.photoModal.addEventListener("click", (event) => {
      if (event.target === el.photoModal) {
        closePhoto();
      }
    });

    el.modalImage.addEventListener("touchstart", (event) => {
      if (!event.touches || event.touches.length !== 1) return;
      state.touchStartX = event.touches[0].clientX;
      state.touchStartY = event.touches[0].clientY;
    }, { passive: true });

    el.modalImage.addEventListener("touchend", (event) => {
      if (state.touchStartX === null || state.touchStartY === null) return;
      if (!event.changedTouches || !event.changedTouches.length) return;

      const endX = event.changedTouches[0].clientX;
      const endY = event.changedTouches[0].clientY;
      const dx = endX - state.touchStartX;
      const dy = endY - state.touchStartY;

      state.touchStartX = null;
      state.touchStartY = null;

      if (Math.abs(dx) < 40 || Math.abs(dx) <= Math.abs(dy)) {
        return;
      }

      if (dx < 0) {
        goModal(1);
      } else {
        goModal(-1);
      }
    }, { passive: true });

    document.addEventListener("keydown", (event) => {
      if (el.photoModal.classList.contains("hidden")) return;

      if (event.key === "Escape") {
        closePhoto();
        return;
      }
      if (event.key === "ArrowLeft") {
        goModal(-1);
        return;
      }
      if (event.key === "ArrowRight") {
        goModal(1);
      }
    });
  }

  async function init() {
    startLoader();

    try {
      const bootstrap = await checkAccessAndLoadProgress();
      if (!bootstrap.access) {
        showDenied("Нет доступа, обратитесь в поддержку");
        return;
      }

      const fallbackLocal = loadLocalProgress();
      state.completed = new Set(
        bootstrap.completedLessons.length ? bootstrap.completedLessons : fallbackLocal
      );
      state.currentLessonId = bootstrap.currentLessonId || inferCurrentLessonId();

      const currentSection = findSectionByLesson(state.currentLessonId);
      if (currentSection) {
        state.selectedSectionId = currentSection.id;
      }

      saveLocalProgress();

      el.courseTitle.textContent = data.course.title || "Курс";
      el.platformIdLabel.textContent = platformId || "—";
      el.chatLink.href = CHAT_URL;
      el.supportLink.href = SUPPORT_URL;

      bindEvents();
      render();
      setTimeout(() => scrollToCurrentPost(false), 0);
      showApp();
    } catch (error) {
      console.error(error);
      showDenied("Нет доступа, обратитесь в поддержку");
    }
  }

  init();
})();
