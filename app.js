"use strict";

const STORAGE_KEY = "quiet-day-planner-v1";
const BACKUP_FORMAT = "quiet-day-planner-backup";
const BACKUP_VERSION = 1;
const monthNames = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
const monthNamesGenitive = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
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
  dayAddButton: document.querySelector("#day-add-button"),
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
  endTime: document.querySelector("#event-end-time"),
  repeat: document.querySelector("#event-repeat"),
  repeatHint: document.querySelector("#repeat-hint"),
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
let isDayAddOpen = false;
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
    endTime: elements.endTime.value,
    repeat: elements.repeat.value,
    transcript: elements.transcript.value,
    voiceDraft,
    editingEventId,
    manualFieldsTouched,
    touchedFields: [...touchedFields],
    voiceFields: [...voiceFields]
  };
  const hasContent = [draft.title, draft.time, draft.endTime, draft.transcript].some(value => value.trim())
    || draft.repeat === "weekly";
  return hasContent ? draft : null;
}

function restoreDraft(draft) {
  if (!draft || typeof draft !== "object") return;
  draftRestored = true;
  elements.title.value = typeof draft.title === "string" ? draft.title : "";
  elements.date.value = typeof draft.date === "string" ? draft.date : "";
  elements.time.value = typeof draft.time === "string" ? draft.time : "";
  elements.endTime.value = typeof draft.endTime === "string" ? draft.endTime : "";
  if (!elements.endTime.value && elements.time.value && draft.durationMinutes != null) {
    const start = new Date(`2000-01-01T${elements.time.value}:00`);
    elements.endTime.value = formatTimeValue(new Date(start.getTime() + (Number(draft.durationMinutes) || 60) * 60000));
  }
  elements.repeat.value = draft.repeat === "weekly" ? "weekly" : "none";
  elements.transcript.value = typeof draft.transcript === "string" ? draft.transcript : "";
  elements.transcriptBox.hidden = !elements.transcript.value;
  voiceDraft = Boolean(draft.voiceDraft);
  editingEventId = typeof draft.editingEventId === "string" && events.some(event => event.id === draft.editingEventId)
    ? draft.editingEventId
    : null;
  manualFieldsTouched = Boolean(draft.manualFieldsTouched);
  if (Array.isArray(draft.touchedFields)) {
    for (const field of draft.touchedFields) {
      if (["title", "date", "time", "endTime", "repeat"].includes(field)) touchedFields.add(field);
    }
  }
  if (Array.isArray(draft.voiceFields)) {
    for (const field of draft.voiceFields) {
      if (["title", "date", "time", "endTime", "repeat"].includes(field)) voiceFields.add(field);
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
      && (event.durationMinutes === undefined || event.durationMinutes === null
        || Number.isInteger(event.durationMinutes) && event.durationMinutes >= 1 && event.durationMinutes < 1440)
      && (event.endTime === undefined || event.endTime === "" || /^\d{2}:\d{2}$/.test(event.endTime)))
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
  elements.appShell.classList.toggle("day-add-open", isDayAddOpen);
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

function getEventEndDate(event, occurrenceDate) {
  const start = new Date(`${occurrenceDate}T${event.time}:00`);
  const end = event.endTime
    ? new Date(`${occurrenceDate}T${event.endTime}:00`)
    : new Date(start.getTime() + (Number(event.durationMinutes) || 60) * 60000);
  if (end <= start) end.setDate(end.getDate() + 1);
  return end;
}

function getEventDurationMinutes(startTime, endTime) {
  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);
  let duration = endHour * 60 + endMinute - startHour * 60 - startMinute;
  if (duration < 0) duration += 24 * 60;
  return duration;
}

function formatTimeValue(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
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
    ? getEventEndDate(event, key)
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
  const end = getEventEndDate(event, occurrenceDate);
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
  clearStatus();
  elements.voiceHint.textContent = "Для распознавания речи может понадобиться интернет. Без сети можно заполнить событие вручную.";
}

function editEvent(id) {
  const event = events.find(item => item.id === id);
  if (!event) return;
  isDayView = false;
  isDayAddOpen = false;
  render();
  editingEventId = id;
  voiceDraft = false;
  elements.formHeading.textContent = "Изменить событие";
  elements.saveEventButton.textContent = "Сохранить изменения";
  elements.cancelEditButton.hidden = false;
  elements.title.value = event.title;
  elements.date.value = event.date;
  elements.time.value = event.time || "";
  elements.endTime.value = event.time ? event.endTime || formatTimeValue(getEventEndDate(event, event.date)) : "";
  elements.repeat.value = event.repeat === "weekly" ? "weekly" : "none";
  updateRepeatHint();
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
  let remaining = raw.trim();
  let date = "";
  let time = "";
  let endTime = "";
  let repeat = null;
  let durationMinutes = null;
  let durationConflict = false;
  const weekdayPatterns = [
    { day: 0, pattern: "воскресенье|воскресенья|воскресеньям" },
    { day: 1, pattern: "понедельник|понедельника|понедельникам" },
    { day: 2, pattern: "вторник|вторника|вторникам" },
    { day: 3, pattern: "среда|среду|среды|средам" },
    { day: 4, pattern: "четверг|четверга|четвергам" },
    { day: 5, pattern: "пятница|пятницу|пятницы|пятницам" },
    { day: 6, pattern: "суббота|субботу|субботы|субботам" }
  ];
  const alternatives = weekdayPatterns.map(item => item.pattern).join("|");
  const weekdayMatch = remaining.match(new RegExp(`(?:^|\\s)(?:(каждый|каждую|каждое|по|в|на)\\s+)?(${alternatives})(?=$|\\s|[,!.?])`, "i"));
  const weekdayEntry = weekdayMatch && weekdayPatterns.find(item =>
    new RegExp(`^(?:${item.pattern})$`, "i").test(weekdayMatch[2])
  );
  const weeklyPhrase = remaining.match(/(?:^|\s)(?:каждую\s+неделю|еженедельно)(?=$|\s|[,!.?])/i);
  if (weeklyPhrase || weekdayMatch && /^(каждый|каждую|каждое|по)$/i.test(weekdayMatch[1] || "")) repeat = "weekly";

  const relative = [[/послезавтра/i, 2], [/завтра/i, 1], [/сегодня/i, 0]]
    .find(([pattern]) => pattern.test(remaining));
  if (relative) {
    const target = new Date();
    target.setDate(target.getDate() + relative[1]);
    date = dateKey(target);
    remaining = remaining.replace(relative[0], " ");
  }
  const namedDate = remaining.match(/(?:^|\s)(\d{1,2})(?:-го)?\s+([а-яё]+)/i);
  if (!date && namedDate) {
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
  if (weekdayMatch) {
    if (!date && weekdayEntry) {
      const target = new Date();
      target.setDate(target.getDate() + (weekdayEntry.day - target.getDay() + 7) % 7);
      date = dateKey(target);
    }
    remaining = remaining.replace(weekdayMatch[0], " ");
  }
  if (weeklyPhrase) remaining = remaining.replace(weeklyPhrase[0], " ");

  const rangeMatch = remaining.match(/(?:^|\s)(?:с\s*)?(\d{1,2})(?:(?:[:.])(\d{2})|(?:\s+)(\d{2}))?\s*(?:до|[-–—])\s*(\d{1,2})(?:(?:[:.])(\d{2})|(?:\s+)(\d{2}))?(?=$|\s|[,!.?])/i);
  if (rangeMatch) {
    const startHour = Number(rangeMatch[1]);
    const startMinute = Number(rangeMatch[2] || rangeMatch[3] || "0");
    const endHour = Number(rangeMatch[4]);
    const endMinute = Number(rangeMatch[5] || rangeMatch[6] || "0");
    if (startHour < 24 && startMinute < 60 && endHour < 24 && endMinute < 60) {
      time = `${String(startHour).padStart(2, "0")}:${String(startMinute).padStart(2, "0")}`;
      endTime = `${String(endHour).padStart(2, "0")}:${String(endMinute).padStart(2, "0")}`;
      durationMinutes = getEventDurationMinutes(time, endTime);
      remaining = remaining.replace(rangeMatch[0], " ");
    }
  }
  if (!time) {
    const timeMatch = remaining.match(/(?:^|\s)(?:(?:в|к|около|с)\s*)?(\d{1,2})(?:(?:[:.])(\d{2})|(?:\s+)(\d{2})|\s+час(?:а|ов)?)(?=$|\s|[,!.?])/i)
      || remaining.match(/(?:^|\s)(?:в|к|около|с)\s*(\d{1,2})(?=$|\s|[,!.?])/i);
    if (timeMatch) {
      const hour = Number(timeMatch[1]);
      const minute = Number(timeMatch[2] || timeMatch[3] || "0");
      if (hour < 24 && minute < 60) {
        time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
        remaining = remaining.replace(timeMatch[0], " ");
      }
    }
  }

  const durationMatch = remaining.match(/(?:^|\s)(?:(?:на|продолжительностью|длительностью|продолжительность|длительность)\s+)?(полчаса|полтора\s+часа|(?:(\d+(?:[,.]\d+)?|пятнадцать|тридцать|сорок|пятьдесят|один|одна|два|две|три|четыре)\s*)?(минут(?:у|ы)?|мин|час(?:а|ов)?))(?=$|\s|[,!.?])/i);
  if (durationMatch) {
    const phrase = durationMatch[1].toLowerCase();
    const unit = durationMatch[3] || "час";
    if (phrase === "полчаса") durationMinutes = 30;
    else if (phrase.startsWith("полтора")) durationMinutes = 90;
    else if (durationMatch[2]) {
      const spokenNumbers = { пятнадцать: 15, тридцать: 30, сорок: 40, пятьдесят: 50, один: 1, одна: 1, два: 2, две: 2, три: 3, четыре: 4 };
      const amount = spokenNumbers[durationMatch[2]] || Number(String(durationMatch[2]).replace(",", "."));
      durationMinutes = Math.round(amount * (unit.startsWith("мин") ? 1 : 60));
    } else if (unit.startsWith("мин")) durationMinutes = 1;
    else if (/на\s|длительност|продолжительност/i.test(durationMatch[0])) durationMinutes = 60;
    if (durationMinutes) remaining = remaining.replace(durationMatch[0], " ");
  }
  if (time && durationMinutes && endTime) {
    durationConflict = getEventDurationMinutes(time, endTime) !== durationMinutes;
  } else if (time && durationMinutes && !endTime) {
    const [hour, minute] = time.split(":").map(Number);
    const endMinutes = (hour * 60 + minute + durationMinutes) % (24 * 60);
    endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;
  }
  const title = remaining
    .replace(/(?:^|\s)(?:давай|нужно|надо|запланируй|напомни|встретиться|сходить|пойти|будет|мне|пожалуйста)(?=$|\s)/gi, " ")
    .replace(/[,.!?;:]+/g, " ").replace(/\s+/g, " ").trim();
  return { title, date, time, endTime, repeat, durationMinutes, durationConflict };
}

function beginRecognition(mode) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    showStatus("В этом браузере не поддерживается распознавание речи. Заполни поля вручную.", "error");
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
      if (!touchedFields.has("date") && !voiceFields.has("date")) elements.date.value = "";
      if (!touchedFields.has("time") && !voiceFields.has("time")) elements.time.value = "";
      if (!touchedFields.has("endTime") && !voiceFields.has("endTime")) elements.endTime.value = "";
    } else {
      elements.date.value = "";
      elements.time.value = "";
      elements.endTime.value = "";
      elements.repeat.value = "none";
      elements.transcriptBox.hidden = true;
      elements.transcript.value = "";
      voiceDraft = true;
      voiceFields.clear();
      elements.formHeading.textContent = "Проверь черновик";
      elements.cancelEditButton.hidden = false;
      elements.voiceHint.textContent = "Можно назвать день, дату, время начала и окончания или длительность.";
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
  showStatus(mode === "additional" ? "Говори детали — они добавятся к текущему черновику." : "Слушаю. Расскажи о своём плане.");
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
      "not-allowed": "Нет доступа к микрофону. Разреши его в настройках браузера или заполни поля вручную.",
      "service-not-allowed": "Сервис распознавания речи недоступен. Попробуй другой браузер или введи данные вручную.",
      "no-speech": "Не удалось услышать речь. Попробуй ещё раз или введи данные вручную.",
      "network": "Сервис распознавания недоступен без сети. Черновик сохранён; можно продолжить вручную."
    };
    showStatus(messages[event.error] || "Не удалось распознать голос. Проверь данные вручную.", "error");
  };
  speech.onend = () => {
    elements.recordButton.classList.remove("recording");
    elements.recordButton.innerHTML = '<span aria-hidden="true">♩</span> Записать голосом';
    elements.recordButton.disabled = false;
    recognition = null;
    if (finalText.trim()) applyVoiceText(finalText.trim(), mode);
    else if (elements.status.textContent.startsWith("Слушаю.")) showStatus("Речь не распознана. Попробуй ещё раз или введи данные вручную.", "error");
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
  const parsedEndTime = parsed.endTime || (parsed.durationMinutes && elements.time.value
    ? formatTimeValue(new Date(new Date(`2000-01-01T${elements.time.value}:00`).getTime() + parsed.durationMinutes * 60000))
    : "");
  const assignments = [
    ["date", parsed.date, elements.date],
    ["time", parsed.time, elements.time],
    ["endTime", parsedEndTime, elements.endTime],
    ["repeat", parsed.repeat, elements.repeat]
  ];
  const conflicts = [];
  if (mode === "additional") {
    for (const [field, value, input] of assignments) {
      if (value && (touchedFields.has(field) || voiceFields.has(field)) && input.value !== value) conflicts.push(field);
    }
    if (parsed.durationMinutes && elements.time.value && elements.endTime.value
      && getEventDurationMinutes(elements.time.value, elements.endTime.value) !== parsed.durationMinutes) {
      conflicts.push("длительность");
    }
  }
  elements.transcriptBox.hidden = false;
  elements.transcript.value = `${elements.transcript.value}${elements.transcript.value ? "\n" : ""}${text}`;
  if (mode === "initial" || !elements.title.value.trim()) elements.title.value = parsed.title || (mode === "initial" ? text : elements.title.value);
  for (const [field, value, input] of assignments) {
    if (!value || conflicts.includes(field)) continue;
    if (mode === "initial" || !touchedFields.has(field) && !voiceFields.has(field)) {
      input.value = value;
      voiceFields.add(field);
    }
  }
  if (parsed.title) voiceFields.add("title");
  voiceDraft = true;
  elements.addVoiceButton.hidden = false;
  elements.cancelEditButton.hidden = false;
  updateRepeatHint();

  const missing = [];
  if (!elements.date.value) missing.push("дату или день недели");
  if (!elements.time.value) missing.push("время начала");
  if (!elements.endTime.value) missing.push("время окончания или длительность");
  if (parsed.durationConflict && !conflicts.includes("длительность")) conflicts.push("длительность");
  if (conflicts.length) {
    showStatus(`В голосовых данных есть противоречие: ${conflicts.join(", ")}. Уточни значения вручную.`, "error");
  } else if (missing.length) {
    showStatus(`Черновик готов. Уточни ${missing.join(", ")} перед сохранением.`, "error");
  } else {
    showStatus("Голосовой черновик готов. Проверь дату, время и повтор перед сохранением.", "success");
  }
  saveStorage();
}

