flatpickr("#dueDateInput", {
  enableTime: true,
  dateFormat: "M j, Y h:i K",
  minDate: "today",
  appendTo: document.getElementById("dateWrapper"),
  position: "below"
});

// ── Data ────────────────────────────────────────────────────────────────
let groups = {};
let nextGroupId = 1;
let expandedGroups = {};
let addingSubgroupTo = null;
let editingGroupId   = null;
let tasks = [];   // [{ id, name, dueDate, dueDateDisplay, groupId }]
let nextTaskId = 1;
let undoStack = [];
let selectedGroups = new Set(); // empty = show all; non-empty = show only these

function toggleFilterDropdown() {
  const dd = document.getElementById("filterDropdown");
  if (dd.style.display === "none") {
    renderFilterDropdown();
    dd.style.display = "block";
  } else {
    dd.style.display = "none";
  }
}

function renderFilterDropdown() {
  const list = document.getElementById("filterList");
  list.innerHTML = "";

  // Show All row
  const showAllRow = document.createElement("label");
  showAllRow.style.cssText = "display:flex; align-items:center; gap:8px; padding:7px 14px; cursor:pointer; font-size:14px; font-weight:bold; border-bottom:1px solid #eee;";
  showAllRow.onmouseover = () => showAllRow.style.background = "#f5f5f5";
  showAllRow.onmouseout  = () => showAllRow.style.background = "";
  const showAllCb = document.createElement("input");
  showAllCb.type = "checkbox";
  showAllCb.checked = selectedGroups.size === 0;
  showAllCb.onchange = () => {
    selectedGroups.clear();
    updateFilterBtn();
    renderFilterDropdown();
    renderTasks();
  };
  showAllRow.appendChild(showAllCb);
  showAllRow.appendChild(document.createTextNode("Show All"));
  list.appendChild(showAllRow);

  // Build ordered list: parents first, then their subgroups indented
  const topLevel = Object.entries(groups).filter(([, g]) => !g.parentId);
  const items = [{ id: "none", label: "No Group", color: "#888", indent: false }];
  topLevel.forEach(([pid, pg]) => {
    items.push({ id: pid, label: pg.name, color: pg.color, indent: false });
    Object.entries(groups).filter(([, g]) => g.parentId === pid).forEach(([sid, sg]) => {
      items.push({ id: sid, label: sg.name, color: sg.color, indent: true });
    });
  });

  items.forEach(({ id, label, color, indent }) => {
    const row = document.createElement("label");
    row.style.cssText = `display:flex; align-items:center; gap:8px; padding:7px 14px; padding-left:${indent ? "28px" : "14px"}; cursor:pointer; font-size:14px;`;
    row.onmouseover = () => row.style.background = "#f5f5f5";
    row.onmouseout  = () => row.style.background = "";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = selectedGroups.has(id);
    cb.onchange = () => {
      if (cb.checked) {
        selectedGroups.add(id);
      } else {
        selectedGroups.delete(id);
        // if unchecking a parent, also uncheck its subgroups
        Object.entries(groups).filter(([, g]) => g.parentId === id).forEach(([sid]) => selectedGroups.delete(sid));
      }
      updateFilterBtn();
      renderFilterDropdown();
      renderTasks();
    };

    const dot = document.createElement("span");
    dot.style.cssText = `width:10px; height:10px; border-radius:50%; background:${color}; display:inline-block; flex-shrink:0;`;

    row.appendChild(cb);
    row.appendChild(dot);
    row.appendChild(document.createTextNode(label));
    list.appendChild(row);
  });
}

function updateFilterBtn() {
  document.getElementById("filterBtn").style.background = selectedGroups.size ? "#e17055" : "#6c5ce7";
}

function snapshot() {
  undoStack.push({
    tasks: JSON.parse(JSON.stringify(tasks)),
    groups: JSON.parse(JSON.stringify(groups)),
    nextTaskId,
    nextGroupId
  });
  if (undoStack.length > 20) undoStack.shift();
  document.getElementById("undoBtn").disabled = false;
}

function undo() {
  if (!undoStack.length) return;
  const prev = undoStack.pop();
  tasks = prev.tasks;
  groups = prev.groups;
  nextTaskId = prev.nextTaskId;
  nextGroupId = prev.nextGroupId;
  save();
  renderTasks();
  renderGroupSelect();
  document.getElementById("undoBtn").disabled = undoStack.length === 0;
}

// ── Persistence ─────────────────────────────────────────────────────────
function save() {
  localStorage.setItem("todo_groups", JSON.stringify(groups));
  localStorage.setItem("todo_nextGroupId", nextGroupId);
  localStorage.setItem("todo_tasks", JSON.stringify(tasks));
  localStorage.setItem("todo_nextTaskId", nextTaskId);
}

