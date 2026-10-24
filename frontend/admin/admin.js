// SkillSwap Admin Console: a separate UI using the existing Bearer-token session API.
const API = ["localhost", "127.0.0.1"].includes(window.location.hostname)
  ? "http://localhost:5000/api"
  : "https://student-skill-exchange-api.onrender.com/api";
const TOKEN_KEY = "studentSkillExchange.adminSessionToken";
const state = { token: localStorage.getItem(TOKEN_KEY) || "", admin: null, students: [], skills: [] };
const $ = (selector) => document.querySelector(selector);
const safe = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
const number = (value) => Number(value || 0).toLocaleString();

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}), ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || "The request could not be completed.");
    error.status = response.status;
    error.code = data.code;
    console.error("Admin API error", { path, status: response.status, code: data.code });
    throw error;
  }
  return data;
}

function message(text, type = "success") {
  const element = $("#admin-message");
  element.textContent = text; element.className = `message ${type}`; element.hidden = false;
}
function setPage(title, kicker = "SUPERVISOR AREA") { $("#page-title").textContent = title; $("#page-kicker").textContent = kicker; }
function card(label, value) { return `<article class="card"><p>${safe(label)}</p><strong>${number(value)}</strong></article>`; }
function tag(value) { return `<span class="tag ${safe(String(value).toLowerCase())}">${safe(value)}</span>`; }
function routePath(name) { return name === "dashboard" ? "/admin/dashboard" : `/admin/${name}`; }

async function renderDashboard() {
  setPage("Platform dashboard");
  const { dashboard } = await api("/admin/dashboard");
  $("#admin-content").innerHTML = `<section class="cards">${card("Total students", dashboard.total_students)}${card("Total skills", dashboard.total_skills)}${card("Total exchanges", dashboard.total_exchanges)}${card("Active users", dashboard.active_users)}${card("Pending requests", dashboard.pending_exchanges)}${card("Notifications", dashboard.total_notifications)}</section><section class="panel"><h2>Supervisor overview</h2><p>The figures above are calculated from the live SkillSwap database. Administrative controls never expose credentials, password hashes, or session tokens.</p></section>`;
}

async function renderStudents() {
  setPage("Student management", "ACCOUNTS");
  $("#admin-content").innerHTML = `<section class="panel"><div class="panel-head"><h2>Students</h2><input id="student-search" class="search" placeholder="Search user, name, email, department"></div><div id="students-table" class="loading">Loading students…</div></section>`;
  const load = async () => {
    const search = $("#student-search").value.trim();
    const { students } = await api(`/admin/students?search=${encodeURIComponent(search)}&sort=name`);
    state.students = students;
    $("#students-table").innerHTML = students.length ? `<div class="table-wrap"><table><thead><tr><th>ID</th><th>User ID</th><th>Name</th><th>Email</th><th>Department</th><th>Year</th><th>Role</th><th>Actions</th></tr></thead><tbody>${students.map(student => `<tr><td>${student.student_id}</td><td>${safe(student.user_id)}</td><td>${safe(student.name)}</td><td>${safe(student.email)}</td><td>${safe(student.department || "—")}</td><td>${safe(student.year || "—")}</td><td>${tag(student.role)}</td><td><div class="row-actions"><button class="small-button" data-view-student="${student.student_id}">View</button><button class="small-button" data-edit-student="${student.student_id}">Edit</button><button class="small-button danger" data-delete-student="${student.student_id}">Delete</button></div></td></tr>`).join("")}</tbody></table></div>` : '<div class="empty">No students match this search.</div>';
  };
  $("#student-search").addEventListener("input", load);
  await load();
}

