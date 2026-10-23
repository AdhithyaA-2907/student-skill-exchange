/* ---------- Original mock dashboard code (kept only as an inactive reference) ----------
// This temporary data makes the dashboard feel complete before the API is connected.
const mockData = {
  teachSkills: [
    { emoji: "🎨", name: "UI / UX Design", level: "Advanced" },
    { emoji: "🌐", name: "HTML & CSS", level: "Advanced" },
    { emoji: "📣", name: "Public Speaking", level: "Intermediate" }
  ],
  learnSkills: [
    { emoji: "🐍", name: "Python", level: "Beginner" },
    { emoji: "📊", name: "Data Analysis", level: "Beginner" },
    { emoji: "🎸", name: "Guitar", level: "Just starting" }
  ],
  partners: [
    { initials: "MP", avatar: "avatar-maya", name: "Maya Patel", course: "Computer Science · 3rd year", match: "96% match", bio: "Python enthusiast who would love to learn how to make products feel beautiful.", skills: ["Python", "Data Science"], availability: "Available this week" },
    { initials: "RK", avatar: "avatar-rahul", name: "Rahul Kumar", course: "Information Tech · 2nd year", match: "91% match", bio: "Building web apps and always happy to pair up for a focused learning session.", skills: ["JavaScript", "React"], availability: "2 shared interests" },
    { initials: "JL", avatar: "avatar-jane", name: "Jane Lee", course: "Design · 4th year", match: "88% match", bio: "Curious illustrator with a practical approach to visual storytelling and research.", skills: ["Illustration", "Figma"], availability: "Available Friday" }
  ],
  requests: [
    { initials: "MP", avatar: "avatar-maya", name: "Maya Patel", time: "Today", status: "Pending", offered: "Python basics", requested: "UI design", action: true },
    { initials: "OK", avatar: "avatar-omar", name: "Omar Khan", time: "Yesterday", status: "Accepted", offered: "Public speaking", requested: "Guitar chords", action: false }
  ]
};

// ---------- Rendering helpers ----------
// Small functions keep the HTML templates and the main setup code easy to read.
function createSkillRow(skill) {
  return `<div class="skill-row"><span class="skill-emoji">${skill.emoji}</span><strong>${skill.name}</strong><span class="level">${skill.level}</span></div>`;
}

function renderSkills() {
  document.querySelector("#teach-skills").innerHTML = mockData.teachSkills.map(createSkillRow).join("");
  document.querySelector("#learn-skills").innerHTML = mockData.learnSkills.map(createSkillRow).join("");
  document.querySelector("#teach-count").textContent = mockData.teachSkills.length;
  document.querySelector("#learn-count").textContent = mockData.learnSkills.length;
  document.querySelector("#teach-badge").textContent = mockData.teachSkills.length;
  document.querySelector("#learn-badge").textContent = mockData.learnSkills.length;
}

function renderPartners() {
  document.querySelector("#partners-list").innerHTML = mockData.partners.map((partner) => `
    <article class="partner-card">
      <div class="partner-header"><span class="avatar ${partner.avatar}">${partner.initials}</span><div><div class="partner-name">${partner.name}</div><div class="partner-course">${partner.course}</div></div><span class="match-pill">${partner.match}</span></div>
      <p>${partner.bio}</p>
      <div class="partner-skills">${partner.skills.map((skill) => `<span>${skill}</span>`).join("")}</div>
      <div class="partner-footer"><small>● ${partner.availability}</small><button class="connect-button" type="button" data-person="${partner.name}">Connect</button></div>
    </article>`).join("");
}

function renderRequests() {
  document.querySelector("#request-count").textContent = mockData.requests.length + 1;
  document.querySelector("#requests-list").innerHTML = mockData.requests.map((request) => `
    <article class="request-card ${request.status.toLowerCase()}">
      <span class="avatar ${request.avatar}">${request.initials}</span>
      <div class="request-body"><div class="request-meta"><strong>${request.name}</strong><small>${request.time}</small></div>
        <div class="swap-details"><b>${request.offered}</b><span>⇄</span><b>${request.requested}</b></div>
        ${request.action ? `<div class="request-actions"><button class="action-button accept" type="button">Accept exchange</button><button class="action-button decline" type="button">Not now</button></div>` : `<span class="status accepted">✓ ${request.status}</span>`}
      </div>
    </article>`).join("");
}

// ---------- Demo interactions ----------
// These interactions are visual-only and will later be replaced with backend requests.
let toastTimer;
function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3000);
}

function setupInteractions() {
  document.querySelector(".menu-button").addEventListener("click", (event) => {
    const links = document.querySelector(".nav-links");
    const isOpen = links.classList.toggle("open");
    event.currentTarget.setAttribute("aria-expanded", String(isOpen));
  });

  document.querySelectorAll("[data-scroll-to]").forEach((button) => {
    button.addEventListener("click", () => document.querySelector(`#${button.dataset.scrollTo}`).scrollIntoView({ behavior: "smooth" }));
  });

  document.addEventListener("click", (event) => {
    if (event.target.matches(".connect-button")) showToast(`Connection request prepared for ${event.target.dataset.person}.`);
    if (event.target.matches(".accept")) { event.target.textContent = "Accepted ✓"; event.target.disabled = true; showToast("Exchange request accepted!"); }
    if (event.target.matches(".decline")) showToast("Request kept in your inbox for now.");
    if (event.target.matches(".add-inline")) showToast(event.target.dataset.message);
  });

  document.querySelector("#add-skill-button").addEventListener("click", () => showToast("Skill creation will be connected to the API next."));
}

// ---------- Dashboard startup ----------
renderSkills();
renderPartners();
renderRequests();
setupInteractions();
*/