function load() {
  try {
    groups      = JSON.parse(localStorage.getItem("todo_groups"))      || {};
    nextGroupId = parseInt(localStorage.getItem("todo_nextGroupId"))   || 1;
    tasks       = JSON.parse(localStorage.getItem("todo_tasks"))       || [];
    nextTaskId  = parseInt(localStorage.getItem("todo_nextTaskId"))    || 1;
  } catch (_) {}
}

// ── Email reminders ─────────────────────────────────────────────────────
const REMINDER_API = "https://to-do-list-six-lovat.vercel.app";

let emailModalResolve = null;

function openEmailModal() {
  return new Promise(resolve => {
    emailModalResolve = resolve;
    const saved = localStorage.getItem("todo_reminder_email");
    if (saved) { resolve(saved); return; }
    document.getElementById("emailStep1").style.display = "";
    document.getElementById("emailStep2").style.display = "none";
    document.getElementById("emailInput").value = "";
    document.getElementById("emailError").style.display = "none";
    document.getElementById("emailModal").classList.add("open");
    setTimeout(() => document.getElementById("emailInput").focus(), 50);
  });
}

function emailStep1Continue() {
  const val = document.getElementById("emailInput").value.trim();
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
  if (!valid) { document.getElementById("emailError").style.display = ""; return; }
  document.getElementById("emailConfirmDisplay").textContent = val;
  document.getElementById("emailStep1").style.display = "none";
  document.getElementById("emailStep2").style.display = "";
}

function emailStep2Confirm() {
  const email = document.getElementById("emailInput").value.trim();
  localStorage.setItem("todo_reminder_email", email);
  closeEmailModal(false);
  if (emailModalResolve) { emailModalResolve(email); emailModalResolve = null; }
}

function emailStep2Back() {
  document.getElementById("emailStep1").style.display = "";
  document.getElementById("emailStep2").style.display = "none";
}

function closeEmailModal(cancel = true) {
  document.getElementById("emailModal").classList.remove("open");
  if (cancel && emailModalResolve) { emailModalResolve(null); emailModalResolve = null; }
}

function showReminderPicker(task, bellBtn) {
  if (!task.dueDate) { alert("Add a due date to this task before setting a reminder."); return; }
  document.querySelectorAll(".reminder-picker").forEach(el => el.remove());
  const options = [
    { label: "1 hour before",  hours: 1 },
    { label: "6 hours before", hours: 6 },
    { label: "12 hours before",hours: 12 },
    { label: "24 hours before",hours: 24 },
    { label: "48 hours before",hours: 48 },
  ];
  const picker = document.createElement("div");
  picker.className = "reminder-picker";
  const label = document.createElement("p");
  label.textContent = "Remind me:";
  picker.appendChild(label);
  options.forEach(opt => {
    const btn = document.createElement("button");
    btn.textContent = opt.label;
    btn.onclick = () => { picker.remove(); setReminder(task, opt.hours); };
    picker.appendChild(btn);
  });
  bellBtn.parentElement.style.position = "relative";
  bellBtn.parentElement.appendChild(picker);
  const close = (e) => { if (!picker.contains(e.target)) { picker.remove(); document.removeEventListener("click", close); } };
  setTimeout(() => document.addEventListener("click", close), 0);
}