function openDialog(markup) { $("#dialog-content").innerHTML = markup; $("#admin-dialog").showModal(); }
async function showStudent(studentId) {
  const { student, skills, exchanges } = await api(`/admin/students/${studentId}`);
  openDialog(`<h2>${safe(student.name)}</h2><div class="details"><div><strong>Student ID</strong>${student.student_id}</div><div><strong>User ID</strong>${safe(student.user_id)}</div><div><strong>Email</strong>${safe(student.email)}</div><div><strong>Role</strong>${tag(student.role)}</div><div><strong>Department</strong>${safe(student.department || "Not supplied")}</div><div><strong>Year</strong>${safe(student.year || "Not supplied")}</div></div><div class="two-col"><section><h3>Skills</h3>${skills.length ? skills.map(skill => `<p>${safe(skill.skill_name)} · ${safe(skill.skill_type)}</p>`).join("") : "<p>No skills recorded.</p>"}</section><section><h3>Exchange activity</h3><p>${exchanges.length} exchange request(s)</p></section></div>`);
}
function editStudent(studentId) {
  const student = state.students.find(item => item.student_id === studentId); if (!student) return;
  openDialog(`<h2>Edit student</h2><form id="student-edit-form"><div class="form-grid"><label class="field">Name<input name="name" value="${safe(student.name)}" required></label><label class="field">Email<input name="email" type="email" value="${safe(student.email)}" required></label><label class="field">Department<input name="department" value="${safe(student.department || "")}"></label><label class="field">Year<input name="year" type="number" min="1" max="8" value="${safe(student.year || "")}"></label><label class="field">Role<select name="role"><option value="student" ${student.role === "student" ? "selected" : ""}>Student</option><option value="admin" ${student.role === "admin" ? "selected" : ""}>Admin</option></select></label></div><div class="dialog-actions"><button class="primary">Save changes</button></div></form>`);
  $("#student-edit-form").addEventListener("submit", async event => { event.preventDefault(); const form = new FormData(event.currentTarget); try { await api(`/admin/students/${studentId}`, { method: "PUT", body: JSON.stringify(Object.fromEntries(form)) }); $("#admin-dialog").close(); message("Student updated."); renderStudents(); } catch (error) { message(error.message, "error"); } });
}
async function deleteStudent(studentId) {
  const student = state.students.find(item => item.student_id === studentId);
  if (!student || !confirm(`Delete ${student.name}? This cannot be undone.`)) return;
  try { await api(`/admin/students/${studentId}`, { method: "DELETE", body: JSON.stringify({ confirm_student_id: studentId }) }); message("Student deleted."); renderStudents(); } catch (error) { message(error.message, "error"); }
}

async function renderSkills() {
  setPage("Skill management", "SKILL CATALOG");
  $("#admin-content").innerHTML = `<section class="panel"><div class="panel-head"><h2>Skills</h2><div class="row-actions"><input id="skill-search" class="search" placeholder="Search skill or student"><button id="add-skill" class="primary">Add skill</button></div></div><div id="skills-table" class="loading">Loading skills…</div></section>`;
  const load = async () => { const { skills } = await api(`/admin/skills?search=${encodeURIComponent($("#skill-search").value.trim())}`); state.skills = skills; $("#skills-table").innerHTML = skills.length ? `<div class="table-wrap"><table><thead><tr><th>ID</th><th>Student</th><th>Skill</th><th>Type</th><th>Proficiency</th><th>Actions</th></tr></thead><tbody>${skills.map(skill => `<tr><td>${skill.skill_id}</td><td>${safe(skill.student_name)} <small>(${safe(skill.user_id)})</small></td><td>${safe(skill.skill_name)}</td><td>${tag(skill.skill_type)}</td><td>${safe(skill.proficiency || "—")}</td><td><div class="row-actions"><button class="small-button" data-edit-skill="${skill.skill_id}">Edit</button><button class="small-button danger" data-delete-skill="${skill.skill_id}">Delete</button></div></td></tr>`).join("")}</tbody></table></div>` : '<div class="empty">No skills found.</div>'; };
  $("#skill-search").addEventListener("input", load); $("#add-skill").addEventListener("click", () => editSkill()); await load();
}
async function editSkill(skillId = null) {
  if (!state.students.length) {
    const response = await api("/admin/students?sort=name");
    state.students = response.students;
  }
  const skill = state.skills.find(item => item.skill_id === skillId) || { student_id: "", skill_name: "", skill_type: "TEACH", proficiency: "" };
  const studentOptions = state.students.map(student => `<option value="${student.student_id}" ${Number(skill.student_id) === student.student_id ? "selected" : ""}>${safe(student.name)} (${safe(student.user_id)})</option>`).join("");
  openDialog(`<h2>${skillId ? "Edit skill" : "Add skill"}</h2><form id="skill-edit-form"><div class="form-grid"><label class="field">Student<select name="student_id" required>${studentOptions}</select></label><label class="field">Skill name<input name="skill_name" value="${safe(skill.skill_name)}" required></label><label class="field">Type<select name="skill_type"><option value="TEACH" ${skill.skill_type === "TEACH" ? "selected" : ""}>Teach</option><option value="LEARN" ${skill.skill_type === "LEARN" ? "selected" : ""}>Learn</option></select></label><label class="field">Proficiency<input name="proficiency" value="${safe(skill.proficiency || "")}"></label></div><div class="dialog-actions"><button class="primary">Save skill</button></div></form>`);
  $("#skill-edit-form").addEventListener("submit", async event => { event.preventDefault(); const body = Object.fromEntries(new FormData(event.currentTarget)); body.student_id = Number(body.student_id); try { await api(skillId ? `/admin/skills/${skillId}` : "/admin/skills", { method: skillId ? "PUT" : "POST", body: JSON.stringify(body) }); $("#admin-dialog").close(); message("Skill saved."); renderSkills(); } catch (error) { message(error.message, "error"); } });
}
async function deleteSkill(skillId) { if (!confirm("Delete this skill? This cannot be undone.")) return; try { await api(`/admin/skills/${skillId}`, { method: "DELETE", body: JSON.stringify({ confirm_skill_id: skillId }) }); message("Skill deleted."); renderSkills(); } catch (error) { message(error.message, "error"); } }