// ---------- Live API setup ----------
// fetch() requests JSON from the existing Express backend. No mock data is used below.
const API = "https://student-skill-exchange-api.onrender.com/api";
// Only an opaque server-issued session token is persisted. A student ID alone is never trusted as a login.
const SESSION_TOKEN_KEY = "studentSkillExchange.sessionToken";
function getStoredSessionToken() { return localStorage.getItem(SESSION_TOKEN_KEY) || ""; }
function saveSessionToken(token) { localStorage.setItem(SESSION_TOKEN_KEY, token); }
function clearStoredSessionToken() { localStorage.removeItem(SESSION_TOKEN_KEY); }

// The application has three explicit authentication states: loading, authenticated, unauthenticated.
const state = { students: [], skills: [], exchanges: [], notifications: [], unreadNotifications: 0, activeId: null, sessionToken: getStoredSessionToken(), authState: "LOADING" };

async function request(path, options = {}) {
  try {
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    if (state.sessionToken) headers.Authorization = `Bearer ${state.sessionToken}`;
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.message || "The request could not be completed.");
      error.status = response.status;
      error.endpoint = path;
      error.responseBody = data;
      console.error("SkillSwap API request failed", { endpoint: path, status: response.status, response: data });
      throw error;
    }
    return data;
  } catch (error) {
    if (error.endpoint) throw error;
    if (error instanceof SyntaxError) {
      const responseError = new Error("The API returned an invalid response.");
      responseError.endpoint = path;
      console.error("SkillSwap API returned invalid JSON", { endpoint: path, error });
      throw responseError;
    }
    if (error.message === "Failed to fetch") {
      const networkError = new Error("Unable to connect to the server. Please try again.");
      networkError.endpoint = path;
      networkError.isNetworkError = true;
      console.error("SkillSwap network request failed", { endpoint: path, error });
      throw networkError;
    }
    console.error("Unexpected SkillSwap API error", { endpoint: path, error });
    throw error;
  }
}

// ---------- Small display helpers ----------
const byId = (selector) => document.querySelector(selector);
const currentStudent = () => state.students.find((student) => student.student_id === state.activeId);
const initialsFor = (name = "?") => name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
const avatarTone = (index) => ["avatar-maya", "avatar-rahul", "avatar-jane", "avatar-omar"][index % 4];
const safe = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
const empty = (message) => `<div class="empty-state">${safe(message)}</div>`;
let toastTimer;
function toast(message) { const element = byId("#toast"); element.textContent = message; element.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => element.classList.remove("show"), 3000); }
function formError(name, message = "") { byId(`#${name}-form-error`).textContent = message; }

// ---------- Session initialization ----------
// The page stays behind this gate until the server has verified the saved token.
function showAuthGate(status, message) {
  state.authState = status;
  document.body.classList.remove("auth-loading", "auth-authenticated", "auth-unauthenticated", "auth-error");
  document.body.classList.add(`auth-${status.toLowerCase()}`);
  const gate = byId("#auth-gate");
  const title = byId("#auth-gate-title");
  const detail = byId("#auth-gate-message");
  byId("#auth-login-button").hidden = status !== "UNAUTHENTICATED";
  byId("#auth-create-button").hidden = status !== "UNAUTHENTICATED";
  byId("#auth-retry-button").hidden = status !== "ERROR";
  if (status === "AUTHENTICATED") { gate.hidden = true; return; }
  gate.hidden = false;
  title.textContent = status === "LOADING" ? "Checking your session…" : status === "ERROR" ? "Unable to reach SkillSwap" : "Welcome to SkillSwap";
  detail.textContent = message || (status === "LOADING" ? "Please wait while we securely load your profile." : "Sign in to manage your skills and exchange requests.");
}

function setButtonBusy(button, isBusy, busyText) {
  if (!button.dataset.label) button.dataset.label = button.textContent;
  button.disabled = isBusy;
  button.textContent = isBusy ? busyText : button.dataset.label;
}

