/**
 * app.js
 * ------
 * All frontend logic for JMZOps Every data operation goes through
 * assignment's API-driven architecture requirement.
 */

const API = "/api";

// ------------------------------------------------------------------
// Auth — JWT stored in memory + localStorage so a refresh doesn't log
// the staff member out. Public status/uptime pages never need this.
// ------------------------------------------------------------------
let authToken = localStorage.getItem("sw_token") || null;
let currentStaff = JSON.parse(localStorage.getItem("sw_staff") || "null");

function setAuth(token, staff) {
  authToken = token;
  currentStaff = staff;
  if (token) {
    localStorage.setItem("sw_token", token);
    localStorage.setItem("sw_staff", JSON.stringify(staff));
  } else {
    localStorage.removeItem("sw_token");
    localStorage.removeItem("sw_staff");
  }
  renderAuthState();
}

function authFetch(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
  return fetch(url, { ...options, headers });
}

function renderAuthState() {
  const loginCard = document.getElementById("loginCard");
  const adminContent = document.getElementById("adminContent");
  const whoAmI = document.getElementById("whoAmI");
  const logoutBtn = document.getElementById("logoutBtn");
  const staffSection = document.getElementById("staffSection");

  const loggedIn = !!authToken && !!currentStaff;
  loginCard.style.display = loggedIn ? "none" : "block";
  adminContent.style.display = loggedIn ? "block" : "none";
  logoutBtn.style.display = loggedIn ? "inline-block" : "none";
  whoAmI.innerHTML = loggedIn
    ? `${currentStaff.name} <span class="role-badge">${currentStaff.role.replace("_", " ")}</span>`
    : "";
  if (staffSection) staffSection.style.display = currentStaff?.role === "super_admin" ? "block" : "none";

  if (loggedIn) loadAdminPanel();
}

document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("loginEmail").value;
  const password = document.getElementById("loginPassword").value;
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  const msg = document.getElementById("loginMsg");
  if (!res.ok) {
    msg.textContent = data.error || "Login failed";
    return;
  }
  msg.textContent = "";
  document.getElementById("loginForm").reset();
  setAuth(data.token, data.staff);
});

document.getElementById("logoutBtn").addEventListener("click", () => {
  setAuth(null, null);
});

// ------------------------------------------------------------------
// Tab navigation
// ------------------------------------------------------------------
const navPublic = document.getElementById("navPublic");
const navAdmin = document.getElementById("navAdmin");
const tabPublic = document.getElementById("tabPublic");
const tabAdmin = document.getElementById("tabAdmin");

navPublic.addEventListener("click", () => switchTab("public"));
navAdmin.addEventListener("click", () => switchTab("admin"));

function switchTab(name) {
  const isPublic = name === "public";
  tabPublic.classList.toggle("active", isPublic);
  tabAdmin.classList.toggle("active", !isPublic);
  navPublic.classList.toggle("active", isPublic);
  navAdmin.classList.toggle("active", !isPublic);
  if (isPublic) loadPublicStatus();
  else renderAuthState();
}

// ------------------------------------------------------------------
// PUBLIC STATUS PAGE
// ------------------------------------------------------------------
const STATUS_LABELS = {
  operational: "All Systems Operational",
  degraded: "Degraded Performance",
  partial_outage: "Partial Outage",
  major_outage: "Major Outage",
  maintenance: "Under Maintenance",
};