async function setReminder(task, reminderOffsetHours = 24) {
  const email = await openEmailModal();
  if (!email) return;
  try {
    const res = await fetch(`${REMINDER_API}/api/set-reminder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task_id: task.id, task_name: task.name, due_date: task.dueDate, email, reminder_offset_hours: reminderOffsetHours })
    });
    if (!res.ok) throw new Error();
    const t = tasks.find(t => t.id === task.id);
    if (t) { t.reminderSet = true; t.reminderOffsetHours = reminderOffsetHours; save(); renderTasks(); }
  } catch { alert("Failed to set reminder. Please check your connection."); }
}

async function removeReminder(task) {
  try {
    await fetch(`${REMINDER_API}/api/remove-reminder`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task_id: task.id })
    });
    const t = tasks.find(t => t.id === task.id);
    if (t) { t.reminderSet = false; save(); renderTasks(); }
  } catch { alert("Failed to remove reminder. Please check your connection."); }
}

// ── Priority (client-side, recalculated fresh each render) ──────────────
function calcPriority(dueDateISO) {
  if (!dueDateISO) return { label: "None", color: "#aaa" };
  const hours = (new Date(dueDateISO) - Date.now()) / 36e5;
  if (hours < 0)   return { label: "Overdue",  color: "#c0392b" };
  if (hours <= 24) return { label: "Critical", color: "#e74c3c" };
  if (hours <= 72) return { label: "High",     color: "#e67e22" };
  if (hours <= 168)return { label: "Medium",   color: "#f1c40f" };
                   return { label: "Low",      color: "#27ae60" };
}

// ── Render ───────────────────────────────────────────────────────────────
let dragSrcId = null;

// ── Weather hazard detection ──────────────────────────────────────────────
let currentHazards = [];   // hazards for today
let weatherForecast = {};  // { "YYYY-MM-DD": ['rain', ...] }
let weatherDesc    = "";

const HAZARD_KEYWORDS = {
  rain:  ["wash","car","garden","mow","lawn","paint","bbq","grill","barbecue",
           "bike","run","jog","walk","hike","picnic","window","gutter","roof",
           "plant","outside","outdoor","clean"],
  snow:  ["drive","shovel","walk","run","bike","outside","outdoor","garden","plant"],
  storm: ["outside","outdoor","walk","run","jog","hike","bike","golf","swim",
           "pool","wash","garden","bbq","grill"],
  wind:  ["paint","roof","outside","outdoor","bbq","grill","umbrella","sign"],
  heat:  ["run","jog","hike","bike","outside","outdoor","exercise","walk"],
};

function taskHasWeatherHazard(taskName, dueDateISO) {
  // Pick hazards for the task's due date if available, else today
  let hazards = currentHazards;
  if (dueDateISO) {
    const dateKey = dueDateISO.slice(0, 10); // "YYYY-MM-DD"
    if (weatherForecast[dateKey]) hazards = weatherForecast[dateKey];
  }
  if (!hazards.length) return null;
  const lower = taskName.toLowerCase();
  const triggered = hazards.filter(hazard =>
    HAZARD_KEYWORDS[hazard]?.some(kw => lower.includes(kw))
  );
  return triggered.length ? triggered : null;
}

const HAZARD_ICONS  = { rain:"🌧️", snow:"🌨️", storm:"⛈️", wind:"💨", heat:"🌡️" };
const HAZARD_LABELS = { rain:"Rain", snow:"Snow", storm:"Thunderstorm", wind:"High winds", heat:"Extreme heat" };

function hazardTooltip(hazards) {
  return "Weather alert: " + hazards.map(h => HAZARD_ICONS[h] + " " + HAZARD_LABELS[h]).join(", ")
       + " — this task may be affected.";
}

function setWeatherStatus(msg) {
  document.getElementById("weatherStatus").textContent = msg;
}

function codeToHazards(code, wind, temp) {
  const h = [];
  if ([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code)) h.push("rain");
  if ([71,73,75,77,85,86].includes(code))                       h.push("snow");
  if ([95,96,99].includes(code))                                 h.push("storm");
  if (wind > 20)                                                 h.push("wind");
  if (temp > 95)                                                 h.push("heat");
  return h;
}

async function fetchWeather() {
  if (!navigator.geolocation) {
    setWeatherStatus("⚠ Geolocation not supported by this browser.");
    return;
  }
  setWeatherStatus("📍 Getting your location…");
  navigator.geolocation.getCurrentPosition(
    async ({ coords }) => {
      setWeatherStatus("🌐 Fetching forecast…");
      try {
        const url =
          `https://api.open-meteo.com/v1/forecast` +
          `?latitude=${coords.latitude}&longitude=${coords.longitude}` +
          `&current=weather_code,wind_speed_10m,temperature_2m` +
          `&daily=weather_code,wind_speed_10m_max,temperature_2m_max` +
          `&wind_speed_unit=mph&temperature_unit=fahrenheit` +
          `&timezone=auto&forecast_days=16`;

        const res  = await fetch(url);
        const data = await res.json();

        const cur = data.current;
        currentHazards = codeToHazards(cur.weather_code, cur.wind_speed_10m, cur.temperature_2m);

        weatherForecast = {};
        const d = data.daily;
        d.time.forEach((date, i) => {
          weatherForecast[date] = codeToHazards(d.weather_code[i], d.wind_speed_10m_max[i], d.temperature_2m_max[i]);
        });

        const hazardDays = Object.values(weatherForecast).filter(h => h.length).length;
        setWeatherStatus(
          `🌤 Weather loaded — 16-day forecast, ${hazardDays} day(s) with hazards` +
          (currentHazards.length ? ` · Today: ${currentHazards.join(", ")}` : "")
        );
        renderTasks();
      } catch (e) {
        setWeatherStatus("⚠ Could not fetch weather — check your internet connection.");
        console.error("Weather error:", e);
      }
    },
    (err) => {
      const msgs = {
        1: "Location permission denied — click the lock icon in the address bar to allow it.",
        2: "Location unavailable.",
        3: "Location request timed out.",
      };
      setWeatherStatus("📍 " + (msgs[err.code] || "Location error."));
    }
  );
}

