"use strict";

const STORAGE_KEY = "quiet-day-planner-v1";
const BACKUP_FORMAT = "quiet-day-planner-backup";
const BACKUP_VERSION = 1;
const monthNames = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
const monthNamesGenitive = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const weekdayNames = ["воскресенье", "понедельник", "вторник", "среду", "четверг", "пятницу", "субботу"];
const shortWeekdays = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
const monthsByName = new Map([
  ["январ", 0], ["феврал", 1], ["март", 2], ["апрел", 3], ["май", 4], ["мая", 4], ["июн", 5],
  ["июл", 6], ["август", 7], ["сентябр", 8], ["октябр", 9], ["ноябр", 10], ["декабр", 11]
]);

const elements = {
  appShell: document.querySelector(".app-shell"),
  todayLabel: document.querySelector("#today-label"),
  todayButton: document.querySelector("#today-button"),
  monthTitle: document.querySelector("#month-title"),
  calendarDays: document.querySelector("#calendar-days"),
  previousMonth: document.querySelector("#previous-month"),
  nextMonth: document.querySelector("#next-month"),
  selectedDateTitle: document.querySelector("#selected-date-title"),
  agendaList: document.querySelector("#agenda-list"),
  eventCount: document.querySelector("#event-count"),
  dayViewToolbar: document.querySelector("#day-view-toolbar"),
  backToCalendar: document.querySelector("#back-to-calendar"),
  previousDay: document.querySelector("#previous-day"),
  nextDay: document.querySelector("#next-day"),
  taskCount: document.querySelector("#task-count"),
  taskForm: document.querySelector("#task-form"),
  taskInput: document.querySelector("#task-input"),
  taskList: document.querySelector("#task-list"),
  eventForm: document.querySelector("#event-form"),
  formHeading: document.querySelector("#form-heading"),
  saveEventButton: document.querySelector("#save-event-button"),
  cancelEditButton: document.querySelector("#cancel-edit-button"),
  title: document.querySelector("#event-title"),
  date: document.querySelector("#event-date"),
  time: document.querySelector("#event-time"),
  duration: document.querySelector("#event-duration"),
  repeat: document.querySelector("#event-repeat"),
  repeatHint: document.querySelector("#repeat-hint"),
  place: document.querySelector("#event-place"),
  notes: document.querySelector("#event-notes"),
  recordButton: document.querySelector("#record-button"),
  addVoiceButton: document.querySelector("#add-voice-button"),
  voiceHint: document.querySelector("#voice-hint"),
  transcriptBox: document.querySelector("#transcript-box"),
  transcript: document.querySelector("#voice-transcript"),
  status: document.querySelector("#status-message"),
  exportBackupButton: document.querySelector("#export-backup-button"),
  importBackupButton: document.querySelector("#import-backup-button"),
  backupFileInput: document.querySelector("#backup-file-input")
};

const today = new Date();
let selectedDate = dateKey(today);
let displayedMonth = new Date(today.getFullYear(), today.getMonth(), 1);
let isDayView = false;
let events = [];
let tasks = [];
let editingEventId = null;
let voiceDraft = false;
let manualFieldsTouched = false;
let draftRestored = false;
const touchedFields = new Set();
const voiceFields = new Set();
let recognition = null;

function createId() {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function readStorage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    const data = JSON.parse(saved);
    events = Array.isArray(data.events) ? data.events.filter(item =>
      item && typeof item.id === "string" && typeof item.title === "string" && typeof item.date === "string"
    ) : [];
    tasks = Array.isArray(data.tasks) ? data.tasks.filter(item =>
      item && typeof item.id === "string" && typeof item.text === "string"
    ) : [];
    restoreDraft(data.draft);
  } catch (error) {
    showStatus("Не удалось прочитать сохранённые данные. Можно продолжить, но старые записи могли быть повреждены.", "error");
    console.error("Не удалось прочитать данные планнера:", error);
  }
}

function getCurrentDraft() {
  const draft = {
    title: elements.title.value,
    date: elements.date.value,
    time: elements.time.value,
    durationMinutes: elements.duration.value,
    repeat: elements.repeat.value,
    place: elements.place.value,
    notes: elements.notes.value,
    transcript: elements.transcript.value,
    voiceDraft,
    editingEventId,
    manualFieldsTouched,
    touchedFields: [...touchedFields],
    voiceFields: [...voiceFields]
  };
  const hasContent = [draft.title, draft.time, draft.place, draft.notes, draft.transcript].some(value => value.trim())
    || draft.repeat === "weekly";
  return hasContent ? draft : null;
}