function saveEvent(event) {
  event.preventDefault();
  clearStatus();
  const title = elements.title.value.trim();
  const date = elements.date.value;
  const time = elements.time.value;
  const endTime = elements.endTime.value;
  if (!title || !date) {
    showStatus("Заполни название и дату события.", "error");
    return;
  }
  if (Boolean(time) !== Boolean(endTime)) {
    showStatus("Укажи время начала и окончания или оставь оба поля пустыми для события на весь день.", "error");
    (time ? elements.endTime : elements.time).focus();
    return;
  }
  if (time && time === endTime) {
    showStatus("Время окончания должно отличаться от времени начала.", "error");
    elements.endTime.focus();
    return;
  }
  if (voiceDraft && (!time || !endTime)) {
    showStatus("В голосовом черновике не хватило времени начала или окончания. Уточни оба поля перед сохранением.", "error");
    (time ? elements.endTime : elements.time).focus();
    return;
  }

  const eventData = {
    id: editingEventId || createId(),
    title,
    date,
    time,
    endTime,
    durationMinutes: time ? getEventDurationMinutes(time, endTime) : null,
    repeat: elements.repeat.value,
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
  isDayAddOpen = false;
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
  const end = start ? getEventEndDate(event, event.date) : null;
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
  isDayAddOpen = false;
  render();
});
elements.dayAddButton.addEventListener("click", () => {
  if (isDayAddOpen) {
    isDayAddOpen = false;
    render();
    return;
  }
  resetEventForm();
  isDayAddOpen = true;
  render();
  elements.title.focus({ preventScroll: true });
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
for (const field of [elements.title, elements.date, elements.time, elements.endTime, elements.repeat]) {
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