async function initializeSession() {
  showAuthGate("LOADING");
  if (!state.sessionToken) {
    showAuthGate("UNAUTHENTICATED");
    return;
  }

  try {
    const result = await request("/auth/session");
    state.activeId = result.student.student_id;
    showAuthGate("AUTHENTICATED");
    await refreshAll();
  } catch (error) {
    console.error("SkillSwap session verification failed", { endpoint: error.endpoint, status: error.status, response: error.responseBody, error });
    if (error.status === 401 || error.status === 403) {
      clearStoredSessionToken();
      state.sessionToken = "";
      state.activeId = null;
      showAuthGate("UNAUTHENTICATED", "Your session has ended. Please sign in again.");
      return;
    }
    // Keep server, endpoint, and true network failures distinct for the user and console.
    const message = error.status === 404
      ? "The session API endpoint was not found. Please try again after deployment completes."
      : error.status >= 500
        ? "The server could not verify your session. Please try again."
        : error.isNetworkError
          ? "Unable to connect to the server. Please check your connection and try again."
          : "Unable to verify your session. Please try again.";
    showAuthGate("ERROR", message);
  }
}

// ---------- Real notification rendering ----------
// Notifications are read from the backend table and never created in the browser.
function notificationTime(createdAt) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000));
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function renderNotifications(errorMessage = "") {
  const badge = byId("#notification-badge");
  const list = byId("#notification-list");
  const subtitle = byId("#notification-subtitle");
  byId("#mark-all-read").hidden = state.unreadNotifications === 0 || Boolean(errorMessage);
  if (errorMessage) {
    badge.hidden = true;
    subtitle.textContent = "Notifications are unavailable";
    list.innerHTML = '<p class="notification-empty notification-error">Unable to load notifications.</p>';
    return;
  }
  badge.hidden = state.unreadNotifications === 0;
  badge.textContent = state.unreadNotifications > 99 ? "99+" : state.unreadNotifications;
  subtitle.textContent = state.unreadNotifications ? `${state.unreadNotifications} unread` : "You're all caught up";
  list.innerHTML = state.notifications.length ? state.notifications.map((notification) => `<button class="notification-item ${notification.is_read ? "" : "unread"}" type="button" data-notification-id="${notification.notification_id}" data-request-id="${notification.related_request_id || ""}"><span class="notification-unread-dot"></span><span class="notification-message">${safe(notification.message)}<span class="notification-time">${notificationTime(notification.created_at)}</span></span></button>`).join("") : '<p class="notification-empty">No new notifications</p>';
}

async function loadNotifications() {
  if (!state.activeId) {
    state.notifications = []; state.unreadNotifications = 0; renderNotifications(); return;
  }
  const studentId = state.activeId;
  try {
    const [notificationsData, countData] = await Promise.all([
      request(`/notifications/${studentId}`),
      request(`/notifications/${studentId}/unread-count`)
    ]);
    if (state.activeId !== studentId) return;
    state.notifications = notificationsData.notifications || [];
    state.unreadNotifications = countData.unread_count || 0;
    renderNotifications();
  } catch (error) {
    // Notification failures stay isolated so the rest of the dashboard continues working.
    if (state.activeId === studentId) renderNotifications(error.message);
  }
}

async function markNotificationRead(notificationId) {
  if (!state.activeId) return;
  try {
    await request(`/notifications/${notificationId}/read`, { method: "PATCH", body: JSON.stringify({ student_id: state.activeId }) });
    await loadNotifications();
  } catch (error) { toast("Unable to update this notification."); }
}

async function markAllNotificationsRead() {
  if (!state.activeId || !state.unreadNotifications) return;
  try {
    await request(`/notifications/${state.activeId}/read-all`, { method: "PATCH", body: JSON.stringify({ student_id: state.activeId }) });
    await loadNotifications();
  } catch (error) { toast("Unable to mark notifications as read."); }
}

function fillStudentSelects() {
  const options = state.students.map((student) => `<option value="${student.student_id}">${safe(student.name)}</option>`).join("");
  const activeStudent = currentStudent();
  byId("#active-student-select").innerHTML = `<option value="">Log in to a profile</option>${options}`;
  byId("#skill-student-id").innerHTML = activeStudent ? `<option value="${activeStudent.student_id}">${safe(activeStudent.name)}</option>` : '<option value="">Log in first</option>';
  byId("#exchange-receiver-id").innerHTML = state.students.filter((student) => student.student_id !== state.activeId).map((student) => `<option value="${student.student_id}">${safe(student.name)}</option>`).join("") || '<option value="">No other profiles yet</option>';
  byId("#active-student-select").value = state.activeId || "";
  byId("#skill-student-id").value = state.activeId || "";
  byId("#exchange-sender-id").value = state.activeId || "";
  byId("#exchange-sender-name").textContent = activeStudent ? `Sending as ${activeStudent.name}` : "Log in to send a request.";
}

function renderProfile() {
  const student = currentStudent();
  byId("#profile-avatar").textContent = initialsFor(student?.name);
  byId("#profile-name").innerHTML = `${safe(student?.name || "Select profile")} <small>⌄</small>`;
  byId("#logout-button").hidden = !student;
  fillStudentSelects();
}