async function renderExchanges() {
  setPage("Skill exchanges", "EXCHANGE ACTIVITY"); const { exchanges } = await api("/admin/exchanges");
  $("#admin-content").innerHTML = `<section class="panel"><div class="panel-head"><h2>All exchange requests</h2></div>${exchanges.length ? `<div class="table-wrap"><table><thead><tr><th>ID</th><th>Requester</th><th>Offers</th><th>Partner</th><th>Requests</th><th>Status</th><th>Meeting</th></tr></thead><tbody>${exchanges.map(item => `<tr><td>${item.request_id}</td><td>${safe(item.sender_name)}</td><td>${safe(item.offered_skill)}</td><td>${safe(item.receiver_name)}</td><td>${safe(item.requested_skill)}</td><td>${tag(item.status)}</td><td>${safe(item.meeting_date || "—")} ${safe(item.meeting_time ? String(item.meeting_time).slice(0, 5) : "")}</td></tr>`).join("")}</tbody></table></div>` : '<div class="empty">No exchanges recorded.</div>'}</section>`;
}
async function renderNotifications() {
  setPage("Notifications", "PLATFORM ACTIVITY"); const { notifications } = await api("/admin/notifications");
  $("#admin-content").innerHTML = `<section class="panel"><div class="panel-head"><h2>Recent notifications</h2></div>${notifications.length ? `<div class="table-wrap"><table><thead><tr><th>Student</th><th>Type</th><th>Message</th><th>Read</th><th>Created</th></tr></thead><tbody>${notifications.map(item => `<tr><td>${safe(item.student_name)}</td><td>${safe(item.type)}</td><td>${safe(item.message)}</td><td>${item.is_read ? "Yes" : "No"}</td><td>${safe(new Date(item.created_at).toLocaleString())}</td></tr>`).join("")}</tbody></table></div>` : '<div class="empty">No notifications recorded.</div>'}</section>`;
}
async function renderProfile() {
  setPage("Admin profile", "ACCOUNT SETTINGS"); const { admin } = await api("/admin/profile"); state.admin = admin;
  $("#admin-content").innerHTML = `<section class="panel"><h2>Administrator profile</h2><form id="profile-form"><div class="form-grid"><label class="field">User ID<input value="${safe(admin.user_id)}" disabled></label><label class="field">Role<input value="${safe(admin.role)}" disabled></label><label class="field">Name<input name="name" value="${safe(admin.name)}" required></label><label class="field">Email<input name="email" type="email" value="${safe(admin.email)}" required></label><label class="field">Department<input name="department" value="${safe(admin.department || "")}"></label><label class="field">Year<input name="year" type="number" min="1" max="8" value="${safe(admin.year || "")}"></label></div><div class="dialog-actions"><button class="primary">Save profile</button></div></form></section>`;
  $("#profile-form").addEventListener("submit", async event => { event.preventDefault(); try { const response = await api("/admin/profile", { method: "PUT", body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) }); state.admin = response.admin; $("#admin-name").textContent = response.admin.name; message("Profile saved."); } catch (error) { message(error.message, "error"); } });
}

