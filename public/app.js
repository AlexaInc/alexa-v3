(() => {
  "use strict";

  const $ = (selector, parent = document) => parent.querySelector(selector);
  const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
  let currentRole = null;
  let ownerStatsTimer = null;

  const loginModal = $("#loginModal");
  const loginError = $("#loginError");

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
    })[character]);
  }

  function formatNumber(value) {
    return Number(value || 0).toLocaleString();
  }

  async function api(url, options = {}) {
    const response = await fetch(url, {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "Request failed.");
    return data;
  }

  function showLoginError(message = "") {
    loginError.textContent = message;
    loginError.hidden = !message;
  }

  function openLoginModal(tab = "owner") {
    showLoginError();
    loginModal.hidden = false;
    document.body.classList.add("modal-open");
    selectLoginTab(tab);
    setTimeout(() => $(`#${tab}LoginForm input`)?.focus(), 0);
  }

  function closeLoginModal() {
    loginModal.hidden = true;
    document.body.classList.remove("modal-open");
    showLoginError();
  }

  function selectLoginTab(tab) {
    $$('[data-login-tab]').forEach((button) => {
      const selected = button.dataset.loginTab === tab;
      button.classList.toggle("active", selected);
      button.setAttribute("aria-selected", String(selected));
    });
    $("#ownerLoginForm").hidden = tab !== "owner";
    $("#userLoginForm").hidden = tab !== "user";
    showLoginError();
  }

  function showPublicView() {
    currentRole = null;
    clearInterval(ownerStatsTimer);
    ownerStatsTimer = null;
    $("#publicView").hidden = false;
    $("#dashboardView").hidden = true;
    $("#loginButton").textContent = "Login";
    if (location.pathname !== "/") history.replaceState({}, "", "/");
  }

  async function showDashboard(role) {
    currentRole = role;
    $("#publicView").hidden = true;
    $("#dashboardView").hidden = false;
    $("#userDashboard").hidden = role !== "user";
    $("#ownerDashboard").hidden = role !== "owner";
    $("#loginButton").textContent = "Dashboard";
    if (location.pathname !== "/dashboard") history.pushState({}, "", "/dashboard");
    if (role === "user") await loadUserDashboard();
    if (role === "owner") {
      $("#dashboardEyebrow").textContent = "OWNER CONTROL CENTER";
      $("#dashboardTitle").textContent = "Command Center";
      $("#dashboardSubtitle").textContent = "Private diagnostics for the bot owner.";
      await loadOwnerStats();
      clearInterval(ownerStatsTimer);
      ownerStatsTimer = setInterval(loadOwnerStats, 5000);
    }
  }

  async function loadStatus() {
    try {
      const data = await api("/status", { headers: {} });
      const online = data.status === "Online";
      $("#status").textContent = data.status || "Offline";
      $("#statusDot").classList.toggle("online", online);
    } catch {
      $("#status").textContent = "Offline";
      $("#statusDot").classList.remove("online");
    }
  }

  async function openWhatsApp() {
    try {
      const data = await api("/get-phone-number", { headers: {} });
      if (!data.phoneNumber) throw new Error("The bot is offline.");
      window.open(`https://wa.me/${encodeURIComponent(String(data.phoneNumber).replace(/\D/g, ""))}?text=${encodeURIComponent("Hello, I want to talk to Alexa!")}`, "_blank", "noopener");
    } catch (error) {
      alert(error.message || "Unable to retrieve the bot number.");
    }
  }

  async function loadUserDashboard() {
    try {
      const data = await api("/api/user/dashboard");
      const user = data.user;
      $("#dashboardEyebrow").textContent = "YOUR ALEXA WORKSPACE";
      $("#dashboardTitle").textContent = user.displayName || "Alexa user";
      $("#dashboardSubtitle").textContent = "Manage your private AI and the groups where you are currently an admin.";
      $("#userDisplayName").textContent = user.displayName || "Alexa user";
      $("#userLid").textContent = user.username;
      $("#privateChatbotToggle").checked = Boolean(user.privateChatbot);
      $("#gameClass").textContent = user.game.class || "Unassigned";
      $("#gameLevel").textContent = user.game.level || 1;
      $("#gamePower").textContent = user.game.power || 10;
      $("#gameCash").textContent = `${formatNumber(user.game.balance)} AC`;
      $("#gameBank").textContent = `${formatNumber(user.game.bank)} AC`;
      $("#gameItems").textContent = user.game.inventoryCount || 0;
      renderGroups(data.groups || []);
    } catch (error) {
      if (/Authentication required|Account no longer exists/.test(error.message)) return showPublicView();
      alert(error.message || "Could not load your dashboard.");
    }
  }

  function settingToggle(group, field, title, hint) {
    return `<label class="setting-toggle"><span><strong>${escapeHTML(title)}</strong><small>${escapeHTML(hint)}</small></span><input type="checkbox" data-field="${field}" ${group[field] ? "checked" : ""}></label>`;
  }

  function renderGroups(groups) {
    const grid = $("#groupGrid");
    const empty = $("#emptyGroups");
    empty.hidden = groups.length > 0;
    grid.innerHTML = groups.map((group) => {
      const encodedId = encodeURIComponent(group.group_id);
      const botLabel = group.bot_is_admin
        ? '<span class="pill success">Bot is admin</span>'
        : '<span class="pill warning">Bot is not admin</span>';
      return `<article class="group-card card glass" data-group-id="${escapeHTML(group.group_id)}">
        <header><div><h3>${escapeHTML(group.subject)}</h3><p>${formatNumber(group.member_count)} members</p></div>${botLabel}</header>
        <p class="group-id">${escapeHTML(group.group_id)}</p>
        <div class="settings-list">
          ${settingToggle(group, "chatbot", "Group AI", "Reply-to-bot assistant")}
          ${settingToggle(group, "antilink", "Anti-link", "Moderate links")}
          <label class="setting-select"><span>Link action</span><select data-field="linkAction">
            ${["delete", "warn", "remove", "false"].map((action) => `<option value="${action}" ${group.link_a === action ? "selected" : ""}>${action}</option>`).join("")}
          </select></label>
          ${settingToggle(group, "antinsfw", "Anti-NSFW", "Moderate flagged text")}
          <label class="setting-select"><span>NSFW action</span><select data-field="nsfwAction">
            ${["delete", "warn", "remove", "false"].map((action) => `<option value="${action}" ${group.nsfw_a === action ? "selected" : ""}>${action}</option>`).join("")}
          </select></label>
          ${settingToggle(group, "welcome", "Welcome", "Send welcome message")}
          ${settingToggle(group, "goodbye", "Goodbye", "Send leave message")}
        </div>
        <footer><button class="btn btn-primary save-group" data-group="${encodedId}" type="button">Save group settings</button><span class="save-state" aria-live="polite"></span></footer>
      </article>`;
    }).join("");
  }

  async function saveGroupSettings(button) {
    const card = button.closest(".group-card");
    const groupId = decodeURIComponent(button.dataset.group);
    const payload = {};
    $$('input[data-field]', card).forEach((input) => { payload[input.dataset.field] = input.checked; });
    $$('select[data-field]', card).forEach((select) => { payload[select.dataset.field] = select.value; });
    const state = $(".save-state", card);
    button.disabled = true;
    state.textContent = "Saving…";
    try {
      await api(`/api/user/groups/${encodeURIComponent(groupId)}/settings`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      state.textContent = "Saved ✓";
      setTimeout(() => { state.textContent = ""; }, 2500);
    } catch (error) {
      state.textContent = error.message || "Save failed.";
    } finally {
      button.disabled = false;
    }
  }

  async function updatePrivateChatbot(enabled) {
    const toggle = $("#privateChatbotToggle");
    toggle.disabled = true;
    try {
      await api("/api/user/private-chatbot", {
        method: "PATCH",
        body: JSON.stringify({ enabled }),
      });
    } catch (error) {
      toggle.checked = !enabled;
      alert(error.message || "Could not save preference.");
    } finally {
      toggle.disabled = false;
    }
  }

  async function loadOwnerStats() {
    if (currentRole !== "owner") return;
    try {
      const [stats, status] = await Promise.all([api("/api/owner/sysstats"), api("/status", { headers: {} })]);
      $("#ownerBotStatus").textContent = status.status || "Offline";
      $("#ownerCpu").textContent = `${Math.round(stats.cpu || 0)}%`;
      $("#ownerMemory").textContent = `${Math.round(stats.memory || 0)}%`;
      const down = ((Number(stats.downloadSpeed) || 0) * 8 / 1_000_000).toFixed(2);
      const up = ((Number(stats.uploadSpeed) || 0) * 8 / 1_000_000).toFixed(2);
      $("#ownerNetwork").textContent = `↓ ${down} / ↑ ${up} Mbps`;
    } catch (error) {
      if (/Authentication required/.test(error.message)) showPublicView();
    }
  }

  async function submitLogin(event, role) {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = $("button[type=submit]", form);
    submit.disabled = true;
    showLoginError();
    const credentials = Object.fromEntries(new FormData(form));
    try {
      const data = await api(`/api/auth/${role}-login`, {
        method: "POST",
        body: JSON.stringify(credentials),
      });
      closeLoginModal();
      form.reset();
      await showDashboard(data.role);
    } catch (error) {
      showLoginError(error.message || "Login failed.");
    } finally {
      submit.disabled = false;
    }
  }

  async function logout() {
    try { await api("/api/auth/logout", { method: "POST", body: "{}" }); } catch { /* session may already be gone */ }
    showPublicView();
  }

  async function initialise() {
    $("#loginButton").addEventListener("click", () => currentRole ? showDashboard(currentRole) : openLoginModal());
    $("#heroLoginButton").addEventListener("click", () => openLoginModal("user"));
    $("#homeButton").addEventListener("click", showPublicView);
    $("#whatsappButton").addEventListener("click", openWhatsApp);
    $("#closeLoginModal").addEventListener("click", closeLoginModal);
    loginModal.addEventListener("click", (event) => { if (event.target === loginModal) closeLoginModal(); });
    document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !loginModal.hidden) closeLoginModal(); });
    $$('[data-login-tab]').forEach((button) => button.addEventListener("click", () => selectLoginTab(button.dataset.loginTab)));
    $("#ownerLoginForm").addEventListener("submit", (event) => submitLogin(event, "owner"));
    $("#userLoginForm").addEventListener("submit", (event) => submitLogin(event, "user"));
    $("#logoutButton").addEventListener("click", logout);
    $("#privateChatbotToggle").addEventListener("change", (event) => updatePrivateChatbot(event.target.checked));
    $("#refreshDashboardButton").addEventListener("click", loadUserDashboard);
    $("#groupGrid").addEventListener("click", (event) => {
      const button = event.target.closest(".save-group");
      if (button) saveGroupSettings(button);
    });
    window.addEventListener("popstate", () => {
      if (location.pathname === "/") showPublicView();
      else if (currentRole) showDashboard(currentRole);
    });

    loadStatus();
    setInterval(loadStatus, 15_000);
    try {
      const session = await api("/api/auth/session", { headers: {} });
      if (session.authenticated) await showDashboard(session.role);
      else if (location.pathname === "/dashboard") history.replaceState({}, "", "/");
    } catch {
      showPublicView();
    }
  }

  document.addEventListener("DOMContentLoaded", initialise);
})();