function renderTasks() {
  const list = document.getElementById("taskList");
  list.innerHTML = "";

  // Apply group filter
  const visible = tasks.filter(t => {
    if (selectedGroups.size === 0) return true;
    const gid = t.groupId || "none";
    if (selectedGroups.has(gid)) return true;
    // if task is in a subgroup, check if its parent is selected
    const parentId = groups[gid]?.parentId;
    return parentId ? selectedGroups.has(parentId) : false;
  });

  // Active tasks first, completed at the bottom
  const sorted = [
    ...visible.filter(t => !t.completed),
    ...visible.filter(t =>  t.completed),
  ];

  sorted.forEach(task => {
    const group    = groups[task.groupId] || null;
    const priority = calcPriority(task.dueDate);

    const li = document.createElement("li");
    li.dataset.id = task.id;

    if (task.completed) {
      li.classList.add("completed");
    } else if (group) {
      const bgGroup = group.parentId ? (groups[group.parentId] || group) : group;
      li.style.background  = bgGroup.color + "cc";
      li.style.borderColor = bgGroup.color;
      if (!isLight(bgGroup.color)) li.classList.add("dark-bg");
    }

    // ── Drag handle ──────────────────────────────────────────────────────
    const handle = document.createElement("span");
    handle.className = "drag-handle";
    handle.textContent = "⠿";
    handle.title = "Drag to reorder";

    if (!task.completed) {
      li.draggable = true;

      li.addEventListener("dragstart", e => {
        dragSrcId = task.id;
        li.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
      });
      li.addEventListener("dragend", () => {
        li.classList.remove("dragging");
        document.querySelectorAll("#taskList li").forEach(el => el.classList.remove("drag-over"));
      });
      li.addEventListener("dragover", e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (dragSrcId !== task.id) li.classList.add("drag-over");
      });
      li.addEventListener("dragleave", () => li.classList.remove("drag-over"));
      li.addEventListener("drop", e => {
        e.preventDefault();
        li.classList.remove("drag-over");
        if (dragSrcId === task.id) return;

        // Reorder within the active (non-completed) portion of tasks
        const active    = tasks.filter(t => !t.completed);
        const completed = tasks.filter(t =>  t.completed);
        const fromIdx   = active.findIndex(t => t.id === dragSrcId);
        const toIdx     = active.findIndex(t => t.id === task.id);
        if (fromIdx === -1 || toIdx === -1) return;

        const [moved] = active.splice(fromIdx, 1);
        active.splice(toIdx, 0, moved);
        tasks = [...active, ...completed];
        save();
        renderTasks();
      });
    }

    // ── Task info ────────────────────────────────────────────────────────
    const taskInfo = document.createElement("div");
    taskInfo.className = "task-info";
    taskInfo.style.flex = "1";

    const nameEl = document.createElement("div");
    nameEl.className = "task-name";
    nameEl.textContent = task.name;

    const dueEl = document.createElement("div");
    dueEl.className = "task-due";
    dueEl.textContent = task.dueDateDisplay ? "Due: " + task.dueDateDisplay : "No due date";

    taskInfo.appendChild(nameEl);
    taskInfo.appendChild(dueEl);

    if (!task.completed && priority.label !== "None") {
      const priEl = document.createElement("span");
      priEl.className = "priority-badge";
      priEl.style.background = priority.color;
      priEl.textContent = priority.label;
      taskInfo.appendChild(priEl);
    }

    if (!task.completed) {
      const hazards = taskHasWeatherHazard(task.name, task.dueDate);
      if (hazards) {
        const warn = document.createElement("span");
        warn.className = "weather-hazard";
        warn.textContent = " " + hazards.map(h => HAZARD_ICONS[h]).join("");
        warn.title = hazardTooltip(hazards);
        nameEl.appendChild(warn);
      }
    }

    if (group) {
      const parentGroup = group.parentId ? groups[group.parentId] : null;
      if (parentGroup) {
        const parentBadge = document.createElement("span");
        parentBadge.className = "task-group-badge";
        parentBadge.style.background = parentGroup.color;
        parentBadge.textContent = parentGroup.name;
        taskInfo.appendChild(parentBadge);

        const sep = document.createElement("span");
        sep.textContent = " › ";
        sep.style.cssText = "font-size:11px;font-weight:bold;color:#555;";
        taskInfo.appendChild(sep);
      }
      const badge = document.createElement("span");
      badge.className = "task-group-badge";
      badge.style.background = group.color;
      badge.textContent = group.name;
      taskInfo.appendChild(badge);
    }

    // ── Action buttons ───────────────────────────────────────────────────
    const actions = document.createElement("div");
    actions.className = "task-actions";

    const completeBtn = document.createElement("button");
    completeBtn.className = "complete-btn" + (task.completed ? " undo" : "");
    completeBtn.textContent = task.completed ? "Undo" : "✓";
    completeBtn.title = task.completed ? "Mark incomplete" : "Mark complete";
    completeBtn.onclick = () => {
      snapshot();
      const t = tasks.find(t => t.id === task.id);
      if (t) t.completed = !t.completed;
      save();
      renderTasks();
    };

    const editBtn = document.createElement("button");
    editBtn.textContent = "✏️";
    editBtn.className = "edit-btn";
    editBtn.title = "Edit task";
    editBtn.onclick = () => openEditModal(task.id);

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "✕";
    deleteBtn.className = "delete-btn";
    deleteBtn.title = "Delete task";
    deleteBtn.onclick = () => {
      if (document.getElementById("skipDeleteConfirm").checked) {
        executeDeleteTask(task.id);
      } else {
        pendingDeleteTaskId = task.id;
        document.getElementById("deleteTaskModal").classList.add("open");
      }
    };

    const bellBtn = document.createElement("button");
    bellBtn.className = "bell-btn" + (task.reminderSet ? " active" : "");
    bellBtn.textContent = "🔔";
    bellBtn.title = task.reminderSet ? "Remove email reminder" : "Set email reminder";
    bellBtn.onclick = (e) => task.reminderSet ? removeReminder(task) : showReminderPicker(task, bellBtn);

    actions.appendChild(bellBtn);
    actions.appendChild(completeBtn);
    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);

    li.appendChild(handle);
    li.appendChild(taskInfo);
    li.appendChild(actions);
    list.appendChild(li);
  });
}