async function loadPublicStatus() {
  const res = await fetch(`${API}/public/status`);
  const data = await res.json();

  const banner = document.getElementById("overallBanner");
  const overallText = document.getElementById("overallText");
  banner.className = `overall-banner banner-${data.overall_status}`;
  banner.querySelector(".status-dot").className = `status-dot ${data.overall_status}`;
  overallText.textContent = STATUS_LABELS[data.overall_status] || data.overall_status;

  // Components grouped
  const groups = {};
  data.components.forEach((c) => {
    groups[c.group_name] = groups[c.group_name] || [];
    groups[c.group_name].push(c);
  });
  const compList = document.getElementById("componentList");
  compList.innerHTML = "";
  if (data.components.length === 0) compList.innerHTML = "<small class='muted'>No components configured yet.</small>";
  Object.entries(groups).forEach(([group, comps]) => {
    const title = document.createElement("div");
    title.className = "group-title";
    title.textContent = group;
    compList.appendChild(title);
    comps.forEach((c) => {
      const row = document.createElement("div");
      row.className = "component-row";
      row.innerHTML = `<span>${c.name}</span><span class="badge ${c.status}">${c.status.replace("_", " ")}</span>`;
      compList.appendChild(row);
    });
  });

  // Active incidents
  const incList = document.getElementById("activeIncidentList");
  incList.innerHTML = "";
  if (data.active_incidents.length === 0) {
    incList.innerHTML = "<small class='muted'>No active incidents.</small>";
  } else {
    data.active_incidents.forEach((inc) => {
      const div = document.createElement("div");
      div.className = `incident-card ${inc.status}`;
      div.style.marginBottom = "14px";
      const updatesHtml = inc.updates
        .map((u) => `<div class="update-line"><strong>${u.status}</strong> — ${u.message} <small class="muted">(${new Date(u.created_at).toLocaleString()})</small></div>`)
        .join("");
      div.innerHTML = `<strong>${inc.title}</strong> <span class="badge ${inc.status}">${inc.status}</span>${updatesHtml}`;
      incList.appendChild(div);
    });
  }

  // Maintenance
  const maintList = document.getElementById("maintenanceList");
  maintList.innerHTML = "";
  if (data.upcoming_maintenance.length === 0) {
    maintList.innerHTML = "<small class='muted'>Nothing scheduled.</small>";
  } else {
    data.upcoming_maintenance.forEach((m) => {
      const div = document.createElement("div");
      div.className = "update-line";
      div.innerHTML = `<strong>${m.title}</strong> — ${new Date(m.scheduled_start).toLocaleString()} to ${new Date(m.scheduled_end).toLocaleString()}`;
      maintList.appendChild(div);
    });
  }

  // Asset uptime — public, no login required.
  const uptimeList = document.getElementById("uptimeList");
  const uptimeRes = await fetch(`${API}/public/uptime`);
  const assets = await uptimeRes.json();
  uptimeList.innerHTML = "";
  if (assets.length === 0) {
    uptimeList.innerHTML = "<small class='muted'>No assets configured yet.</small>";
  } else {
    assets.forEach((a) => {
      const row = document.createElement("div");
      row.className = "component-row";
      row.innerHTML = `
        <span>${a.name} <small class="muted">(${a.type.replace("_", " ")})</small></span>
        <span class="badge ${a.status === "up" ? "operational" : a.status === "down" ? "major_outage" : "maintenance"}">${a.status}</span>
        <small class="muted">24h: ${a.uptime_24h ?? "–"}% · 7d: ${a.uptime_7d ?? "–"}% · 30d: ${a.uptime_30d ?? "–"}%</small>
      `;
      uptimeList.appendChild(row);
    });
  }
}

document.getElementById("subscribeForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("subscribeEmail").value;
  const res = await fetch(`${API}/subscribers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const data = await res.json();
  const msg = document.getElementById("subscribeMsg");
  msg.textContent = res.ok ? "Subscribed! You'll be notified of incidents and maintenance." : data.error;
  if (res.ok) document.getElementById("subscribeForm").reset();
});

// ------------------------------------------------------------------
// ADMIN PANEL
// ------------------------------------------------------------------
async function loadAdminPanel() {
  await Promise.all([
    loadDashboard(),
    loadComponentsAdmin(),
    loadIncidentsAdmin(),
    loadMaintenanceAdmin(),
    loadSubscribersAdmin(),
    loadNotificationsAdmin(),
    loadAssetsAdmin(),
    loadStaffAdmin(),
  ]);
}

async function loadDashboard() {
  const res = await authFetch(`${API}/dashboard`);
  const data = await res.json();
  const el = document.getElementById("dashboardStats");
  el.innerHTML = `
    <div class="stat"><div class="value">${data.total_incidents}</div><div class="label">Total Incidents</div></div>
    <div class="stat"><div class="value">${data.open_incidents}</div><div class="label">Open Incidents</div></div>
    <div class="stat"><div class="value">${data.avg_resolution_minutes ?? "–"}</div><div class="label">Avg Resolution (min)</div></div>
    <div class="stat"><div class="value">${data.upcoming_maintenance}</div><div class="label">Upcoming Maintenance</div></div>
    <div class="stat"><div class="value">${data.total_subscribers}</div><div class="label">Subscribers</div></div>
    <div class="stat"><div class="value">${data.total_notifications_sent}</div><div class="label">Notifications Sent</div></div>
  `;
}

// --- Components ---
async function loadComponentsAdmin() {
  const res = await authFetch(`${API}/components`);
  const components = await res.json();
  const tbody = document.querySelector("#componentTable tbody");
  tbody.innerHTML = "";
  components.forEach((c) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${c.name}</td>
      <td>${c.group_name}</td>
      <td><span class="badge ${c.status}">${c.status.replace("_", " ")}</span></td>
      <td><button class="danger" data-id="${c.id}">Delete</button></td>
    `;
    tr.querySelector("button").addEventListener("click", async () => {
      await authFetch(`${API}/components/${c.id}`, { method: "DELETE" });
      loadComponentsAdmin();
      loadIncidentComponentChecks();
    });
    tbody.appendChild(tr);
  });
  loadIncidentComponentChecks();
}

