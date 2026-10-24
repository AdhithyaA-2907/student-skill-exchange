const API = ["localhost", "127.0.0.1"].includes(window.location.hostname)
  ? "http://localhost:5000/api"
  : "https://student-skill-exchange-api.onrender.com/api";
const TOKEN_KEY = "studentSkillExchange.adminSessionToken";
const token = localStorage.getItem(TOKEN_KEY) || "";
const statusText = document.querySelector("#mfa-status");
const startButton = document.querySelector("#mfa-start");
const provisioning = document.querySelector("#mfa-provisioning");

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || "The request could not be completed.");
    error.status = response.status;
    throw error;
  }
  return data;
}

function showError(error) {
  if (error.status === 401 || error.status === 403) {
    localStorage.removeItem(TOKEN_KEY);
    window.location.assign("/admin/login");
    return;
  }
  statusText.className = "form-error";
  statusText.textContent = error.message;
}

if (!token) window.location.assign("/admin/login");
else request("/admin/mfa/status").then(({ enabled }) => {
  if (enabled) {
    statusText.className = "form-success";
    statusText.textContent = "Authenticator MFA is already enabled for this account.";
    return;
  }
  startButton.hidden = false;
  statusText.className = "mfa-instructions";
  statusText.textContent = "Step 1: open your authenticator app and add a new account.";
}).catch(showError);

startButton.addEventListener("click", async () => {
  startButton.disabled = true;
  try {
    const { qr_code, manual_key } = await request("/admin/mfa/setup", { method: "POST", body: "{}" });
    document.querySelector("#mfa-qr").src = qr_code;
    document.querySelector("#mfa-manual-key").textContent = manual_key;
    provisioning.hidden = false;
    startButton.hidden = true;
    statusText.className = "mfa-instructions";
    statusText.textContent = "Step 2: scan the code, then verify the current code below.";
  } catch (error) {
    showError(error);
    startButton.disabled = false;
  }
});

document.querySelector("#mfa-verify-form").addEventListener("submit", async event => {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button[type=submit]");
  button.disabled = true;
  statusText.textContent = "";
  try {
    await request("/admin/mfa/enable", { method: "POST", body: JSON.stringify({ code: new FormData(event.currentTarget).get("code") }) });
    statusText.className = "form-success";
    statusText.textContent = "Authenticator MFA is enabled. Opening the Admin Dashboard…";
    window.setTimeout(() => window.location.assign("/admin/dashboard"), 900);
  } catch (error) {
    showError(error);
    button.disabled = false;
  }
});