function renderGroupList() {
  const ul = document.getElementById("groupList");
  ul.innerHTML = "";
  const topLevel    = Object.entries(groups).filter(([, g]) => !g.parentId);
  const getChildren = pid => Object.entries(groups).filter(([, g]) => g.parentId === pid);

  topLevel.forEach(([id, g]) => {
    const children   = getChildren(id);
    const isExpanded = !!expandedGroups[id];

    // ── Main group row ───────────────────────────────────────────────────
    const li = document.createElement("li");
    li.style.background = g.color;

    const arrow = document.createElement("button");
    arrow.className   = "group-arrow";
    arrow.textContent = isExpanded ? "▼" : "▶";
    arrow.title       = isExpanded ? "Collapse" : "Expand";
    arrow.onclick     = () => { expandedGroups[id] = !isExpanded; renderGroupList(); };
    li.appendChild(arrow);

    const nameSpan = document.createElement("span");
    nameSpan.textContent = g.name;
    nameSpan.style.flex  = "1";
    li.appendChild(nameSpan);

    const addBtn = document.createElement("button");
    addBtn.textContent = "+";
    addBtn.title       = "Add subgroup";
    addBtn.className   = "group-action-btn group-add-btn";
    addBtn.onclick     = () => {
      addingSubgroupTo = addingSubgroupTo === id ? null : id;
      editingGroupId   = null;
      expandedGroups[id] = true;
      renderGroupList();
    };
    li.appendChild(addBtn);

    const editBtn = document.createElement("button");
    editBtn.textContent = "✏️";
    editBtn.title       = "Edit group";
    editBtn.className   = "group-action-btn group-edit-btn";
    editBtn.onclick     = () => {
      editingGroupId   = editingGroupId === id ? null : id;
      addingSubgroupTo = null;
      renderGroupList();
    };
    li.appendChild(editBtn);

    const delBtn = document.createElement("button");
    delBtn.textContent = "✕";
    delBtn.title       = "Delete group";
    delBtn.className   = "group-action-btn group-del-btn";
    delBtn.onclick     = () => deleteGroup(id);
    li.appendChild(delBtn);

    ul.appendChild(li);

    if (editingGroupId === id) ul.appendChild(makeGroupEditRow(id, g, false));

    // ── Subgroups ────────────────────────────────────────────────────────
    if (isExpanded) {
      if (addingSubgroupTo === id) ul.appendChild(makeSubgroupAddRow(id));

      children.forEach(([subId, subG]) => {
        const subLi = document.createElement("li");
        subLi.className      = "subgroup-indent";
        subLi.style.background = subG.color;

        const subSpacer = document.createElement("span");
        subSpacer.style.width = "16px";
        subLi.appendChild(subSpacer);

        const subName = document.createElement("span");
        subName.textContent = subG.name;
        subName.style.flex  = "1";
        subLi.appendChild(subName);

        const subEditBtn = document.createElement("button");
        subEditBtn.textContent = "✏️";
        subEditBtn.title       = "Edit subgroup";
        subEditBtn.className   = "group-action-btn group-edit-btn";
        subEditBtn.onclick     = () => {
          editingGroupId   = editingGroupId === subId ? null : subId;
          addingSubgroupTo = null;
          renderGroupList();
        };
        subLi.appendChild(subEditBtn);

        const subDelBtn = document.createElement("button");
        subDelBtn.textContent = "✕";
        subDelBtn.title       = "Delete subgroup";
        subDelBtn.className   = "group-action-btn group-del-btn";
        subDelBtn.onclick     = () => deleteGroup(subId);
        subLi.appendChild(subDelBtn);

        ul.appendChild(subLi);

        if (editingGroupId === subId) ul.appendChild(makeGroupEditRow(subId, subG, true));
      });
    }
  });
}