// ---------- Render the real Skills API response ----------
function renderSkills() {
  const student = currentStudent();
  const mine = student ? state.skills.filter((skill) => skill.student_id === student.student_id) : [];
  const teach = mine.filter((skill) => skill.skill_type === "TEACH");
  const learn = mine.filter((skill) => skill.skill_type === "LEARN");
  const row = (skill) => `<div class="skill-row"><span class="skill-emoji">${skill.skill_type === "TEACH" ? "✦" : "⌁"}</span><span class="skill-text"><strong>${safe(skill.skill_name)}</strong><small>${safe(skill.proficiency || "No level added")}</small></span><span class="level">${safe(skill.skill_type)}</span><span class="row-actions"><button class="icon-action" type="button" data-edit-skill="${skill.skill_id}" title="Edit skill">✎</button><button class="icon-action delete" type="button" data-delete-skill="${skill.skill_id}" title="Delete skill">×</button></span></div>`;
  byId("#teach-skills").innerHTML = student ? (teach.map(row).join("") || empty("Add a skill you can teach.")) : empty("Choose or create a profile to see skills.");
  byId("#learn-skills").innerHTML = student ? (learn.map(row).join("") || empty("Add a learning goal.")) : empty("Choose or create a profile to see skills.");
  [["#teach-count", teach.length], ["#learn-count", learn.length], ["#teach-badge", teach.length], ["#learn-badge", learn.length]].forEach(([selector, value]) => { byId(selector).textContent = value; });
}

// ---------- Render partners whose teaching skills match the selected profile's learning goals ----------
function renderPartners() {
  const student = currentStudent();
  const normalizeSkill = (name) => String(name || "").trim().toLowerCase();
  const search = byId("#discover-search").value.trim().toLowerCase();
  const department = byId("#discover-department").value;
  const year = byId("#discover-year").value;
  const proficiency = byId("#discover-proficiency").value;

  if (!state.students.length) { byId("#partners-list").innerHTML = empty("Create a student profile to discover partners."); return; }
  if (!student) { byId("#partners-list").innerHTML = empty("Choose a profile to discover partners."); return; }

  // Compare normalized names so matching is case-insensitive and ignores extra spaces.
  const wantedSkills = new Set(state.skills
    .filter((skill) => skill.student_id === student.student_id && skill.skill_type === "LEARN")
    .map((skill) => normalizeSkill(skill.skill_name))
    .filter(Boolean));

  if (!wantedSkills.size) { byId("#partners-list").innerHTML = empty("Add a skill you want to learn to see matching partners."); return; }

  const recommended = [];
  const seenPartnerIds = new Set();
  state.students.forEach((partner) => {
    // Never recommend the selected profile or render a student more than once.
    if (partner.student_id === student.student_id || seenPartnerIds.has(partner.student_id)) return;

    const matchingSkills = state.skills.filter((skill) =>
      skill.student_id === partner.student_id &&
      skill.skill_type === "TEACH" &&
      wantedSkills.has(normalizeSkill(skill.skill_name))
    );

    if (matchingSkills.length) {
      seenPartnerIds.add(partner.student_id);
      recommended.push({ partner, matchingSkills });
    }
  });

  const filtered = recommended.filter(({ partner, matchingSkills }) => {
    const searchableSkills = state.skills.filter((skill) => skill.student_id === partner.student_id);
    const matchesSearch = !search || partner.name.toLowerCase().includes(search) || searchableSkills.some((skill) => normalizeSkill(skill.skill_name).includes(search));
    const matchesDepartment = !department || partner.department === department;
    const matchesYear = !year || String(partner.year || "") === year;
    const matchesProficiency = !proficiency || matchingSkills.some((skill) => skill.proficiency === proficiency);
    return matchesSearch && matchesDepartment && matchesYear && matchesProficiency;
  });

  if (!filtered.length) { byId("#partners-list").innerHTML = empty(search || department || year || proficiency ? "No matching partners found. Try clearing a filter." : "No matching skill partners yet."); return; }
  byId("#partners-list").innerHTML = filtered.map(({ partner, matchingSkills }, index) => {
    // Only show the teaching skills that exactly match this student's learning goals.
    const displayedSkills = [...new Map(matchingSkills.map((skill) => [normalizeSkill(skill.skill_name), skill])).values()];
    const teaches = state.skills.filter((skill) => skill.student_id === partner.student_id && skill.skill_type === "TEACH");
    const learns = state.skills.filter((skill) => skill.student_id === partner.student_id && skill.skill_type === "LEARN");
    const completedCount = state.exchanges.filter((exchange) => (exchange.sender_id === partner.student_id || exchange.receiver_id === partner.student_id) && exchange.status === "COMPLETED").length;
    return `<article class="partner-card"><div class="partner-header"><span class="avatar ${avatarTone(index)}">${initialsFor(partner.name)}</span><div><div class="partner-name">${safe(partner.name)}</div><div class="partner-course">${safe(partner.department || "Student")}${partner.year ? ` · Year ${partner.year}` : ""}</div></div><span class="match-pill">${displayedSkills.length > 1 ? "Strong match" : "Skill match"}</span></div><p>Teaches the skill${displayedSkills.length === 1 ? "" : "s"} you want to learn.</p><div class="partner-skills">${displayedSkills.map((skill) => `<span>${safe(skill.skill_name)}${skill.proficiency ? ` · ${safe(skill.proficiency)}` : ""}</span>`).join("")}</div><div class="partner-details">Teaches ${teaches.length} · Wants to learn ${learns.length} · Completed ${completedCount}</div><div class="partner-footer"><small>● Open to connect</small><button class="connect-button" type="button" data-connect="${partner.student_id}">Connect</button></div></article>`;
  }).join("");
}