function restoreDraft(draft) {
  if (!draft || typeof draft !== "object") return;
  draftRestored = true;
  elements.title.value = typeof draft.title === "string" ? draft.title : "";
  elements.date.value = typeof draft.date === "string" ? draft.date : "";
  elements.time.value = typeof draft.time === "string" ? draft.time : "";
  elements.duration.value = ["30", "45", "60", "90", "120", "180"].includes(String(draft.durationMinutes))
    ? String(draft.durationMinutes)
    : "60";
  elements.repeat.value = draft.repeat === "weekly" ? "weekly" : "none";
  elements.place.value = typeof draft.place === "string" ? draft.place : "";
  elements.notes.value = typeof draft.notes === "string" ? draft.notes : "";
  elements.transcript.value = typeof draft.transcript === "string" ? draft.transcript : "";
  elements.transcriptBox.hidden = !elements.transcript.value;
  voiceDraft = Boolean(draft.voiceDraft);
  editingEventId = typeof draft.editingEventId === "string" && events.some(event => event.id === draft.editingEventId)
    ? draft.editingEventId
    : null;
  manualFieldsTouched = Boolean(draft.manualFieldsTouched);
  if (Array.isArray(draft.touchedFields)) {
    for (const field of draft.touchedFields) {
      if (["title", "date", "time", "place", "notes"].includes(field)) touchedFields.add(field);
    }
  }
  if (Array.isArray(draft.voiceFields)) {
    for (const field of draft.voiceFields) {
      if (["title", "date", "time", "place"].includes(field)) voiceFields.add(field);
    }
  }
  elements.addVoiceButton.hidden = !voiceDraft;
  elements.recordButton.hidden = Boolean(editingEventId);
  elements.cancelEditButton.hidden = !(editingEventId || voiceDraft || manualFieldsTouched);
  elements.saveEventButton.textContent = editingEventId ? "Сохранить изменения" : "Подтвердить событие";
  elements.formHeading.textContent = editingEventId ? "Изменить событие" : voiceDraft ? "Проверь черновик" : "Добавить событие";
  elements.voiceHint.textContent = voiceDraft
    ? "Черновик восстановлен. Проверь детали или добавь голосом новые."
    : "Черновик восстановлен. Продолжи заполнение события.";
  updateRepeatHint();
}

function saveStorage(draft = getCurrentDraft()) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ events, tasks, draft }));
    return true;
  } catch (error) {
    showStatus("Не удалось сохранить данные в этом браузере. Проверь, доступно ли место и разрешено ли локальное хранение.", "error");
    console.error("Не удалось сохранить данные планнера:", error);
    return false;
  }
}