document.getElementById("componentForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("compName").value;
  const group_name = document.getElementById("compGroup").value;
  const status = document.getElementById("compStatus").value;
  await authFetch(`${API}/components`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, group_name, status }),
  });
  e.target.reset();
  loadComponentsAdmin();
});

async function loadIncidentComponentChecks() {
  const res = await authFetch(`${API}/components`);
  const components = await res.json();
  const container = document.getElementById("incComponentChecks");
  container.innerHTML = components
    .map(
      (c) => `<label><input type="checkbox" value="${c.id}" class="inc-comp-check"> ${c.name}</label>`
    )
    .join("");
}

// --- Incidents ---
document.getElementById("createIncidentBtn").addEventListener("click", async () => {
  const title = document.getElementById("incTitle").value;
  const impact = document.getElementById("incImpact").value;
  const message = document.getElementById("incMessage").value || "We are investigating this issue.";
  const component_ids = Array.from(document.querySelectorAll(".inc-comp-check:checked")).map((el) => parseInt(el.value));

  if (!title) {
    alert("Title is required");
    return;
  }

  await authFetch(`${API}/incidents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, impact, message, component_ids }),
  });

  document.getElementById("incTitle").value = "";
  document.getElementById("incMessage").value = "";
  loadIncidentsAdmin();
  loadComponentsAdmin();
  loadDashboard();
});

async function loadIncidentsAdmin() {
  const res = await authFetch(`${API}/incidents`);
  const incidents = await res.json();
  const container = document.getElementById("incidentList");
  container.innerHTML = "";

  incidents.forEach((inc) => {
    const div = document.createElement("div");
    div.className = `card incident-card ${inc.status}`;
    div.innerHTML = `
      <strong>${inc.title}</strong>
      <span class="badge ${inc.status}">${inc.status}</span>
      <span class="badge" style="background:#888;">${inc.impact}</span>
      <button class="danger" style="float:right;" data-action="delete">Delete</button>
      <div class="updates-${inc.id}"></div>
      <form class="inline update-form-${inc.id}" style="margin-top:10px;">
        <select class="status-select-${inc.id}">
          <option value="investigating">Investigating</option>
          <option value="identified">Identified</option>
          <option value="monitoring">Monitoring</option>
          <option value="resolved">Resolved</option>
        </select>
        <input type="text" class="msg-input-${inc.id}" placeholder="Update message" style="flex:1;">
        <button type="submit" class="primary">Post Update</button>
      </form>
    `;
    div.querySelector('[data-action="delete"]').addEventListener("click", async () => {
      await authFetch(`${API}/incidents/${inc.id}`, { method: "DELETE" });
      loadIncidentsAdmin();
      loadDashboard();
    });
    div.querySelector(`.update-form-${inc.id}`).addEventListener("submit", async (e) => {
      e.preventDefault();
      const status = div.querySelector(`.status-select-${inc.id}`).value;
      const message = div.querySelector(`.msg-input-${inc.id}`).value;
      if (!message) return;
      await authFetch(`${API}/incidents/${inc.id}/updates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, message }),
      });
      loadIncidentsAdmin();
      loadComponentsAdmin();
      loadDashboard();
      loadNotificationsAdmin();
    });
    container.appendChild(div);
  });
}

// --- Maintenance ---
document.getElementById("maintenanceForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = document.getElementById("maintTitle").value;
  const scheduled_start = document.getElementById("maintStart").value;
  const scheduled_end = document.getElementById("maintEnd").value;
  await authFetch(`${API}/maintenance`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, scheduled_start, scheduled_end }),
  });
  e.target.reset();
  loadMaintenanceAdmin();
  loadNotificationsAdmin();
});

async function loadMaintenanceAdmin() {
  const res = await authFetch(`${API}/maintenance`);
  const rows = await res.json();
  const tbody = document.querySelector("#maintenanceTable tbody");
  tbody.innerHTML = "";
  rows.forEach((m) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${m.title}</td>
      <td>${new Date(m.scheduled_start).toLocaleString()}</td>
      <td>${new Date(m.scheduled_end).toLocaleString()}</td>
      <td>${m.status}</td>
      <td><button class="danger" data-id="${m.id}">Delete</button></td>
    `;
    tr.querySelector("button").addEventListener("click", async () => {
      await authFetch(`${API}/maintenance/${m.id}`, { method: "DELETE" });
      loadMaintenanceAdmin();
    });
    tbody.appendChild(tr);
  });
}

// --- Subscribers ---
async function loadSubscribersAdmin() {
  const res = await authFetch(`${API}/subscribers`);
  const rows = await res.json();
  const tbody = document.querySelector("#subscriberTable tbody");
  tbody.innerHTML = "";
  rows.forEach((s) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${s.email}</td>
      <td>${new Date(s.created_at).toLocaleString()}</td>
      <td><button class="danger" data-id="${s.id}">Remove</button></td>
    `;
    tr.querySelector("button").addEventListener("click", async () => {
      await authFetch(`${API}/subscribers/${s.id}`, { method: "DELETE" });
      loadSubscribersAdmin();
    });
    tbody.appendChild(tr);
  });
}