function populateDiscoverFilters() {
  const selectOptions = (values, placeholder) => `<option value="">${placeholder}</option>${values.map((value) => `<option value="${safe(value)}">${safe(value)}</option>`).join("")}`;
  const departments = [...new Set(state.students.map((student) => student.department).filter(Boolean))].sort();
  const years = [...new Set(state.students.map((student) => student.year).filter(Boolean))].sort((a, b) => a - b);
  const levels = [...new Set(state.skills.map((skill) => skill.proficiency).filter(Boolean))].sort();
  const current = { department: byId("#discover-department").value, year: byId("#discover-year").value, proficiency: byId("#discover-proficiency").value };
  byId("#discover-department").innerHTML = selectOptions(departments, "All departments");
  byId("#discover-year").innerHTML = selectOptions(years, "All years");
  byId("#discover-proficiency").innerHTML = selectOptions(levels, "All proficiency levels");
  byId("#discover-department").value = current.department;
  byId("#discover-year").value = current.year;
  byId("#discover-proficiency").value = current.proficiency;
}

// ---------- Render and manage live Exchange Request API data ----------
function renderExchanges() {
  const student = currentStudent();
  const exchanges = student ? state.exchanges.filter((item) => item.sender_id === student.student_id || item.receiver_id === student.student_id) : [];
  const pending = exchanges.filter((item) => item.status === "PENDING");
  const accepted = exchanges.filter((item) => item.status === "ACCEPTED");
  byId("#pending-count").textContent = pending.length;
  byId("#accepted-count").textContent = accepted.length;
  byId("#pending-caption").textContent = pending.length ? "Awaiting a reply" : "All caught up";
  if (!student) { byId("#requests-list").innerHTML = empty("Choose a profile to view requests."); updateHero(); return; }
  if (!exchanges.length) { byId("#requests-list").innerHTML = empty("No exchanges yet. Connect with a partner to send your first request."); updateHero(); return; }
  const requestCard = (item, index, outgoing) => {
    const otherName = outgoing ? item.receiver_name : item.sender_name;
    let actions = `<span class="request-status ${item.status.toLowerCase()}">${safe(item.status.charAt(0) + item.status.slice(1).toLowerCase())}</span>`;
    if (item.status === "PENDING") {
      actions = outgoing
        ? '<span class="request-waiting">Waiting for response…</span>'
        : `<button class="action-button accept" type="button" data-exchange-id="${item.request_id}" data-exchange-action="ACCEPTED">Accept</button><button class="action-button reject" type="button" data-exchange-id="${item.request_id}" data-exchange-action="REJECTED">Reject</button>`;
    } else if (item.status === "ACCEPTED") {
      actions += `<button class="action-button accept" type="button" data-exchange-id="${item.request_id}" data-exchange-action="COMPLETED">Mark completed</button>`;
    }
    return `<article class="request-card ${item.status.toLowerCase()}"><span class="avatar ${avatarTone(index)}">${initialsFor(otherName)}</span><div class="request-body"><div class="request-meta"><strong>${safe(otherName)}</strong><small>${outgoing ? "You sent this" : "Sent to you"}</small></div><div class="swap-details"><b>${safe(item.offered_skill)}</b><span>⇄</span><b>${safe(item.requested_skill)}</b></div><div class="request-actions">${actions}</div></div></article>`;
  };
  const incoming = exchanges.filter((item) => item.receiver_id === student.student_id);
  const outgoing = exchanges.filter((item) => item.sender_id === student.student_id);
  const section = (title, items, isOutgoing, offset) => items.length ? `<section class="request-group"><h3>${title}</h3>${items.map((item, index) => requestCard(item, index + offset, isOutgoing)).join("")}</section>` : "";
  byId("#requests-list").innerHTML = section("Incoming requests", incoming, false, 0) + section("Outgoing requests", outgoing, true, incoming.length);
  updateHero(exchanges[0]);
}