function downloadBackup() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const data = saved ? JSON.parse(saved) : { events, tasks, draft: getCurrentDraft() };
    const backup = {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      data
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `quiet-day-backup-${dateKey(new Date())}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    showStatus("Резервная копия скачана. Сохрани файл отдельно от телефона.", "success");
  } catch (error) {
    showStatus("Не удалось создать резервную копию.", "error");
    console.error("Не удалось создать резервную копию:", error);
  }
}

function isValidBackup(backup) {
  return backup && typeof backup === "object"
    && backup.format === BACKUP_FORMAT
    && backup.version === BACKUP_VERSION
    && backup.data && typeof backup.data === "object"
    && Array.isArray(backup.data.events)
    && backup.data.events.every(event => event && typeof event.id === "string"
      && typeof event.title === "string" && typeof event.date === "string"
      && (event.repeat === undefined || event.repeat === "none" || event.repeat === "weekly")
      && (event.durationMinutes === undefined || Number.isInteger(event.durationMinutes)
        && event.durationMinutes >= 15 && event.durationMinutes <= 720))
    && backup.data.tasks.every(task => task && typeof task.id === "string" && typeof task.text === "string")
    && (backup.data.draft === null || typeof backup.data.draft === "object");
}

async function restoreBackup(file) {
  try {
    const backup = JSON.parse(await file.text());
    if (!isValidBackup(backup)) {
      showStatus("Этот файл не похож на резервную копию планнера или имеет неподдерживаемый формат.", "error");
      return;
    }
    const eventCount = backup.data.events.length;
    const taskCount = backup.data.tasks.length;
    const confirmed = window.confirm(
      `В копии: событий — ${eventCount}, задач — ${taskCount}. Текущие события, задачи и черновик будут заменены. Продолжить?`
    );
    if (!confirmed) return;

    localStorage.setItem(STORAGE_KEY, JSON.stringify(backup.data));
    showStatus("Резервная копия восстановлена.", "success");
    window.setTimeout(() => window.location.reload(), 700);
  } catch (error) {
    showStatus("Не удалось прочитать или восстановить файл резервной копии.", "error");
    console.error("Не удалось восстановить резервную копию:", error);
  }
}

function showStatus(message, kind = "") {
  elements.status.textContent = message;
  elements.status.className = `status-message${kind ? ` ${kind}` : ""}`;
  elements.status.hidden = false;
}

function clearStatus() {
  elements.status.hidden = true;
  elements.status.textContent = "";
  elements.status.className = "status-message";
}

function render() {
  const todayLabel = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long" }).format(today);
  elements.todayLabel.textContent = todayLabel.toLocaleUpperCase("ru-RU");
  elements.monthTitle.textContent = `${monthNames[displayedMonth.getMonth()]} ${displayedMonth.getFullYear()}`;
  elements.appShell.classList.toggle("day-view-mode", isDayView);
  elements.dayViewToolbar.hidden = !isDayView;
  renderCalendar();
  renderAgenda();
  renderTasks();
}

function shiftDate(date, days) {
  const shifted = new Date(`${date}T12:00:00`);
  shifted.setDate(shifted.getDate() + days);
  return dateKey(shifted);
}

function eventOccursOnDate(event, key) {
  if (event.date === key) return true;
  if (event.repeat !== "weekly" || key < event.date) return false;
  return new Date(`${event.date}T12:00:00`).getDay() === new Date(`${key}T12:00:00`).getDay();
}

function updateRepeatHint() {
  if (elements.repeat.value !== "weekly" || !elements.date.value) {
    elements.repeatHint.textContent = "Однократное событие.";
    return;
  }
  const weekday = new Intl.DateTimeFormat("ru-RU", { weekday: "long" }).format(new Date(`${elements.date.value}T12:00:00`));
  elements.repeatHint.textContent = `Каждую неделю, в день недели — ${weekday}. Изменение и удаление затронут всю серию.`;
}

function getEventInterval(event, key) {
  const start = event.time ? new Date(`${key}T${event.time}:00`) : new Date(`${key}T00:00:00`);
  const end = event.time
    ? new Date(start.getTime() + (Number(event.durationMinutes) || 60) * 60 * 1000)
    : new Date(`${shiftDate(key, 1)}T00:00:00`);
  return { start: start.getTime(), end: end.getTime() };
}

function intervalsOverlap(first, second) {
  return first.start < second.end && second.start < first.end;
}

function findConflictDate(firstEvent, secondEvent) {
  const firstWeekly = firstEvent.repeat === "weekly";
  const secondWeekly = secondEvent.repeat === "weekly";
  let firstDate;
  let lastDate;

  if (firstWeekly && secondWeekly) {
    const anchor = firstEvent.date > secondEvent.date ? firstEvent.date : secondEvent.date;
    firstDate = shiftDate(anchor, -1);
    lastDate = shiftDate(anchor, 7);
  } else if (firstWeekly || secondWeekly) {
    const fixedDate = firstWeekly ? secondEvent.date : firstEvent.date;
    firstDate = shiftDate(fixedDate, -1);
    lastDate = shiftDate(fixedDate, 1);
  } else {
    firstDate = firstEvent.date < secondEvent.date ? firstEvent.date : secondEvent.date;
    lastDate = firstEvent.date > secondEvent.date ? firstEvent.date : secondEvent.date;
    if (lastDate > shiftDate(firstDate, 1)) return null;
  }

  const firstOccurrences = [];
  const secondOccurrences = [];
  for (let key = firstDate; key <= lastDate; key = shiftDate(key, 1)) {
    if (eventOccursOnDate(firstEvent, key)) firstOccurrences.push({ key, interval: getEventInterval(firstEvent, key) });
    if (eventOccursOnDate(secondEvent, key)) secondOccurrences.push({ key, interval: getEventInterval(secondEvent, key) });
  }
  for (const first of firstOccurrences) {
    for (const second of secondOccurrences) {
      if (intervalsOverlap(first.interval, second.interval)) {
        return first.key > second.key ? first.key : second.key;
      }
    }
  }
  return null;
}

function findScheduleConflict(candidate) {
  for (const event of events) {
    if (event.id === candidate.id) continue;
    const date = findConflictDate(candidate, event);
    if (date) return { event, date };
  }
  return null;
}

function renderCalendar() {
  elements.calendarDays.replaceChildren();
  const year = displayedMonth.getFullYear();
  const month = displayedMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const offset = (firstDay.getDay() + 6) % 7;
  const gridStart = new Date(year, month, 1 - offset);
  const todayKey = dateKey(today);
  for (let index = 0; index < 42; index += 1) {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    const key = dateKey(date);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "day-cell";
    button.setAttribute("role", "gridcell");
    button.setAttribute("aria-label", new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long" }).format(date));
    if (date.getMonth() !== month) button.classList.add("outside-month");
    if (key === selectedDate) button.classList.add("selected");
    if (key === todayKey) button.classList.add("today");
    if (key === todayKey) button.setAttribute("aria-current", "date");
    const number = document.createElement("span");
    number.className = "day-number";
    number.textContent = String(date.getDate());
    button.append(number);
    if (events.some(event => eventOccursOnDate(event, key))) {
      const dot = document.createElement("span");
      dot.className = "event-indicator";
      dot.setAttribute("aria-hidden", "true");
      button.append(dot);
    }
    button.addEventListener("click", () => {
      selectedDate = key;
      displayedMonth = new Date(date.getFullYear(), date.getMonth(), 1);
      isDayView = true;
      render();
    });
    elements.calendarDays.append(button);
  }
}

function formatSelectedDate(key) {
  const date = new Date(`${key}T12:00:00`);
  return new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long" }).format(date);
}

function formatEventTime(event, occurrenceDate) {
  if (!event.time) return "Весь день";
  const start = new Date(`${occurrenceDate}T${event.time}:00`);
  const end = new Date(start.getTime() + (Number(event.durationMinutes) || 60) * 60 * 1000);
  const formatTime = date => new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).format(date);
  return `${formatTime(start)}–${formatTime(end)}`;
}

function renderAgenda() {
  const selectedEvents = events.filter(event => eventOccursOnDate(event, selectedDate)).sort((a, b) =>
    !a.time && b.time ? -1 : a.time && !b.time ? 1 : (a.time || "").localeCompare(b.time || "")
  );
  elements.selectedDateTitle.textContent = formatSelectedDate(selectedDate);
  elements.eventCount.textContent = String(selectedEvents.length);
  elements.agendaList.replaceChildren();

  if (selectedEvents.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Пока ничего не запланировано. Можно оставить этот день свободным или добавить новый план.";
    elements.agendaList.append(empty);
    return;
  }

  for (const event of selectedEvents) {
    const item = document.createElement("article");
    item.className = "event-item";
    const stripe = document.createElement("span");
    stripe.className = "event-stripe";
    stripe.setAttribute("aria-hidden", "true");
    const content = document.createElement("div");
    content.className = "event-content";
    const time = document.createElement("p");
    time.className = "event-time";
    time.textContent = formatEventTime(event, selectedDate);
    const title = document.createElement("p");
    title.className = "event-title";
    title.textContent = event.title;
    content.append(time, title);
    if (event.place) {
      const place = document.createElement("p");
      place.className = "event-meta";
      place.textContent = event.place;
      content.append(place);
    }
    if (event.notes) {
      const notes = document.createElement("p");
      notes.className = "event-meta";
      notes.textContent = event.notes;
      content.append(notes);
    }
    if (event.repeat === "weekly") {
      const repeat = document.createElement("p");
      repeat.className = "event-meta event-repeat-label";
      repeat.textContent = "Каждую неделю";
      content.append(repeat);
    }
    const actions = document.createElement("div");
    actions.className = "event-actions";
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "small-action";
    edit.textContent = "Изм.";
    edit.setAttribute("aria-label", `Изменить событие: ${event.title}`);
    edit.addEventListener("click", () => editEvent(event.id));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "small-action delete";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Удалить событие: ${event.title}`);
    remove.addEventListener("click", () => deleteEvent(event.id));
    const exportButton = document.createElement("button");
    exportButton.type = "button";
    exportButton.className = "small-action";
    exportButton.textContent = "ICS";
    exportButton.setAttribute("aria-label", `Скачать файл календаря для события: ${event.title}`);
    exportButton.addEventListener("click", () => downloadIcs(event));
    actions.append(edit, exportButton, remove);
    item.append(stripe, content, actions);
    elements.agendaList.append(item);
  }
}