// --- Notifications log ---
async function loadNotificationsAdmin() {
  const res = await authFetch(`${API}/notifications`);
  const rows = await res.json();
  const tbody = document.querySelector("#notificationTable tbody");
  tbody.innerHTML = "";
  rows.forEach((n) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${n.email}</td><td>${n.message}</td><td>${new Date(n.sent_at).toLocaleString()}</td>`;
    tbody.appendChild(tr);
  });
}

// --- Assets & uptime ---
async function loadAssetsAdmin() {
  const res = await authFetch(`${API}/assets`);
  if (!res.ok) return; // viewer-safe: GET is allowed for any role, but guard anyway
  const assets = await res.json();
  const container = document.getElementById("assetList");
  container.innerHTML = "";
  const canEdit = currentStaff && ["editor", "super_admin"].includes(currentStaff.role);

  if (assets.length === 0) {
    container.innerHTML = "<small class='muted'>No assets yet.</small>";
    return;
  }

  assets.forEach((a) => {
    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `
      <strong>${a.name}</strong> <small class="muted">(${a.type.replace("_", " ")})</small>
      <span class="badge ${a.status === "up" ? "operational" : a.status === "down" ? "major_outage" : "maintenance"}">${a.status}</span>
      ${canEdit ? '<button class="danger" data-action="delete" style="float:right;">Delete</button>' : ""}
      <div style="margin-top:6px;"><small class="muted">Uptime — 24h: ${a.uptime_24h ?? "–"}% · 7d: ${a.uptime_7d ?? "–"}% · 30d: ${a.uptime_30d ?? "–"}% · 90d: ${a.uptime_90d ?? "–"}%</small></div>
      ${
        canEdit
          ? `<form class="inline check-form-${a.id}" style="margin-top:8px;">
               <select class="check-status-${a.id}">
                 <option value="up">Up</option>
                 <option value="down">Down</option>
               </select>
               <button type="submit" class="primary">Log Manual Check</button>
             </form>`
          : ""
      }
    `;
    if (canEdit) {
      div.querySelector('[data-action="delete"]').addEventListener("click", async () => {
        await authFetch(`${API}/assets/${a.id}`, { method: "DELETE" });
        loadAssetsAdmin();
      });
      div.querySelector(`.check-form-${a.id}`).addEventListener("submit", async (e) => {
        e.preventDefault();
        const status = div.querySelector(`.check-status-${a.id}`).value;
        await authFetch(`${API}/assets/${a.id}/checks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });
        loadAssetsAdmin();
      });
    }
    container.appendChild(div);
  });
}

document.getElementById("assetForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("assetName").value;
  const type = document.getElementById("assetType").value;
  const ping_url = document.getElementById("assetPingUrl").value || null;
  await authFetch(`${API}/assets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, type, ping_url }),
  });
  e.target.reset();
  loadAssetsAdmin();
});

// --- Staff (super_admin only — backend rejects anyone else) ---
async function loadStaffAdmin() {
  if (!currentStaff || currentStaff.role !== "super_admin") return;
  const res = await authFetch(`${API}/staff`);
  if (!res.ok) return;
  const staff = await res.json();
  const tbody = document.querySelector("#staffTable tbody");
  tbody.innerHTML = "";
  staff.forEach((s) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${s.name}</td>
      <td>${s.email}</td>
      <td><span class="role-badge">${s.role.replace("_", " ")}</span></td>
      <td><button class="danger" data-id="${s.id}">Delete</button></td>
    `;
    tr.querySelector("button").addEventListener("click", async () => {
      const res = await authFetch(`${API}/staff/${s.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Could not delete staff member");
        return;
      }
      loadStaffAdmin();
    });
    tbody.appendChild(tr);
  });
}

document.getElementById("staffForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("staffName").value;
  const email = document.getElementById("staffEmail").value;
  const password = document.getElementById("staffPassword").value;
  const role = document.getElementById("staffRole").value;
  const res = await authFetch(`${API}/staff`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password, role }),
  });
  if (!res.ok) {
    const data = await res.json();
    alert(data.error || "Could not create staff member");
    return;
  }
  e.target.reset();
  loadStaffAdmin();
});

// ------------------------------------------------------------------
// Initial load
// ------------------------------------------------------------------
loadPublicStatus();
renderAuthState();