function updateHero(item) {
  const student = currentStudent();
  if (!item || !student) { byId("#hero-match-text").innerHTML = "<strong>Your next exchange</strong><br><span>Create a request to begin</span>"; return; }
  const other = item.sender_id === student.student_id ? item.receiver_name : item.sender_name;
  byId("#hero-avatars").innerHTML = `<span class="avatar avatar-me large">${initialsFor(student.name)}</span><span class="swap-symbol">⇄</span><span class="avatar avatar-maya large">${initialsFor(other)}</span>`;
  byId("#hero-match-text").innerHTML = `<strong>You + ${safe(other)}</strong><br><span>${safe(item.offered_skill)} <i>for</i> ${safe(item.requested_skill)}</span>`;
}

// ---------- Dashboard-only live overview ----------
function renderOverview() {
  if (!document.body.classList.contains("page-dashboard")) return;
  const student = currentStudent();
  const mySkills = student ? state.skills.filter((skill) => skill.student_id === student.student_id) : [];
  const myExchanges = student ? state.exchanges.filter((exchange) => exchange.sender_id === student.student_id || exchange.receiver_id === student.student_id) : [];
  byId("#profile-summary").innerHTML = student
    ? `<div class="overview-profile"><span class="avatar avatar-me">${initialsFor(student.name)}</span><div><h3>${safe(student.name)}</h3><p>${safe(student.department || "Student")}${student.year ? ` · Year ${student.year}` : ""}</p></div></div><span class="overview-tag">${mySkills.length} skills on your profile</span>`
    : empty("Create a profile to personalize your dashboard.");
  byId("#activity-summary").innerHTML = `<h3>Recent activity</h3>${myExchanges.length ? myExchanges.slice(0, 2).map((exchange) => `<div class="activity-item"><span class="activity-icon">⇄</span><span>${safe(exchange.offered_skill)} for ${safe(exchange.requested_skill)}<small>${safe(exchange.status)} exchange request</small></span></div>`).join("") : '<p>Connect with a student to start your first exchange.</p>'}`;
}

// ---------- GET API calls and dashboard refresh ----------
async function loadStudents() {
  const data = await request("/students"); state.students = data.students || [];
  // A verified session is invalid only if its corresponding student was removed.
  if (!state.students.some((item) => item.student_id === state.activeId)) {
    state.activeId = null;
    clearStoredSessionToken();
    state.sessionToken = "";
  }
  renderProfile();
}
async function loadSkills() { const data = await request("/skills"); state.skills = data.skills || []; populateDiscoverFilters(); renderSkills(); renderPartners(); renderOverview(); }
async function loadExchanges() { const data = await request("/exchanges"); state.exchanges = data.exchanges || []; renderExchanges(); renderOverview(); }

function dashboardErrorMessage(error) {
  if (error.status === 401 || error.status === 403) return "Your session has expired. Please sign in again.";
  if (error.status === 404) return `The API endpoint ${error.endpoint || ""} was not found. Please try again after deployment completes.`;
  if (error.status >= 500) return "Unable to load your dashboard because the server reported an error. Please try again.";
  if (error.status === 400) return error.message || "The dashboard request was invalid.";
  if (error.isNetworkError) return "Unable to connect to the server. Please check your connection and try again.";
  return "Unable to load your dashboard. Please try again.";
}

function renderDashboardLoadError(message) {
  ["#teach-skills", "#learn-skills", "#partners-list", "#requests-list"].forEach((selector) => {
    byId(selector).innerHTML = `<div class="error-state">${safe(message)}</div>`;
  });
}

async function refreshAll() {
  ["#teach-skills", "#learn-skills", "#partners-list", "#requests-list"].forEach((selector) => { byId(selector).innerHTML = '<div class="loading-state">Loading dashboard…</div>'; });
  try {
    // Students determine the active profile. Once loaded, all other reads are independent.
    await loadStudents();
    const results = await Promise.allSettled([loadSkills(), loadExchanges(), loadNotifications()]);
    const failure = results.find((result) => result.status === "rejected");
    if (failure) throw failure.reason;
  } catch (error) {
    const message = dashboardErrorMessage(error);
    console.error("SkillSwap dashboard initialization failed", { endpoint: error.endpoint, status: error.status, response: error.responseBody, error });
    if (error.status === 401 || error.status === 403) {
      clearStoredSessionToken();
      state.sessionToken = "";
      state.activeId = null;
      showAuthGate("UNAUTHENTICATED", message);
      return;
    }
    renderDashboardLoadError(message);
    toast(message);
  }
}