function makeSubgroupAddRow(parentId) {
  const li = document.createElement("li");
  li.className = "group-inline-row subgroup-indent";

  const nameIn = document.createElement("input");
  nameIn.type        = "text";
  nameIn.placeholder = "Subgroup name";

  const colorIn = document.createElement("input");
  colorIn.type  = "color";
  colorIn.value = "#4a90e2";

  const confirmBtn = document.createElement("button");
  confirmBtn.textContent = "✓";
  confirmBtn.className   = "group-action-btn group-add-btn";
  confirmBtn.onclick     = () => {
    const name = nameIn.value.trim();
    if (!name) return;
    const id = "g" + nextGroupId++;
    groups[id] = { name, color: colorIn.value, parentId };
    addingSubgroupTo = null;
    save();
    renderGroupList();
    renderGroupSelect();
  };

  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = "✕";
  cancelBtn.className   = "group-action-btn group-del-btn";
  cancelBtn.onclick     = () => { addingSubgroupTo = null; renderGroupList(); };

  li.appendChild(nameIn);
  li.appendChild(colorIn);
  li.appendChild(confirmBtn);
  li.appendChild(cancelBtn);
  return li;
}

function makeGroupEditRow(id, g, isSubgroup) {
  const li = document.createElement("li");
  li.className = "group-inline-row" + (isSubgroup ? " subgroup-indent" : "");

  const nameIn = document.createElement("input");
  nameIn.type  = "text";
  nameIn.value = g.name;

  const colorIn = document.createElement("input");
  colorIn.type  = "color";
  colorIn.value = g.color;

  const saveBtn = document.createElement("button");
  saveBtn.textContent = "✓";
  saveBtn.className   = "group-action-btn group-add-btn";
  saveBtn.onclick     = () => {
    const name = nameIn.value.trim();
    if (!name) return;
    groups[id].name  = name;
    groups[id].color = colorIn.value;
    editingGroupId   = null;
    save();
    renderGroupList();
    renderGroupSelect();
    renderTasks();
  };

  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = "✕";
  cancelBtn.className   = "group-action-btn";
  cancelBtn.style.background = "#aaa";
  cancelBtn.onclick = () => { editingGroupId = null; renderGroupList(); };

  li.appendChild(nameIn);
  li.appendChild(colorIn);
  li.appendChild(saveBtn);
  li.appendChild(cancelBtn);
  return li;
}

function renderGroupSelect() {
  const sel = document.getElementById("groupSelect");
  sel.innerHTML = '<option value="">No Group</option>';
  const topLevel = Object.entries(groups).filter(([, g]) => !g.parentId);
  topLevel.forEach(([id, g]) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = g.name;
    sel.appendChild(opt);
    Object.entries(groups)
      .filter(([, sg]) => sg.parentId === id)
      .forEach(([subId, subG]) => {
        const subOpt = document.createElement("option");
        subOpt.value = subId;
        subOpt.textContent = "  → " + subG.name;
        sel.appendChild(subOpt);
      });
  });
}

function renderGroupParentSelect() {
  const sel = document.getElementById("newGroupParent");
  if (!sel) return;
  sel.innerHTML = '<option value="">No parent (top-level)</option>';
  Object.entries(groups)
    .filter(([, g]) => !g.parentId)
    .forEach(([id, g]) => {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = g.name;
      sel.appendChild(opt);
    });
}

// ── Actions ──────────────────────────────────────────────────────────────
function openGroupModal()  { document.getElementById("groupModal").classList.add("open"); }
function closeGroupModal() { document.getElementById("groupModal").classList.remove("open"); }