function renderTasks() {
  const pendingCount = tasks.filter(task => !task.completed).length;
  elements.taskCount.textContent = String(pendingCount);
  elements.taskList.replaceChildren();
  for (const task of tasks) {
    const item = document.createElement("li");
    item.className = `task-row${task.completed ? " completed" : ""}`;
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = Boolean(task.completed);
    checkbox.setAttribute("aria-label", `Отметить выполненной: ${task.text}`);
    checkbox.addEventListener("change", () => {
      task.completed = checkbox.checked;
      if (saveStorage()) renderTasks();
    });
    const text = document.createElement("span");
    text.textContent = task.text;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "task-delete";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Удалить задачу: ${task.text}`);
    remove.addEventListener("click", () => {
      tasks = tasks.filter(item => item.id !== task.id);
      if (saveStorage()) renderTasks();
    });
    item.append(checkbox, text, remove);
    elements.taskList.append(item);
  }
}

function resetEventForm() {
  elements.eventForm.reset();
  elements.date.value = selectedDate;
  updateRepeatHint();
  elements.transcriptBox.hidden = true;
  elements.transcript.value = "";
  elements.addVoiceButton.hidden = true;
  elements.recordButton.hidden = false;
  elements.formHeading.textContent = "Добавить событие";
  elements.saveEventButton.textContent = "Подтвердить событие";
  elements.cancelEditButton.hidden = true;
  editingEventId = null;
  voiceDraft = false;
  manualFieldsTouched = false;
  touchedFields.clear();
  voiceFields.clear();
  elements.voiceHint.textContent = "Для распознавания речи может понадобиться интернет. Без сети можно заполнить событие вручную.";
}

function editEvent(id) {
  const event = events.find(item => item.id === id);
  if (!event) return;
  isDayView = false;
  render();
  editingEventId = id;
  voiceDraft = false;
  elements.formHeading.textContent = "Изменить событие";
  elements.saveEventButton.textContent = "Сохранить изменения";
  elements.cancelEditButton.hidden = false;
  elements.title.value = event.title;
  elements.date.value = event.date;
  elements.time.value = event.time || "";
  elements.duration.value = String(event.durationMinutes || 60);
  elements.repeat.value = event.repeat === "weekly" ? "weekly" : "none";
  updateRepeatHint();
  elements.place.value = event.place || "";
  elements.notes.value = event.notes || "";
  elements.transcriptBox.hidden = true;
  elements.addVoiceButton.hidden = true;
  elements.recordButton.hidden = true;
  manualFieldsTouched = false;
  touchedFields.clear();
  voiceFields.clear();
  document.querySelector("#create-card").scrollIntoView({ behavior: "smooth", block: "center" });
  elements.title.focus({ preventScroll: true });
  saveStorage();
}

function deleteEvent(id) {
  const event = events.find(item => item.id === id);
  const confirmation = event && event.repeat === "weekly"
    ? `Удалить событие «${event.title}» и все его повторения?`
    : `Удалить событие «${event?.title}»?`;
  if (!event || !window.confirm(confirmation)) return;
  events = events.filter(item => item.id !== id);
  if (saveStorage()) {
    render();
    showStatus("Событие удалено.", "success");
  }
}

function addTask(text) {
  const trimmed = text.trim();
  if (!trimmed) return;
  const newTask = { id: createId(), text: trimmed, completed: false };
  tasks.push(newTask);
  if (saveStorage()) {
    elements.taskInput.value = "";
    renderTasks();
  } else {
    tasks = tasks.filter(task => task.id !== newTask.id);
  }
}

function parseSpokenMessage(raw) {
  const text = raw.trim();
  let remaining = text;
  let date = "";
  let time = "";
  let place = "";

  const relative = [
    [/послезавтра/i, 2], [/завтра/i, 1], [/сегодня/i, 0]
  ].find(([pattern]) => pattern.test(remaining));
  if (relative) {
    const target = new Date();
    target.setDate(target.getDate() + relative[1]);
    date = dateKey(target);
    remaining = remaining.replace(relative[0], " ");
  } else {
    const weekdayPattern = new RegExp(`(?:^|\\s)(?:в\\s+)?(${weekdayNames.join("|")})(?=$|\\s|[,!.?])`, "i");
    const weekdayMatch = remaining.match(weekdayPattern);
    if (weekdayMatch) {
      const weekday = weekdayNames.findIndex(name => name.toLowerCase() === weekdayMatch[1].toLowerCase());
      const target = new Date();
      let difference = (weekday - target.getDay() + 7) % 7;
      target.setDate(target.getDate() + difference);
      date = dateKey(target);
      remaining = remaining.replace(weekdayMatch[0], " ");
    } else {
      const namedDate = remaining.match(/(?:^|\s)(\d{1,2})(?:-го)?\s+([а-яё]+)/i);
      if (namedDate) {
        const monthName = namedDate[2].toLowerCase();
        const monthEntry = [...monthsByName.entries()].find(([prefix]) => monthName.startsWith(prefix));
        if (monthEntry) {
          const day = Number(namedDate[1]);
          const month = monthEntry[1];
          const year = new Date().getFullYear() + (month < new Date().getMonth() ? 1 : 0);
          const candidate = new Date(year, month, day);
          if (candidate.getMonth() === month && candidate.getDate() === day) {
            date = dateKey(candidate);
            remaining = remaining.replace(namedDate[0], " ");
          }
        }
      }
    }
  }

  const timeMatch = remaining.match(/(?:^|\s)(?:(?:в|к|около|на)\s*)?(\d{1,2})[:.](\d{2})(?=$|\s)|(?:^|\s)(?:в|к|около|на)\s*(\d{1,2})(?=$|\s)/i);
  if (timeMatch) {
    const hour = Number(timeMatch[1] || timeMatch[3]);
    const minute = Number(timeMatch[2] || "0");
    if (hour < 24 && minute < 60) {
      time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
      remaining = remaining.replace(timeMatch[0], " ");
    }
  }

  const placeMatch = remaining.match(/(?:^|\s)(?:в|на)\s+((?:кафе|офисе|доме|парке|центре|клинике|школе|университете|работе|вокзале|аэропорту)(?:\s+[^,.!?]+)*)/i);
  if (placeMatch) {
    place = placeMatch[1].trim();
    remaining = remaining.replace(placeMatch[0], " ");
  }

  const title = remaining
    .replace(/(?:^|\s)(?:давай|нужно|надо|запланируй|напомни|встретиться|сходить|пойти|будет|мне|пожалуйста)(?=$|\s)/gi, " ")
    .replace(/[,.!?;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { title, date, time, place };
}

function beginRecognition(mode) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    showStatus("В этом браузере не поддерживается распознавание речи. Заполни поля события вручную — они не будут потеряны.", "error");
    return;
  }
  if (recognition) {
    recognition.abort();
    recognition = null;
  }

  if (mode === "initial" && !editingEventId) {
    if (voiceDraft || manualFieldsTouched) {
      mode = "additional";
      voiceDraft = true;
      elements.addVoiceButton.hidden = false;
      if (!touchedFields.has("date")) elements.date.value = "";
      if (!touchedFields.has("time")) elements.time.value = "";
    } else {
      elements.date.value = "";
      elements.transcriptBox.hidden = true;
      elements.transcript.value = "";
      voiceDraft = true;
      voiceFields.clear();
      elements.formHeading.textContent = "Проверь черновик";
      elements.cancelEditButton.hidden = false;
      elements.voiceHint.textContent = "Черновик не попадёт в календарь, пока ты его не подтвердишь. Распознавание может требовать интернет.";
    }
  }
  saveStorage();

  clearStatus();
  const speech = new SpeechRecognition();
  recognition = speech;
  speech.lang = "ru-RU";
  speech.interimResults = true;
  speech.continuous = false;
  elements.recordButton.classList.add("recording");
  elements.recordButton.innerHTML = '<span aria-hidden="true">●</span> Слушаю…';
  elements.recordButton.disabled = true;
  showStatus(mode === "additional" ? "Говори детали — они добавятся к текущему черновику." : "Слушаю. Расскажи о своём плане.", "");

  let finalText = "";
  speech.onresult = event => {
    let interim = "";
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const resultText = event.results[index][0].transcript;
      if (event.results[index].isFinal) finalText += resultText;
      else interim += resultText;
    }
    elements.voiceHint.textContent = interim ? `Распознано: ${interim}` : "Речь распознана, обрабатываю…";
  };
  speech.onerror = event => {
    const messages = {
      "not-allowed": "Нет доступа к микрофону. Разреши его в настройках браузера или заполни событие вручную.",
      "service-not-allowed": "Сервис распознавания речи недоступен. Попробуй другой браузер или введи текст вручную.",
      "no-speech": "Не удалось услышать речь. Попробуй ещё раз или введи детали вручную.",
      "network": "Сервис распознавания недоступен без сети. Черновик сохранён; можно продолжить вручную."
    };
    showStatus(messages[event.error] || "Не удалось распознать голос. Введи или проверь детали вручную.", "error");
  };
  speech.onend = () => {
    elements.recordButton.classList.remove("recording");
    elements.recordButton.innerHTML = '<span aria-hidden="true">♩</span> Записать голосом';
    elements.recordButton.disabled = false;
    recognition = null;
    if (finalText.trim()) {
      applyVoiceText(finalText.trim(), mode);
    } else if (elements.status.textContent.startsWith("Слушаю.")) {
      showStatus("Речь не распознана. Попробуй ещё раз или введи текст вручную.", "error");
    }
  };

  try {
    speech.start();
  } catch (error) {
    recognition = null;
    elements.recordButton.classList.remove("recording");
    elements.recordButton.innerHTML = '<span aria-hidden="true">♩</span> Записать голосом';
    elements.recordButton.disabled = false;
    showStatus("Не удалось начать запись. Проверь разрешение на микрофон и попробуй снова.", "error");
    console.error("Не удалось запустить распознавание речи:", error);
  }
}

function applyVoiceText(text, mode) {
  const parsed = parseSpokenMessage(text);
  if (mode === "initial") {
    voiceDraft = true;
    elements.transcriptBox.hidden = false;
    elements.transcript.value = text;
    elements.title.value = parsed.title || text;
    elements.date.value = parsed.date;
    elements.time.value = parsed.time;
    elements.place.value = parsed.place;
    elements.notes.value = "";
    for (const [field, value] of [["title", parsed.title || text], ["date", parsed.date], ["time", parsed.time], ["place", parsed.place]]) {
      if (value) voiceFields.add(field);
    }
    elements.addVoiceButton.hidden = false;
    elements.cancelEditButton.hidden = false;
    const missing = [];
    if (!parsed.date) missing.push("дату");
    if (!parsed.time) missing.push("время");
    showStatus(missing.length
      ? `Черновик готов. Уточни ${missing.join(" и ")} в полях ниже — я не стала их угадывать.`
      : "Черновик готов. Проверь детали, при необходимости добавь ещё голосом и подтверди событие.", missing.length ? "" : "success");
  } else {
    voiceDraft = true;
    const conflicts = [];
    if (parsed.date && (voiceFields.has("date") || touchedFields.has("date")) && parsed.date !== elements.date.value) conflicts.push("дата");
    if (parsed.time && (voiceFields.has("time") || touchedFields.has("time")) && parsed.time !== elements.time.value) conflicts.push("время");
    if (parsed.place && (voiceFields.has("place") || touchedFields.has("place")) && parsed.place.toLowerCase() !== elements.place.value.trim().toLowerCase()) conflicts.push("место");

    elements.transcriptBox.hidden = false;
    elements.transcript.value = `${elements.transcript.value}${elements.transcript.value ? "\n" : ""}${text}`;
    if (!elements.title.value.trim() && parsed.title) elements.title.value = parsed.title;
    if (parsed.date && !voiceFields.has("date") && !touchedFields.has("date")) {
      elements.date.value = parsed.date;
      voiceFields.add("date");
    }
    if (parsed.time && !voiceFields.has("time") && !touchedFields.has("time")) {
      elements.time.value = parsed.time;
      voiceFields.add("time");
    }
    if (parsed.place && !voiceFields.has("place") && !touchedFields.has("place")) {
      elements.place.value = parsed.place;
      voiceFields.add("place");
    }
    const existingNotes = elements.notes.value.trim();
    elements.notes.value = existingNotes ? `${existingNotes}\n${text}` : text;
    if (conflicts.length) {
      showStatus(`Дополнение сохранено, прежние данные не заменены. Есть другое значение для поля: ${conflicts.join(", ")}. Уточни его вручную.`, "error");
    } else {
      voiceDraft = true;
      showStatus("Голосовые детали добавлены к черновику. Проверь обновлённые поля перед подтверждением.", "success");
    }
  }
  saveStorage();
}

function saveEvent(event) {
  event.preventDefault();
  clearStatus();
  const title = elements.title.value.trim();
  const date = elements.date.value;
  const time = elements.time.value;
  if (!title || !date) {
    showStatus("Заполни название и дату события.", "error");
    return;
  }
  if (voiceDraft && !time) {
    showStatus("В голосовом черновике не было времени. Уточни время вручную или добавь его голосом, чтобы продолжить.", "error");
    elements.time.focus();
    return;
  }

  const eventData = {
    id: editingEventId || createId(),
    title,
    date,
    time,
    durationMinutes: Number(elements.duration.value) || 60,
    repeat: elements.repeat.value,
    place: elements.place.value.trim(),
    notes: elements.notes.value.trim()
  };
  const conflict = findScheduleConflict(eventData);
  if (conflict) {
    showStatus(`Накладка: «${eventData.title}» пересекается с «${conflict.event.title}» ${formatSelectedDate(conflict.date)}. Измени время или день, чтобы сохранить занятие.`, "error");
    elements.time.focus();
    return;
  }
  const originalEvents = events;
  events = editingEventId
    ? events.map(item => item.id === editingEventId ? eventData : item)
    : [...events, eventData];

  if (!saveStorage(null)) {
    events = originalEvents;
    return;
  }
  selectedDate = date;
  const eventDate = new Date(`${date}T12:00:00`);
  displayedMonth = new Date(eventDate.getFullYear(), eventDate.getMonth(), 1);
  resetEventForm();
  render();
  showStatus("Событие сохранено в планнере. Нажми «ICS» рядом с ним, чтобы скачать файл для календаря.", "success");
}

function downloadIcs(event) {
  const formatDate = date => date.getFullYear()
    + String(date.getMonth() + 1).padStart(2, "0")
    + String(date.getDate()).padStart(2, "0");
  const start = event.time ? new Date(`${event.date}T${event.time}:00`) : null;
  const end = start ? new Date(start.getTime() + (Number(event.durationMinutes) || 60) * 60 * 1000) : null;
  const allDayEnd = new Date(`${event.date}T12:00:00`);
  allDayEnd.setDate(allDayEnd.getDate() + 1);
  const escapeIcs = value => String(value).replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Quiet Day Planner//RU",
    "CALSCALE:GREGORIAN", "BEGIN:VEVENT",
    `UID:${event.id}@quiet-day-planner`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`,
    ...(start
      ? [`DTSTART:${formatDate(start)}T${String(start.getHours()).padStart(2, "0")}${String(start.getMinutes()).padStart(2, "0")}00`,
        `DTEND:${formatDate(end)}T${String(end.getHours()).padStart(2, "0")}${String(end.getMinutes()).padStart(2, "0")}00`]
      : [`DTSTART;VALUE=DATE:${event.date.replace(/-/g, "")}`,
        `DTEND;VALUE=DATE:${formatDate(allDayEnd)}`]),
    `SUMMARY:${escapeIcs(event.title)}`
  ];
  if (event.repeat === "weekly") {
    const weekdays = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
    const weekday = weekdays[new Date(`${event.date}T12:00:00`).getDay()];
    lines.push(`RRULE:FREQ=WEEKLY;BYDAY=${weekday}`);
  }
  if (event.place) lines.push(`LOCATION:${escapeIcs(event.place)}`);
  if (event.notes) lines.push(`DESCRIPTION:${escapeIcs(event.notes)}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  const blob = new Blob([`\uFEFF${lines.join("\r\n")}`], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${event.date}-${event.title.replace(/[^\p{L}\p{N}-]+/gu, "-").replace(/^-|-$/g, "") || "event"}.ics`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

elements.previousMonth.addEventListener("click", () => {
  displayedMonth = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() - 1, 1);
  renderCalendar();
});
elements.nextMonth.addEventListener("click", () => {
  displayedMonth = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() + 1, 1);
  renderCalendar();
});
elements.todayButton.addEventListener("click", () => {
  selectedDate = dateKey(today);
  displayedMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  render();
});
elements.backToCalendar.addEventListener("click", () => {
  isDayView = false;
  render();
});
for (const [button, offset] of [[elements.previousDay, -1], [elements.nextDay, 1]]) {
  button.addEventListener("click", () => {
    const date = new Date(`${selectedDate}T12:00:00`);
    date.setDate(date.getDate() + offset);
    selectedDate = dateKey(date);
    displayedMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    render();
  });
}
elements.taskForm.addEventListener("submit", event => {
  event.preventDefault();
  addTask(elements.taskInput.value);
});
elements.eventForm.addEventListener("submit", saveEvent);
elements.recordButton.addEventListener("click", () => beginRecognition("initial"));
elements.addVoiceButton.addEventListener("click", () => beginRecognition("additional"));
elements.repeat.addEventListener("change", () => {
  manualFieldsTouched = true;
  elements.cancelEditButton.hidden = false;
  updateRepeatHint();
  saveStorage();
});
elements.date.addEventListener("input", updateRepeatHint);
elements.exportBackupButton.addEventListener("click", downloadBackup);
elements.importBackupButton.addEventListener("click", () => elements.backupFileInput.click());
elements.backupFileInput.addEventListener("change", () => {
  const [file] = elements.backupFileInput.files;
  if (file) restoreBackup(file);
  elements.backupFileInput.value = "";
});
for (const field of [elements.title, elements.date, elements.time, elements.place, elements.notes]) {
  field.addEventListener("input", () => {
    manualFieldsTouched = true;
    touchedFields.add(field.name);
    elements.cancelEditButton.hidden = false;
    saveStorage();
  });
}
elements.transcript.addEventListener("input", () => saveStorage());
elements.cancelEditButton.addEventListener("click", () => {
  resetEventForm();
  saveStorage(null);
  clearStatus();
});
readStorage();
if (!draftRestored) elements.date.value = selectedDate;
updateRepeatHint();
render();