const views = { dashboard: renderDashboard, students: renderStudents, skills: renderSkills, exchanges: renderExchanges, notifications: renderNotifications, profile: renderProfile };
const currentPage = document.body.dataset.adminPage;
const goTo = path => window.location.assign(path);

function bindLoginPage() {
  const form = $("#admin-login-form");
  if (new URLSearchParams(location.search).has("registered")) $("#login-success").hidden = false;
  form.addEventListener("submit", async event => {
    event.preventDefault(); $("#login-error").textContent = "";
    try {
      const response = await api("/admin/login", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(form))) });
      state.token = response.session_token; state.admin = response.student; localStorage.setItem(TOKEN_KEY, state.token);
      goTo(response.student.totp_enabled ? "/admin/dashboard" : "/admin/mfa-setup");
    } catch (error) {
      if (error.code === "MFA_REQUIRED") {
        const field = $("#authenticator-field");
        field.hidden = false;
        field.querySelector("input").required = true;
        field.querySelector("input").focus();
      }
      $("#login-error").textContent = error.message;
    }
  });
}

function bindRegisterPage() {
  const form = $("#admin-register-form");
  form.addEventListener("submit", async event => {
    event.preventDefault(); $("#register-error").textContent = "";
    const data = Object.fromEntries(new FormData(form));
    if (data.password !== data.confirm_password) { $("#register-error").textContent = "Password confirmation does not match"; return; }
    const button = form.querySelector("button[type=submit]"); button.disabled = true;
    try {
      await api("/admin/register", { method: "POST", body: JSON.stringify(data) });
      // Registration has its own document; return to the separate login document on success.
      goTo("/admin/login?registered=1");
    } catch (error) { $("#register-error").textContent = error.message; } finally { button.disabled = false; }
  });
}

async function loadAdminPage() {
  if (!state.token) return goTo("/admin/login");
  try {
    const response = await api("/admin/profile"); state.admin = response.admin;
    $("#admin-name").textContent = response.admin.name;
  } catch (error) {
    state.token = ""; localStorage.removeItem(TOKEN_KEY); return goTo("/admin/login");
  }
  document.querySelectorAll("[data-admin-route]").forEach(link => link.classList.toggle("active", link.dataset.adminRoute === currentPage));
  try { await (views[currentPage] || renderDashboard)(); }
  catch (error) { $("#admin-content").innerHTML = `<div class="empty">${safe(error.message)}</div>`; }
}

document.addEventListener("click", event => { const target = event.target; if (target.dataset.viewStudent) showStudent(Number(target.dataset.viewStudent)); if (target.dataset.editStudent) editStudent(Number(target.dataset.editStudent)); if (target.dataset.deleteStudent) deleteStudent(Number(target.dataset.deleteStudent)); if (target.dataset.editSkill) editSkill(Number(target.dataset.editSkill)); if (target.dataset.deleteSkill) deleteSkill(Number(target.dataset.deleteSkill)); });

if (currentPage === "login") bindLoginPage();
else if (currentPage === "register") bindRegisterPage();
else {
  $("#admin-logout").addEventListener("click", async () => { try { await api("/auth/logout", { method: "POST" }); } catch (error) { console.error("Admin logout failed", error); } state.token = ""; localStorage.removeItem(TOKEN_KEY); goTo("/admin/login"); });
  loadAdminPage();
}