// ── Edit modal ────────────────────────────────────────────────────────────
let editingTaskId = null;
let editPicker    = null;

function openEditModal(taskId) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;
  editingTaskId = taskId;

  document.getElementById("editTaskName").value = task.name;

  // Populate group select
  const sel = document.getElementById("editGroupSelect");
  sel.innerHTML = '<option value="">No Group</option>';
  const topLevel = Object.entries(groups).filter(([, g]) => !g.parentId);
  topLevel.forEach(([id, g]) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = g.name;
    sel.appendChild(opt);
    Object.entries(groups)
      .filter(([, sg]) => sg.parentId === id)
      .forEach(([subId, subG]) => {
        const subOpt = document.createElement("option");
        subOpt.value = subId;
        subOpt.textContent = "  → " + subG.name;
        sel.appendChild(subOpt);
      });
  });
  sel.value = task.groupId || "";

  // Init flatpickr on edit input
  if (editPicker) editPicker.destroy();
  editPicker = flatpickr("#editDueDate", {
    enableTime: true,
    dateFormat: "M j, Y h:i K",
    defaultDate: task.dueDate ? new Date(task.dueDate) : null,
    onOpen: function(_d, _s, instance) {
      setTimeout(() => {
        const rect     = document.getElementById("editDueDate").getBoundingClientRect();
        const cal      = instance.calendarContainer;
        const calWidth = cal.offsetWidth || 308;
        const left     = rect.left + (rect.width / 2) - (calWidth / 2);
        const availableHeight = window.innerHeight - rect.bottom - 8;
        cal.style.position  = "fixed";
        cal.style.top       = (rect.bottom + 4) + "px";
        cal.style.left      = Math.max(4, left) + "px";
        cal.style.zIndex    = "200";
        cal.style.maxHeight = Math.max(180, availableHeight) + "px";
        cal.style.overflowY = "auto";
      }, 0);
    },
  });

  document.getElementById("editModal").classList.add("open");
  document.getElementById("editTaskName").focus();
}

function closeEditModal() {
  document.getElementById("editModal").classList.remove("open");
  editingTaskId = null;
}

function saveEdit() {
  const task = tasks.find(t => t.id === editingTaskId);
  if (!task) return;
  snapshot();

  const name = document.getElementById("editTaskName").value.trim();
  if (!name) return;

  const pickedDate = editPicker.selectedDates[0];
  task.name           = name;
  task.dueDate        = pickedDate ? pickedDate.toISOString() : null;
  task.dueDateDisplay = document.getElementById("editDueDate").value || null;
  task.groupId        = document.getElementById("editGroupSelect").value || null;

  save();
  renderTasks();
  closeEditModal();
}

function addGroup() {
  const nameInput  = document.getElementById("newGroupName");
  const colorInput = document.getElementById("newGroupColor");
  const name = nameInput.value.trim();
  if (!name) return;
  const id = "g" + nextGroupId++;
  groups[id] = { name, color: colorInput.value, parentId: null };
  save();
  renderGroupList();
  renderGroupSelect();
  nameInput.value = "";
}

let pendingRemoveGroupId = null;
let pendingDeleteTaskId  = null;

async function executeDeleteTask(id) {
  snapshot();
  const task = tasks.find(t => t.id === id);
  if (task?.reminderSet) {
    await fetch(`${REMINDER_API}/api/remove-reminder`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task_id: id })
    }).catch(() => {});
  }
  tasks = tasks.filter(t => t.id !== id);
  save();
  renderTasks();
}

function confirmDeleteTask() {
  const id = pendingDeleteTaskId;
  closeDeleteTaskModal();
  if (id !== null) executeDeleteTask(id);
}

function closeDeleteTaskModal() {
  document.getElementById("deleteTaskModal").classList.remove("open");
  pendingDeleteTaskId = null;
}

function deleteGroup(id) {
  const group      = groups[id];
  const subgroups  = Object.entries(groups).filter(([, g]) => g.parentId === id);
  const groupTasks = tasks.filter(t => t.groupId === id);
  const subTasks   = subgroups.flatMap(([sid]) => tasks.filter(t => t.groupId === sid));
  const allTasks   = [...groupTasks, ...subTasks];

  if (!allTasks.length && !subgroups.length) {
    delete groups[id];
    save();
    renderGroupList();
    renderGroupSelect();
    renderTasks();
    return;
  }

  pendingRemoveGroupId = id;
  let msg = `You are removing the group <strong>${group.name}</strong>`;

  if (subgroups.length) {
    const subNames = subgroups.map(([, sg]) => `<li>${sg.name}</li>`).join("");
    msg += `, along with its subgroup${subgroups.length > 1 ? "s" : ""}: <ul>${subNames}</ul>`;
  }

  if (allTasks.length) {
    const taskNames = allTasks.map(t => `<li>${t.name}</li>`).join("");
    const word = allTasks.length === 1 ? "task" : "tasks";
    msg += `This affects the following ${word}: <ul>${taskNames}</ul>`;
  }

  msg += `Do you want to remove the tasks as well?`;
  document.getElementById("removeGroupMsg").innerHTML = msg;
  document.getElementById("removeGroupModal").classList.add("open");
}