// ---------- Create and update forms ----------
function openSkill(skill = null, type = "TEACH") {
  if (!state.students.length) { toast("Create a student profile first."); byId("#student-modal").showModal(); return; }
  if (!state.activeId) { toast("Log in to manage skills."); byId("#login-modal").showModal(); return; }
  formError("skill"); byId("#skill-id").value = skill?.skill_id || ""; byId("#skill-student-id").value = skill?.student_id || state.activeId; byId("#skill-name").value = skill?.skill_name || ""; byId("#skill-type").value = skill?.skill_type || type; byId("#skill-proficiency").value = skill?.proficiency || ""; byId("#skill-form-title").textContent = skill ? "Update your skill" : "Share or learn a skill"; byId("#skill-submit").textContent = skill ? "Update skill" : "Save skill"; byId("#skill-modal").showModal();
}
function openExchange(receiver = "") {
  if (!state.activeId) { toast("Log in to send an exchange request."); byId("#login-modal").showModal(); return; }
  if (state.students.length < 2) { toast("Create at least two student profiles first."); return; }
  formError("exchange"); byId("#exchange-form").reset(); byId("#exchange-sender-id").value = state.activeId; byId("#exchange-receiver-id").value = receiver || state.students.find((student) => student.student_id !== state.activeId)?.student_id; byId("#exchange-modal").showModal();
}
async function createStudent(event) {
  event.preventDefault(); const form = event.currentTarget; if (!form) return; formError("student"); const data = new FormData(form); const body = { user_id: data.get("user_id").trim(), password: data.get("password"), name: data.get("name").trim(), email: data.get("email").trim(), department: data.get("department").trim() || null, year: data.get("year") ? Number(data.get("year")) : null };
  const button = form.querySelector("[type=submit]"); setButtonBusy(button, true, "Creating profile...");
  try { const result = await request("/students", { method: "POST", body: JSON.stringify(body) }); state.sessionToken = result.session_token; saveSessionToken(result.session_token); state.activeId = result.student.student_id; form.reset(); byId("#student-modal").close(); showAuthGate("AUTHENTICATED"); toast("Student profile created."); await refreshAll(); } catch (error) { formError("student", error.message); } finally { setButtonBusy(button, false); }
}
async function login(event) {
  event.preventDefault(); const form = event.currentTarget; if (!form) return; formError("login"); const data = new FormData(form); const body = { user_id: data.get("user_id").trim(), password: data.get("password") };
  const button = form.querySelector("[type=submit]"); setButtonBusy(button, true, "Signing in...");
  try { const result = await request("/auth/login", { method: "POST", body: JSON.stringify(body) }); state.sessionToken = result.session_token; saveSessionToken(result.session_token); state.activeId = result.student.student_id; form.reset(); byId("#login-modal").close(); showAuthGate("AUTHENTICATED"); toast(`Logged in as ${result.student.name}.`); await refreshAll(); } catch (error) { formError("login", error.message); } finally { setButtonBusy(button, false); }
}
async function saveSkill(event) {
  event.preventDefault(); formError("skill"); const id = byId("#skill-id").value; const body = { student_id: Number(byId("#skill-student-id").value), skill_name: byId("#skill-name").value.trim(), skill_type: byId("#skill-type").value, proficiency: byId("#skill-proficiency").value.trim() || null };
  try { await request(id ? `/skills/${id}` : "/skills", { method: id ? "PUT" : "POST", body: JSON.stringify(body) }); byId("#skill-modal").close(); toast(id ? "Skill updated." : "Skill added."); await loadSkills(); } catch (error) { formError("skill", error.message); }
}
async function createExchange(event) {
  event.preventDefault(); formError("exchange"); const body = { sender_id: Number(byId("#exchange-sender-id").value), receiver_id: Number(byId("#exchange-receiver-id").value), offered_skill: byId("#offered-skill").value.trim(), requested_skill: byId("#requested-skill").value.trim() };
  if (body.sender_id === body.receiver_id) { formError("exchange", "Choose a different student to receive the request."); return; }
  try { await request("/exchanges", { method: "POST", body: JSON.stringify(body) }); byId("#exchange-modal").close(); toast("Exchange request sent."); await loadExchanges(); await loadNotifications(); } catch (error) { formError("exchange", error.message); }
}
async function removeSkill(id) { if (!confirm("Delete this skill?")) return; try { await request(`/skills/${id}`, { method: "DELETE" }); toast("Skill deleted."); await loadSkills(); } catch (error) { toast(error.message); } }
async function updateExchange(id, status) { try { await request(`/exchanges/${id}`, { method: "PUT", body: JSON.stringify({ status }) }); toast(status === "COMPLETED" ? "Exchange marked completed." : `Request ${status.toLowerCase()}.`); await Promise.all([loadExchanges(), loadNotifications()]); } catch (error) { toast(error.message); } }
async function removeExchange(id) { if (!confirm("Delete this exchange request?")) return; try { await request(`/exchanges/${id}`, { method: "DELETE" }); toast("Exchange request deleted."); await loadExchanges(); await loadNotifications(); } catch (error) { toast(error.message); } }

async function logout() {
  const button = byId("#logout-button");
  setButtonBusy(button, true, "Signing out...");
  try { await request("/auth/logout", { method: "POST" }); } catch (error) { toast("Signed out locally. The server could not be reached."); }
  finally {
  clearStoredSessionToken();
  state.sessionToken = "";
  state.activeId = null;
  state.notifications = [];
  state.unreadNotifications = 0;
  byId("#notification-panel").hidden = true;
  byId("#notification-bell").setAttribute("aria-expanded", "false");
  renderProfile();
  renderSkills();
  renderPartners();
  renderExchanges();
  renderOverview();
  renderNotifications();
  showAuthGate("UNAUTHENTICATED");
  setButtonBusy(button, false);
  toast("Logged out. Log in again to access a profile.");
  }
}

