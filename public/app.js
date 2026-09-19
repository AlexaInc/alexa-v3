(() => {
  "use strict";

  const $ = (selector, parent = document) => parent.querySelector(selector);
  const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
  const RING_CIRCUMFERENCE = 2 * Math.PI * 51;
  let currentRole = null;
  let ownerStatsTimer = null;
  let logSocket = null;
  let logReconnectTimer = null;
  let activeLogTab = "index";
  const logLines = { index: [], server: [] };

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

  function formatBytes(value) {
    const bytes = Number(value);
    if (!Number.isFinite(bytes)) return "—";
    const units = ["B", "Ki", "Mi", "Gi", "Ti"];
    let size = Math.abs(bytes);
    let unit = 0;
    while (size >= 1024 && unit < units.length - 1) {
      size /= 1024;
      unit += 1;
    }
    const rendered = size >= 10 || unit === 0 ? Math.round(size) : size.toFixed(1);
    return `${bytes < 0 ? "-" : ""}${rendered}${units[unit]}`;
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

  function openLoginModal() {
    showLoginError();
    loginModal.hidden = false;
    document.body.classList.add("modal-open");
    setTimeout(() => $("#loginForm input")?.focus(), 0);
  }

  function closeLoginModal() {
    loginModal.hidden = true;
    document.body.classList.remove("modal-open");
    showLoginError();
  }

  function stopOwnerStreams() {
    clearInterval(ownerStatsTimer);
    ownerStatsTimer = null;
    clearTimeout(logReconnectTimer);
    logReconnectTimer = null;
    if (logSocket) {
      const socket = logSocket;
      logSocket = null;
      socket.onclose = null;
      socket.close();
    }
  }

  function showPublicView() {
    currentRole = null;
    stopOwnerStreams();
    $("#publicView").hidden = false;
    $("#dashboardView").hidden = true;
    $("#loginButton").textContent = "Login";
    if (location.pathname !== "/") history.replaceState({}, "", "/");
  }

  async function goHome() {
    // The brand is navigation, not logout. Keep the existing authenticated
    // session and return signed-in visitors to their dashboard.
    if (currentRole) return showDashboard(currentRole);
    return showPublicView();
  }

  async function showDashboard(role) {
    currentRole = role;
    $("#publicView").hidden = true;
    $("#dashboardView").hidden = false;
    $("#userDashboard").hidden = role !== "user";
    $("#ownerDashboard").hidden = role !== "owner";
    $("#loginButton").textContent = "Dashboard";
    if (location.pathname !== "/dashboard") history.pushState({}, "", "/dashboard");

    if (role === "user") {
      stopOwnerStreams();
      await loadUserDashboard();
      return;
    }

    $("#dashboardEyebrow").textContent = "OWNER CONTROL CENTER";
    $("#dashboardTitle").textContent = "Command Center";
    $("#dashboardSubtitle").textContent = "Live diagnostics, protected logs and complete group control.";
    await Promise.all([loadOwnerStats(), loadOwnerGroups()]);
    clearInterval(ownerStatsTimer);
    ownerStatsTimer = setInterval(loadOwnerStats, 5000);
    connectLogStream();
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

  async function openWhatsApp(message = "Hello, I want to talk to Alexa!") {
    try {
      const data = await api("/get-phone-number", { headers: {} });
      if (!data.phoneNumber) throw new Error("The bot is offline.");
      const number = String(data.phoneNumber).replace(/\D/g, "");
      window.open(`https://wa.me/${encodeURIComponent(number)}?text=${encodeURIComponent(message)}`, "_blank", "noopener");
    } catch (error) {
      alert(error.message || "Unable to retrieve the bot number.");
    }
  }

  function openProfileChat() {
    openWhatsApp(".profile");
  }

  async function requestGroupRefresh(scope) {
    const button = $(scope === "owner" ? "#refreshOwnerDashboardButton" : "#refreshDashboardButton");
    const originalLabel = button.textContent;
    button.disabled = true;
    button.textContent = "Syncing WhatsApp…";
    try {
      await api("/api/groups/refresh", { method: "POST", body: "{}" });
      // The bot fetches WhatsApp metadata asynchronously; keep the refresh
      // state visible long enough for the fresh directory snapshot to arrive.
      await new Promise((resolve) => setTimeout(resolve, 3000));
      if (scope === "owner") await Promise.all([loadOwnerGroups(), loadOwnerStats()]);
      else await loadUserDashboard();
    } catch (error) {
      alert(error.message || "Could not request a WhatsApp group refresh.");
    } finally {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  }

  async function loadUserDashboard() {
    try {
      const data = await api("/api/user/dashboard");
      const user = data.user;
      $("#dashboardEyebrow").textContent = "YOUR ALEXA WORKSPACE";
      $("#dashboardTitle").textContent = user.displayName || "Alexa user";
      $("#dashboardSubtitle").textContent = "Manage your private AI and groups where both you and Alexa are admins.";
      $("#userDisplayName").textContent = user.displayName || "Alexa user";
      $("#userLid").textContent = user.username;
      $("#privateChatbotToggle").checked = Boolean(user.privateChatbot);
      $("#gameClass").textContent = user.game.class || "Unassigned";
      $("#gameLevel").textContent = user.game.level || 1;
      $("#gamePower").textContent = user.game.power || 10;
      $("#gameCash").textContent = `${formatNumber(user.game.balance)} AC`;
      $("#gameBank").textContent = `${formatNumber(user.game.bank)} AC`;
      $("#gameItems").textContent = user.game.inventoryCount || 0;
      renderGroups(data.groups || [], "user");
    } catch (error) {
      if (/Authentication required|Account no longer exists/.test(error.message)) return showPublicView();
      alert(error.message || "Could not load your dashboard.");
    }
  }

  function settingToggle(group, field, title, hint) {
    return `<label class="setting-toggle"><span><strong>${escapeHTML(title)}</strong><small>${escapeHTML(hint)}</small></span><input type="checkbox" data-field="${field}" ${group[field] ? "checked" : ""}></label>`;
  }

  function renderGroups(groups, scope) {
    const owner = scope === "owner";
    const grid = $(owner ? "#ownerGroupGrid" : "#groupGrid");
    const empty = $(owner ? "#ownerEmptyGroups" : "#emptyGroups");
    empty.hidden = groups.length > 0;
    grid.innerHTML = groups.map((group) => {
      const encodedId = encodeURIComponent(group.group_id);
      const botLabel = group.bot_is_admin
        ? '<span class="pill success">Bot is admin</span>'
        : '<span class="pill warning">Bot is not admin</span>';
      return `<article class="group-card card glass" data-group-id="${escapeHTML(group.group_id)}" data-scope="${scope}">
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
    const scope = card.dataset.scope === "owner" ? "owner" : "user";
    const payload = {};
    $$("input[data-field]", card).forEach((input) => { payload[input.dataset.field] = input.checked; });
    $$("select[data-field]", card).forEach((select) => { payload[select.dataset.field] = select.value; });
    const state = $(".save-state", card);
    button.disabled = true;
    state.textContent = "Saving…";
    try {
      await api(`/api/${scope}/groups/${encodeURIComponent(groupId)}/settings`, {
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

  function setRing(selector, percentage) {
    const element = $(selector);
    const percent = Math.max(0, Math.min(100, Number(percentage) || 0));
    element.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - percent / 100));
  }

  async function loadOwnerStats() {
    if (currentRole !== "owner") return;
    try {
      const [stats, status] = await Promise.all([api("/api/owner/sysstats"), api("/status", { headers: {} })]);
      const online = status.status === "Online";
      $("#ownerBotStatus").textContent = online ? "Bot online" : "Bot offline";
      $("#ownerLiveIndicator").classList.toggle("online", online);

      const cpu = Math.round(stats.cpu || 0);
      const memory = Math.round(stats.memory || 0);
      const downMbps = ((Number(stats.downloadSpeed) || 0) * 8 / 1_000_000);
      const upMbps = ((Number(stats.uploadSpeed) || 0) * 8 / 1_000_000);
      $("#ownerCpu").textContent = `${cpu}%`;
      $("#ownerMemory").textContent = `${memory}%`;
      $("#ownerDownload").textContent = `${downMbps.toFixed(2)} Mbps`;
      $("#ownerUpload").textContent = `${upMbps.toFixed(2)} Mbps`;
      $("#ownerMemoryDetail").textContent = stats.mem?.total
        ? `${formatBytes(stats.mem.used)} / ${formatBytes(stats.mem.total)}`
        : "Live system usage";
      setRing("#ownerCpuGauge", cpu);
      setRing("#ownerMemoryGauge", memory);
      // Network has no fixed maximum. The ring uses a calm 10 Mbps reference
      // while the centre always displays the exact current throughput.
      setRing("#ownerDownloadGauge", Math.min(100, downMbps * 10));
      setRing("#ownerUploadGauge", Math.min(100, upMbps * 10));
    } catch (error) {
      if (/Authentication required/.test(error.message)) showPublicView();
    }
  }

  async function loadOwnerGroups() {
    if (currentRole !== "owner") return;
    try {
      const data = await api("/api/owner/groups");
      renderGroups(data.groups || [], "owner");
    } catch (error) {
      if (/Authentication required/.test(error.message)) return showPublicView();
      alert(error.message || "Could not load owner group controls.");
    }
  }

  function updateLogConnection(text, connected = false) {
    const label = $("#logConnection");
    label.textContent = text;
    label.classList.toggle("connected", connected);
  }

  function renderLogs() {
    const area = $("#ownerLogArea");
    const nearBottom = area.scrollHeight - area.scrollTop - area.clientHeight < 40;
    const lines = logLines[activeLogTab];
    area.textContent = lines.length ? lines.join("\n") : "No log lines have been written yet.";
    if (nearBottom) area.scrollTop = area.scrollHeight;
  }

  function selectLogTab(type) {
    activeLogTab = type;
    $$("[data-log-tab]").forEach((button) => {
      const selected = button.dataset.logTab === type;
      button.classList.toggle("active", selected);
      button.setAttribute("aria-selected", String(selected));
    });
    renderLogs();
  }

  function connectLogStream() {
    if (currentRole !== "owner" || logSocket?.readyState === WebSocket.OPEN || logSocket?.readyState === WebSocket.CONNECTING) return;
    updateLogConnection("Connecting…");
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${location.host}/logs`);
    logSocket = socket;
    socket.onopen = () => updateLogConnection("Live stream", true);
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (!Array.isArray(data.logs) || !Object.prototype.hasOwnProperty.call(logLines, data.type)) return;
        logLines[data.type] = data.logs.map((line) => String(line));
        if (data.type === activeLogTab) renderLogs();
      } catch { /* Ignore a malformed log frame without breaking the dashboard. */ }
    };
    socket.onerror = () => updateLogConnection("Stream unavailable");
    socket.onclose = () => {
      if (logSocket === socket) logSocket = null;
      if (currentRole !== "owner") return;
      updateLogConnection("Reconnecting…");
      clearTimeout(logReconnectTimer);
      logReconnectTimer = setTimeout(connectLogStream, 3000);
    };
  }

  async function submitLogin(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = $("button[type=submit]", form);
    submit.disabled = true;
    showLoginError();
    const credentials = Object.fromEntries(new FormData(form));
    try {
      const data = await api("/api/auth/user-login", {
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
    try { await api("/api/auth/logout", { method: "POST", body: "{}" }); } catch { /* Session may already be gone. */ }
    showPublicView();
  }

  async function initialise() {
    $("#loginButton").addEventListener("click", () => currentRole ? showDashboard(currentRole) : openLoginModal());
    $("#heroLoginButton").addEventListener("click", openLoginModal);
    $("#homeButton").addEventListener("click", goHome);
    $("#whatsappButton").addEventListener("click", () => openWhatsApp());
    $("#profileChatButton").addEventListener("click", openProfileChat);
    $("#loginProfileChatButton").addEventListener("click", openProfileChat);
    $("#closeLoginModal").addEventListener("click", closeLoginModal);
    loginModal.addEventListener("click", (event) => { if (event.target === loginModal) closeLoginModal(); });
    document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !loginModal.hidden) closeLoginModal(); });
    $("#loginForm").addEventListener("submit", submitLogin);
    $("#logoutButton").addEventListener("click", logout);
    $("#privateChatbotToggle").addEventListener("change", (event) => updatePrivateChatbot(event.target.checked));
    $("#refreshDashboardButton").addEventListener("click", () => requestGroupRefresh("user"));
    $("#refreshOwnerDashboardButton").addEventListener("click", () => requestGroupRefresh("owner"));
    $("#groupGrid").addEventListener("click", (event) => {
      const button = event.target.closest(".save-group");
      if (button) saveGroupSettings(button);
    });
    $("#ownerGroupGrid").addEventListener("click", (event) => {
      const button = event.target.closest(".save-group");
      if (button) saveGroupSettings(button);
    });
    $$("[data-log-tab]").forEach((button) => button.addEventListener("click", () => selectLogTab(button.dataset.logTab)));
    window.addEventListener("popstate", () => {
      if (location.pathname === "/") goHome();
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
