(() => {
  "use strict";

  const data = window.COURSE_DATA;
  if (!data || !Array.isArray(data.sections) || !Array.isArray(data.lessons)) {
    return;
  }

  const STORAGE = {
    completed: "diana-course-completed-v1",
    activeLesson: "diana-course-active-lesson-v1",
    links: "diana-course-links-v1"
  };

  const byId = (id) => document.getElementById(id);

  const el = {
    courseTitle: byId("courseTitle"),
    courseTagline: byId("courseTagline"),
    totalLessons: byId("totalLessons"),
    doneLessons: byId("doneLessons"),
    leftLessons: byId("leftLessons"),
    overallProgressBar: byId("overallProgressBar"),
    overallProgressText: byId("overallProgressText"),
    continueBtn: byId("continueBtn"),
    searchInput: byId("searchInput"),
    typeFilters: document.querySelectorAll(".type-filter"),
    sectionNav: byId("sectionNav"),
    sectionsBoard: byId("sectionsBoard"),
    activeSectionLabel: byId("activeSectionLabel"),
    activeLessonTitle: byId("activeLessonTitle"),
    activeTypeBadge: byId("activeTypeBadge"),
    activeLessonSummary: byId("activeLessonSummary"),
    mediaStage: byId("mediaStage"),
    prevLessonBtn: byId("prevLessonBtn"),
    nextLessonBtn: byId("nextLessonBtn"),
    toggleDoneBtn: byId("toggleDoneBtn"),
    customLinkInput: byId("customLinkInput"),
    saveLinkBtn: byId("saveLinkBtn"),
    openLinkBtn: byId("openLinkBtn"),
    fallbackHint: byId("fallbackHint")
  };

  const state = {
    activeFilter: "all",
    searchQuery: "",
    completed: new Set(loadList(STORAGE.completed)),
    customLinks: loadObject(STORAGE.links),
    activeLessonId: loadString(STORAGE.activeLesson)
  };

  const sections = data.sections.map((section) => ({
    ...section,
    lessons: data.lessons.filter((lesson) => lesson.sectionId === section.id)
  }));

  const allLessons = data.lessons.slice().sort((a, b) => a.messageId - b.messageId);
  if (!state.activeLessonId || !findLesson(state.activeLessonId)) {
    state.activeLessonId = allLessons[0]?.id || null;
  }

  function loadList(key) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function loadObject(key) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function loadString(key) {
    return localStorage.getItem(key) || "";
  }

  function saveState() {
    localStorage.setItem(STORAGE.completed, JSON.stringify([...state.completed]));
    localStorage.setItem(STORAGE.links, JSON.stringify(state.customLinks));
    if (state.activeLessonId) {
      localStorage.setItem(STORAGE.activeLesson, state.activeLessonId);
    }
  }

  function findLesson(lessonId) {
    return allLessons.find((item) => item.id === lessonId) || null;
  }

  function esc(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function sectionById(sectionId) {
    return sections.find((item) => item.id === sectionId) || null;
  }

  function resolvedLink(lesson) {
    const custom = (state.customLinks[lesson.id] || "").trim();
    return custom;
  }

  function fallbackLink(lesson) {
    return lesson.links && lesson.links.length ? lesson.links[0] : "";
  }

  function lessonTypeLabel(type) {
    const labels = {
      video: "Видео",
      photo: "Фото",
      text: "Текст",
      mixed: "Смешанный"
    };
    return labels[type] || "Материал";
  }

  function lessonTypeIcon(type) {
    const icons = {
      video: "▶",
      photo: "◉",
      text: "✎",
      mixed: "◎"
    };
    return icons[type] || "•";
  }

  function typeBadgeColor(type) {
    switch (type) {
      case "video":
        return { bg: "rgba(232, 110, 168, 0.2)", color: "#8b2f61" };
      case "photo":
        return { bg: "rgba(204, 95, 148, 0.18)", color: "#7b2f58" };
      case "mixed":
        return { bg: "rgba(243, 166, 200, 0.28)", color: "#7a3556" };
      default:
        return { bg: "rgba(126, 96, 112, 0.14)", color: "#5f4552" };
    }
  }

  function getYouTubeId(url) {
    const patterns = [
      /youtube\.com\/watch\?v=([^&]+)/i,
      /youtu\.be\/([^?&]+)/i,
      /youtube\.com\/embed\/([^?&]+)/i
    ];
    for (const regex of patterns) {
      const match = url.match(regex);
      if (match && match[1]) {
        return match[1];
      }
    }
    return "";
  }

  function isImage(url) {
    return /\.(jpg|jpeg|png|webp|gif|avif)(\?.*)?$/i.test(url);
  }

  function isVideo(url) {
    return /\.(mp4|webm|mov|m4v|avi)(\?.*)?$/i.test(url);
  }

  function lessonMatchesFilter(lesson) {
    if (state.activeFilter !== "all" && lesson.type !== state.activeFilter) {
      return false;
    }
    if (!state.searchQuery) {
      return true;
    }
    const section = sectionById(lesson.sectionId);
    const source = [lesson.title, lesson.summary, section?.subtitle || ""]
      .join(" ")
      .toLowerCase();
    return source.includes(state.searchQuery);
  }

  function filteredLessonsInSection(section) {
    return section.lessons.filter((lesson) => lessonMatchesFilter(lesson));
  }

  function overallProgress() {
    const total = allLessons.length;
    const done = allLessons.filter((lesson) => state.completed.has(lesson.id)).length;
    const percent = total ? Math.round((done / total) * 100) : 0;
    return { total, done, left: Math.max(total - done, 0), percent };
  }

  function sectionProgress(section) {
    const total = section.lessons.length;
    const done = section.lessons.filter((lesson) => state.completed.has(lesson.id)).length;
    const percent = total ? Math.round((done / total) * 100) : 0;
    return { total, done, percent };
  }

  function renderTopStats() {
    const progress = overallProgress();
    el.courseTitle.textContent = data.course.title;
    el.courseTagline.textContent = data.course.tagline;
    el.totalLessons.textContent = String(progress.total);
    el.doneLessons.textContent = String(progress.done);
    el.leftLessons.textContent = String(progress.left);
    el.overallProgressBar.style.width = `${progress.percent}%`;
    el.overallProgressText.textContent = `${progress.percent}%`;
  }

  function renderSectionNav() {
    el.sectionNav.innerHTML = "";

    sections.forEach((section) => {
      const progress = sectionProgress(section);
      const block = document.createElement("button");
      block.type = "button";
      block.className = "section-link";
      block.innerHTML = `
        <strong>${section.title}</strong>
        <span>${section.subtitle}</span>
        <span>${progress.done}/${progress.total} пройдено</span>
        <div class="section-mini-track">
          <div class="section-mini-fill" style="width:${progress.percent}%"></div>
        </div>
      `;
      block.addEventListener("click", () => {
        const target = document.getElementById(`section-${section.id}`);
        if (target) {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
      el.sectionNav.append(block);
    });
  }

  function renderSectionsBoard() {
    el.sectionsBoard.innerHTML = "";

    sections.forEach((section, sectionIndex) => {
      const visibleLessons = filteredLessonsInSection(section);
      const progress = sectionProgress(section);
      const sectionNode = document.createElement("article");
      sectionNode.className = "section-block";
      sectionNode.id = `section-${section.id}`;
      sectionNode.style.animationDelay = `${sectionIndex * 0.03}s`;
      sectionNode.innerHTML = `
        <div class="section-head">
          <div>
            <h3 class="section-title">${section.title}</h3>
            <p class="section-subtitle">${section.subtitle}</p>
          </div>
          <div class="section-progress">
            <p class="muted small-text">${progress.done}/${progress.total} пройдено</p>
            <div class="progress-track">
              <div class="progress-fill" style="width:${progress.percent}%"></div>
            </div>
          </div>
        </div>
      `;

      const lessonGrid = document.createElement("div");
      lessonGrid.className = "lesson-grid";

      if (!visibleLessons.length) {
        const empty = document.createElement("div");
        empty.className = "empty-state";
        empty.textContent = "Нет уроков по текущему фильтру";
        lessonGrid.append(empty);
      } else {
        visibleLessons.forEach((lesson) => {
          const done = state.completed.has(lesson.id);
          const active = lesson.id === state.activeLessonId;
          const card = document.createElement("article");
          card.className = `lesson-card${done ? " done" : ""}${active ? " active" : ""}`;
          card.dataset.lessonId = lesson.id;

          const media = document.createElement("div");
          media.className = "lesson-media";

          if (lesson.photo) {
            const img = document.createElement("img");
            img.src = lesson.photo;
            img.alt = lesson.title;
            img.loading = "lazy";
            media.append(img);
          } else {
            const fake = document.createElement("div");
            fake.className = "fake-icon";
            fake.textContent = lessonTypeIcon(lesson.type);
            media.append(fake);
          }

          const content = document.createElement("div");
          content.className = "lesson-content";
          content.innerHTML = `
            <div class="lesson-topline">
              <span class="lesson-type">${esc(lessonTypeLabel(lesson.type))}</span>
              <span class="lesson-duration">${lesson.durationMin} мин</span>
            </div>
            <h4 class="lesson-name">${esc(lesson.title)}</h4>
            <p class="lesson-summary">${esc(lesson.summary || "Материал без описания")}</p>
            <div class="lesson-actions">
              <button class="lesson-open" type="button">Открыть</button>
              <button class="lesson-done${done ? " done" : ""}" type="button">${done ? "Пройдено" : "Отметить"}</button>
            </div>
          `;

          card.append(media, content);
          card.addEventListener("click", () => {
            state.activeLessonId = lesson.id;
            saveState();
            render();
          });

          const openBtn = content.querySelector(".lesson-open");
          const doneBtn = content.querySelector(".lesson-done");

          openBtn.addEventListener("click", (event) => {
            event.stopPropagation();
            state.activeLessonId = lesson.id;
            saveState();
            renderPlayer();
            focusPlayer();
            highlightCards();
          });

          doneBtn.addEventListener("click", (event) => {
            event.stopPropagation();
            toggleCompleted(lesson.id);
          });

          lessonGrid.append(card);
        });
      }

      sectionNode.append(lessonGrid);
      el.sectionsBoard.append(sectionNode);
    });
  }

  function focusPlayer() {
    document.querySelector(".player-card")?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  function highlightCards() {
    document.querySelectorAll(".lesson-card").forEach((card) => card.classList.remove("active"));
    const lesson = findLesson(state.activeLessonId);
    if (!lesson) {
      return;
    }
    const current = document.querySelector(`.lesson-card[data-lesson-id="${lesson.id}"]`);
    if (current) {
      current.classList.add("active");
    }
  }

  function createPlaceholder(title, subtitle, buttonUrl = "") {
    const box = document.createElement("div");
    box.className = "placeholder";
    box.innerHTML = `<h3>${title}</h3><p>${subtitle}</p>`;
    if (buttonUrl) {
      const openBtn = document.createElement("button");
      openBtn.className = "solid-btn";
      openBtn.textContent = "Открыть ссылку";
      openBtn.style.marginTop = "12px";
      openBtn.addEventListener("click", () => window.open(buttonUrl, "_blank", "noopener,noreferrer"));
      box.append(openBtn);
    }
    return box;
  }

  function renderMediaStage(lesson) {
    el.mediaStage.innerHTML = "";
    const custom = resolvedLink(lesson);
    const fallback = fallbackLink(lesson);
    const link = custom || "";

    if (link && lesson.type !== "text") {
      const youtubeId = getYouTubeId(link);
      if (youtubeId) {
        const iframe = document.createElement("iframe");
        iframe.src = `https://www.youtube.com/embed/${youtubeId}`;
        iframe.allow =
          "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
        iframe.allowFullscreen = true;
        el.mediaStage.append(iframe);
        return;
      }

      if (isVideo(link)) {
        const video = document.createElement("video");
        video.src = link;
        video.controls = true;
        video.preload = "metadata";
        el.mediaStage.append(video);
        return;
      }

      if (isImage(link)) {
        const img = document.createElement("img");
        img.src = link;
        img.alt = lesson.title;
        el.mediaStage.append(img);
        return;
      }

      el.mediaStage.append(
        createPlaceholder("Ссылка добавлена", "Формат не встроенный, открой через кнопку ниже.", link)
      );
      return;
    }

    if ((lesson.type === "photo" || lesson.type === "mixed") && lesson.photo) {
      const img = document.createElement("img");
      img.src = lesson.photo;
      img.alt = lesson.title;
      el.mediaStage.append(img);
      return;
    }

    if (lesson.type === "video") {
      el.mediaStage.append(
        createPlaceholder("Видео-урок", "Вставь ссылку в поле ниже, и плеер откроет его прямо здесь.")
      );
      return;
    }

    if (lesson.type === "photo") {
      el.mediaStage.append(
        createPlaceholder("Фото-урок", "Добавь ссылку на фото в хорошем качестве, если нужно заменить превью.")
      );
      return;
    }

    el.mediaStage.append(createPlaceholder("Текстовый урок", "Открой материал в карточке и отметь прохождение."));
  }

  function renderPlayer() {
    const lesson = findLesson(state.activeLessonId);
    if (!lesson) {
      return;
    }

    const section = sectionById(lesson.sectionId);
    const done = state.completed.has(lesson.id);
    const typeStyle = typeBadgeColor(lesson.type);
    const custom = resolvedLink(lesson);
    const fallback = fallbackLink(lesson);

    el.activeSectionLabel.textContent = section ? `${section.title} • ${section.subtitle}` : "Раздел курса";
    el.activeLessonTitle.textContent = lesson.title;
    el.activeLessonSummary.textContent = lesson.summary || "Описание к уроку пока не добавлено.";
    el.activeTypeBadge.textContent = lessonTypeLabel(lesson.type);
    el.activeTypeBadge.style.background = typeStyle.bg;
    el.activeTypeBadge.style.color = typeStyle.color;
    el.toggleDoneBtn.textContent = done ? "Снять отметку" : "Отметить как пройдено";
    el.customLinkInput.value = custom;
    el.fallbackHint.textContent = fallback
      ? `Ссылка из экспорта: ${fallback}`
      : "Ссылка из экспорта не найдена, добавь свою.";

    const currentIndex = allLessons.findIndex((item) => item.id === lesson.id);
    el.prevLessonBtn.disabled = currentIndex <= 0;
    el.nextLessonBtn.disabled = currentIndex >= allLessons.length - 1;

    renderMediaStage(lesson);
  }

  function toggleCompleted(lessonId) {
    if (state.completed.has(lessonId)) {
      state.completed.delete(lessonId);
    } else {
      state.completed.add(lessonId);
    }
    saveState();
    render();
  }

  function setActiveLessonByOffset(offset) {
    const currentIndex = allLessons.findIndex((lesson) => lesson.id === state.activeLessonId);
    if (currentIndex < 0) {
      return;
    }
    const target = allLessons[currentIndex + offset];
    if (!target) {
      return;
    }
    state.activeLessonId = target.id;
    saveState();
    renderPlayer();
    highlightCards();
    focusPlayer();
  }

  function continueFromLast() {
    const pending = allLessons.find((lesson) => !state.completed.has(lesson.id));
    if (!pending) {
      state.activeLessonId = allLessons[0]?.id || null;
    } else {
      state.activeLessonId = pending.id;
    }
    saveState();
    renderPlayer();
    highlightCards();
    focusPlayer();
  }

  function saveCurrentLink() {
    const lesson = findLesson(state.activeLessonId);
    if (!lesson) {
      return;
    }
    const value = el.customLinkInput.value.trim();
    if (!value) {
      delete state.customLinks[lesson.id];
    } else {
      state.customLinks[lesson.id] = value;
    }
    saveState();
    renderPlayer();
  }

  function openCurrentLink() {
    const lesson = findLesson(state.activeLessonId);
    if (!lesson) {
      return;
    }
    const url = resolvedLink(lesson) || fallbackLink(lesson);
    if (!url) {
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function bindEvents() {
    el.searchInput.addEventListener("input", () => {
      state.searchQuery = el.searchInput.value.trim().toLowerCase();
      renderSectionsBoard();
      highlightCards();
    });

    el.typeFilters.forEach((button) => {
      button.addEventListener("click", () => {
        state.activeFilter = button.dataset.filter || "all";
        el.typeFilters.forEach((btn) => btn.classList.remove("active"));
        button.classList.add("active");
        renderSectionsBoard();
        highlightCards();
      });
    });

    el.toggleDoneBtn.addEventListener("click", () => toggleCompleted(state.activeLessonId));
    el.prevLessonBtn.addEventListener("click", () => setActiveLessonByOffset(-1));
    el.nextLessonBtn.addEventListener("click", () => setActiveLessonByOffset(1));
    el.continueBtn.addEventListener("click", continueFromLast);
    el.saveLinkBtn.addEventListener("click", saveCurrentLink);
    el.openLinkBtn.addEventListener("click", openCurrentLink);
  }

  function render() {
    renderTopStats();
    renderSectionNav();
    renderSectionsBoard();
    renderPlayer();
    highlightCards();
  }

  bindEvents();
  render();
})();