// ---------- Route setup ----------
// Vercel serves index.html for every route; this chooses the one page to display.
function configureRoute() {
  const path = location.pathname.replace(/\/+$/, "") || "/";
  const pages = { "/": "dashboard", "/my-skills": "my-skills", "/discover": "discover", "/requests": "requests" };
  const page = pages[path] || "dashboard";
  document.body.classList.add(`page-${page}`);
  document.querySelectorAll("[data-route]").forEach((link) => link.classList.toggle("active", link.dataset.route === path));
  document.title = `${page === "dashboard" ? "Dashboard" : page.replace("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())} | SkillSwap`;
}

// ---------- Buttons, forms, and startup ----------
byId(".menu-button").addEventListener("click", (event) => { const links = byId(".nav-links"); event.currentTarget.setAttribute("aria-expanded", String(links.classList.toggle("open"))); });
document.querySelectorAll("[data-scroll-to]").forEach((button) => button.addEventListener("click", () => byId(`#${button.dataset.scrollTo}`).scrollIntoView({ behavior: "smooth" })));
document.querySelectorAll("[data-close-modal]").forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));
document.querySelectorAll("[data-open-modal]").forEach((button) => button.addEventListener("click", () => button.dataset.openModal === "skill-modal" ? openSkill(null, button.dataset.skillType) : byId(`#${button.dataset.openModal}`).showModal()));
document.querySelectorAll("[data-toggle-password]").forEach((button) => button.addEventListener("click", () => {
  const input = byId(`#${button.dataset.togglePassword}`);
  if (!input) return;
  const isVisible = input.type === "password";
  input.type = isVisible ? "text" : "password";
  button.classList.toggle("is-visible", isVisible);
  button.setAttribute("aria-label", isVisible ? "Hide password" : "Show password");
  button.setAttribute("aria-pressed", String(isVisible));
}));
byId("#add-skill-button").addEventListener("click", () => openSkill());
byId("#logout-button").addEventListener("click", logout);
byId("#auth-login-button").addEventListener("click", () => { formError("login"); byId("#login-modal").showModal(); });
byId("#auth-create-button").addEventListener("click", () => { formError("student"); byId("#student-modal").showModal(); });
byId("#auth-retry-button").addEventListener("click", initializeSession);
// Discover filters operate on already-fetched data, avoiding extra API calls while typing.
["#discover-search", "#discover-department", "#discover-year", "#discover-proficiency"].forEach((selector) => {
  byId(selector).addEventListener(selector === "#discover-search" ? "input" : "change", renderPartners);
});
byId("#active-student-select").addEventListener("change", () => { byId("#active-student-select").value = state.activeId || ""; formError("login"); byId("#login-modal").showModal(); });
byId("#student-form").addEventListener("submit", createStudent); byId("#login-form").addEventListener("submit", login); byId("#skill-form").addEventListener("submit", saveSkill); byId("#exchange-form").addEventListener("submit", createExchange);
document.addEventListener("click", (event) => { const edit = event.target.dataset.editSkill; const skillDelete = event.target.dataset.deleteSkill; const connect = event.target.dataset.connect; const exchangeAction = event.target.dataset.exchangeAction; if (edit) openSkill(state.skills.find((skill) => skill.skill_id === Number(edit))); if (skillDelete) removeSkill(Number(skillDelete)); if (connect) openExchange(Number(connect)); if (exchangeAction) updateExchange(Number(event.target.dataset.exchangeId), exchangeAction); });

// Bell interactions: toggle the panel, close it outside, and persist read actions through the API.
byId("#notification-bell").addEventListener("click", (event) => {
  event.stopPropagation();
  const panel = byId("#notification-panel");
  panel.hidden = !panel.hidden;
  byId("#notification-bell").setAttribute("aria-expanded", String(!panel.hidden));
});
byId("#mark-all-read").addEventListener("click", markAllNotificationsRead);
document.addEventListener("click", (event) => {
  const notificationButton = event.target.closest("[data-notification-id]");
  if (notificationButton) {
    markNotificationRead(Number(notificationButton.dataset.notificationId));
    // Request notifications open the real Requests route for the selected profile.
    if (notificationButton.dataset.requestId) window.location.href = "/requests";
  }
  if (!byId(".notification-menu").contains(event.target)) {
    byId("#notification-panel").hidden = true;
    byId("#notification-bell").setAttribute("aria-expanded", "false");
  }
});
configureRoute();
initializeSession();
// Poll lightly for notifications to provide a real-time feel without WebSockets.
setInterval(loadNotifications, 45000);