function closeRemoveGroupModal() {
  document.getElementById("removeGroupModal").classList.remove("open");
  pendingRemoveGroupId = null;
}

function confirmRemoveGroup(deleteTasks) {
  const id = pendingRemoveGroupId;
  if (!id) return;
  snapshot();

  const subgroupIds  = Object.entries(groups).filter(([, g]) => g.parentId === id).map(([sid]) => sid);
  const affectedIds  = [id, ...subgroupIds];

  if (deleteTasks) {
    tasks = tasks.filter(t => !affectedIds.includes(t.groupId));
  } else {
    tasks.forEach(t => { if (affectedIds.includes(t.groupId)) t.groupId = null; });
  }

  affectedIds.forEach(gid => delete groups[gid]);
  save();
  closeRemoveGroupModal();
  renderGroupList();
  renderGroupSelect();
  renderGroupParentSelect();
  renderTasks();
}

function addTask() {
  const input    = document.getElementById("taskInput");
  const dateInput = document.getElementById("dueDateInput");
  const groupSel = document.getElementById("groupSelect");
  if (!input.value.trim()) return;
  snapshot();

  const dueDateRaw = dateInput._flatpickr.selectedDates[0];
  tasks.push({
    id:             nextTaskId++,
    name:           input.value.trim(),
    dueDate:        dueDateRaw ? dueDateRaw.toISOString() : null,
    dueDateDisplay: dateInput.value || null,
    groupId:        groupSel.value || null,
  });

  save();
  renderTasks();
  input.value = "";
  dateInput._flatpickr.clear();
  input.focus();
}

// ── Background ───────────────────────────────────────────────────────────
function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16)
  ];
}

function isLight(hex) {
  const [r, g, b] = hexToRgb(hex);
  // Perceived luminance formula
  return (r * 0.299 + g * 0.587 + b * 0.114) > 140;
}

function setBg(color) {
  document.body.style.background = color;
  const textColor = isLight(color) ? "#333" : "#ffffff";
  document.querySelector("h1").style.color = textColor;
  document.getElementById("bgLabel").style.color = textColor;
  document.getElementById("bgColorPicker").value = color;
  localStorage.setItem("todo_bg", color);
}

function onBgSelectChange(value) {
  const picker = document.getElementById("bgColorPicker");
  if (value === "custom") {
    picker.style.display = "inline-block";
    picker.click();
  } else {
    picker.style.display = "none";
    setBg(value);
  }
}

// ── Init ─────────────────────────────────────────────────────────────────
load();
const savedBg = localStorage.getItem("todo_bg");
if (savedBg) {
  const sel = document.getElementById("bgSelect");
  const isPreset = [...sel.options].some(o => o.value === savedBg);
  if (isPreset) {
    sel.value = savedBg;
  } else {
    sel.value = "custom";
    document.getElementById("bgColorPicker").style.display = "inline-block";
  }
  setBg(savedBg);
}
renderGroupList();
renderGroupSelect();
renderTasks();
fetchWeather();

document.getElementById("groupModal").addEventListener("click", function(e) {
  if (e.target === this) closeGroupModal();
});
document.getElementById("editModal").addEventListener("click", function(e) {
  if (e.target === this) closeEditModal();
});
document.getElementById("removeGroupModal").addEventListener("click", function(e) {
  if (e.target === this) closeRemoveGroupModal();
});
document.getElementById("deleteTaskModal").addEventListener("click", function(e) {
  if (e.target === this) closeDeleteTaskModal();
});
document.getElementById("emailModal").addEventListener("click", function(e) {
  if (e.target === this) closeEmailModal();
});
document.addEventListener("click", function(e) {
  const dd = document.getElementById("filterDropdown");
  if (dd.style.display !== "none" && !document.getElementById("filterBtn").contains(e.target) && !dd.contains(e.target)) {
    dd.style.display = "none";
  }
});
document.getElementById("skipDeleteConfirm").checked = localStorage.getItem("todo_skipDeleteConfirm") === "true";
