(() => {
  "use strict";

  const $ = (selector, parent = document) => parent.querySelector(selector);
  const $$ = (selector, parent = document) => [
    ...parent.querySelectorAll(selector),
  ];
  const RING_CIRCUMFERENCE = 2 * Math.PI * 51;
  let currentRole = null;
  let activeGroup = null;
  // This one-time token is issued inside the authenticated server session.
  // Every state-changing request consumes it and receives a replacement.
  let csrfToken = null;
  let publicStatusTimer = null;
  let logSocket = null;
  let logReconnectTimer = null;
  let activeLogTab = "index";
  let managedGroups = [];
  let supportedLocales = [];
  const logLines = { index: [], server: [] };

  const loginModal = $("#loginModal");
  const loginError = $("#loginError");

  function escapeHTML(value) {
    return String(value ?? "").replace(
      /[&<>'"]/g,
      (character) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          "'": "&#39;",
          '"': "&quot;",
        })[character],
    );
  }

  function formatNumber(value) {
    return Number(value || 0).toLocaleString();
  }

  function applyDashboardLocale(locale) {
    const messages =
      window.AlexaLocales?.[locale] || window.AlexaLocales?.en || {};
    $$("[data-i18n]").forEach((element) => {
      if (messages[element.dataset.i18n])
        element.textContent = messages[element.dataset.i18n];
    });
    document.documentElement.lang = locale || "en";
    localStorage.setItem("alexa-dashboard-locale", locale || "en");
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
    const rendered =
      size >= 10 || unit === 0 ? Math.round(size) : size.toFixed(1);
    return `${bytes < 0 ? "-" : ""}${rendered}${units[unit]}`;
  }

  async function api(url, options = {}) {
    const method = String(options.method || "GET").toUpperCase();
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    };
    if (!["GET", "HEAD", "OPTIONS"].includes(method) && csrfToken) {
      headers["X-CSRF-Token"] = csrfToken;
    }
    const response = await fetch(url, { ...options, method, headers });
    const data = await response.json().catch(() => ({}));
    const nextToken = response.headers.get("X-CSRF-Token");
    if (nextToken) csrfToken = nextToken;
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
    clearTimeout(logReconnectTimer);
    logReconnectTimer = null;
    if (logSocket) {
      const socket = logSocket;
      logSocket = null;
      socket.onclose = null;
      socket.close();
    }
  }

  function stopPublicStatusPolling() {
    clearInterval(publicStatusTimer);
    publicStatusTimer = null;
  }

  function startPublicStatusPolling() {
    if (publicStatusTimer) return;
    void loadStatus();
    publicStatusTimer = setInterval(loadStatus, 15_000);
  }

  // Going back to the public site is navigation only. The browser session,
  // role and CSRF token stay intact until the explicit Logout action is used.
  function showPublicView({
    preserveSession = false,
    replaceRoute = true,
  } = {}) {
    const retainedRole = preserveSession ? currentRole : null;
    stopOwnerStreams();
    activeGroup = null;
    currentRole = retainedRole;
    $("#groupDetailView").hidden = true;
    $("#publicView").hidden = false;
    $("#dashboardView").hidden = true;
    $("#loginButton").textContent = retainedRole ? "Dashboard" : "Login";
    if (
      replaceRoute &&
      (location.pathname !== "/" || location.search || location.hash)
    ) {
      history.replaceState({}, "", "/");
    }
    startPublicStatusPolling();
  }

  function showPublicSection(section) {
    showPublicView({ preserveSession: Boolean(currentRole) });
    history.pushState({}, "", `/#${encodeURIComponent(section)}`);
    requestAnimationFrame(() =>
      $("#" + section)?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }

  function goHome() {
    showPublicView({ preserveSession: Boolean(currentRole) });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function showDashboard(role) {
    currentRole = role;
    stopPublicStatusPolling();
    activeGroup = null;
    $("#groupDetailView").hidden = true;
    $("#publicView").hidden = true;
    $("#dashboardView").hidden = false;
    selectDashboardTab("overview");
    $("#userDashboard").hidden = role !== "user";
    $("#ownerDashboard").hidden = role !== "owner";
    $("#loginButton").textContent = "Dashboard";
    const openingSavedGroupRoute =
      location.pathname.startsWith("/dashboard/group/");
    if (!openingSavedGroupRoute && location.pathname !== "/dashboard") {
      history.pushState({}, "", "/dashboard");
    }

    if (role === "user") {
      stopOwnerStreams();
      await loadUserDashboard();
      return;
    }

    $("#dashboardEyebrow").textContent = "OWNER CONTROL CENTER";
    $("#dashboardTitle").textContent = "Command Center";
    $("#dashboardSubtitle").textContent =
      "Live diagnostics, protected logs and complete group control.";
    // Sysstats and bot state arrive through the authenticated /logs WebSocket.
    // No owner REST polling is started here.
    await Promise.all([loadOwnerAccount(), loadOwnerGroups()]);
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
      window.open(
        `https://wa.me/${encodeURIComponent(number)}?text=${encodeURIComponent(message)}`,
        "_blank",
        "noopener",
      );
    } catch (error) {
      alert(error.message || "Unable to retrieve the bot number.");
    }
  }

  function openProfileChat() {
    openWhatsApp(".profile");
  }

  async function requestGroupRefresh(scope) {
    const button = $(
      scope === "owner"
        ? "#refreshOwnerDashboardButton"
        : "#refreshDashboardButton",
    );
    const originalLabel = button.textContent;
    button.disabled = true;
    button.textContent = "Syncing WhatsApp…";
    try {
      await api("/api/groups/refresh", { method: "POST", body: "{}" });
      // The bot fetches WhatsApp metadata asynchronously; keep the refresh
      // state visible long enough for the fresh directory snapshot to arrive.
      await new Promise((resolve) => setTimeout(resolve, 3000));
      if (scope === "owner") await loadOwnerGroups();
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
      $("#dashboardSubtitle").textContent =
        "Manage your private AI and groups where both you and Alexa are admins.";
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
      if (
        /Authentication required|Account no longer exists/.test(error.message)
      )
        return showPublicView();
      alert(error.message || "Could not load your dashboard.");
    }
  }

  async function loadOwnerAccount() {
    if (currentRole !== "owner") return;
    try {
      const data = await api("/api/account/dashboard");
      const user = data.user;
      $("#ownerDisplayName").textContent = user.displayName || "Alexa owner";
      $("#ownerLid").textContent = user.username;
      $("#ownerPrivateChatbotToggle").checked = Boolean(user.privateChatbot);
      $("#ownerGameClass").textContent = user.game.class || "Unassigned";
      $("#ownerGameLevel").textContent = user.game.level || 1;
      $("#ownerGamePower").textContent = user.game.power || 10;
      $("#ownerGameCash").textContent = `${formatNumber(user.game.balance)} AC`;
      $("#ownerGameBank").textContent = `${formatNumber(user.game.bank)} AC`;
      $("#ownerGameItems").textContent = user.game.inventoryCount || 0;
    } catch (error) {
      if (
        /Authentication required|Account no longer exists/.test(error.message)
      )
        return showPublicView();
      alert(error.message || "Could not load the owner account profile.");
    }
  }

  function renderGroups(groups, scope) {
    managedGroups = groups;
    refreshPlatformGroupOptions();
    const owner = scope === "owner";
    const grid = $(owner ? "#ownerGroupGrid" : "#groupGrid");
    const empty = $(owner ? "#ownerEmptyGroups" : "#emptyGroups");
    empty.hidden = groups.length > 0;
    grid.innerHTML = groups
      .map((group) => {
        const encodedId = encodeURIComponent(group.group_id);
        const botLabel = group.bot_is_admin
          ? '<span class="pill success">Bot is admin</span>'
          : '<span class="pill warning">Bot is not admin</span>';
        return `<article class="group-card group-list-card card glass" data-group-id="${escapeHTML(group.group_id)}" data-scope="${scope}">
        <header><div><h3>${escapeHTML(group.subject)}</h3><p>${formatNumber(group.member_count)} members</p></div>${botLabel}</header>
        <p class="group-id">${escapeHTML(group.group_id)}</p>
        <footer><button class="btn btn-primary open-group" data-group="${encodedId}" type="button">Manage settings <span aria-hidden="true">→</span></button></footer>
      </article>`;
      })
      .join("");
  }

  function refreshPlatformGroupOptions() {
    const options = managedGroups
      .map(
        (group) =>
          `<option value="${escapeHTML(group.group_id)}">${escapeHTML(group.subject)}</option>`,
      )
      .join("");
    ["#analyticsGroup", "#automationGroup", "#localeGroup"].forEach(
      (selector) => {
        const select = $(selector);
        if (!select) return;
        const previous = select.value;
        select.innerHTML = options;
        if ([...select.options].some((option) => option.value === previous))
          select.value = previous;
      },
    );
  }

  function selectDashboardTab(tab) {
    const overview = tab === "overview";
    $("#userDashboard").hidden = !overview || currentRole !== "user";
    $("#ownerDashboard").hidden = !overview || currentRole !== "owner";
    $("#groupDetailView").hidden = true;
    $("#analyticsDashboard").hidden = tab !== "analytics";
    $("#automationsDashboard").hidden = tab !== "automations";
    $("#localeDashboard").hidden = tab !== "locale";
    $$("[data-dashboard-tab]").forEach((button) =>
      button.classList.toggle("is-active", button.dataset.dashboardTab === tab),
    );
    if (tab === "analytics") void loadAnalytics();
    if (tab === "automations") void loadAutomations();
    if (tab === "locale") void loadLocalePreferences();
  }

  function analyticsDates(days) {
    const dates = [];
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    for (let offset = days - 1; offset >= 0; offset -= 1) {
      const date = new Date(today);
      date.setUTCDate(date.getUTCDate() - offset);
      dates.push(date.toISOString().slice(0, 10));
    }
    return dates;
  }

  function dateLabel(date) {
    return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
  }

  function chartSeries(rows, dates, requestedTypes = null) {
    const types = requestedTypes || [
      ...new Set(rows.map((row) => row.type || "total")),
    ];
    const values = new Map();
    rows.forEach((row) =>
      values.set(
        `${String(row.day).slice(0, 10)}:${row.type || "total"}`,
        Number(row.total || 0),
      ),
    );
    return types.map((type, index) => ({
      label: type.replaceAll("_", " "),
      color:
        window.AlexaCharts.palette[index % window.AlexaCharts.palette.length],
      values: dates.map((date) => values.get(`${date}:${type}`) || 0),
    }));
  }

  function renderLegend(target, series) {
    $(target).innerHTML = series
      .map(
        (item) =>
          `<span class="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold text-white" style="background:${item.color}"><i class="h-2 w-2 rounded-full bg-white/80"></i>${escapeHTML(item.label)}</span>`,
      )
      .join("");
  }

  function analyticsPersonRow(person, detail) {
    const identity =
      person.display_name ||
      String(person.user_id || person.admin_id || "Unknown").split("@")[0];
    const initial = identity.trim().charAt(0).toUpperCase() || "?";
    return `<div class="flex items-center gap-3 border-b border-slate-800/80 py-3 last:border-0"><span class="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-blue-500 to-violet-500 font-bold text-white">${escapeHTML(initial)}</span><div class="min-w-0"><strong class="block truncate text-sm text-white">${escapeHTML(identity)}</strong><span class="text-xs text-slate-500">${escapeHTML(detail)}</span></div></div>`;
  }

  async function loadAnalytics() {
    const groupId = $("#analyticsGroup").value;
    if (!groupId) return;
    try {
      const days = Number($("#analyticsDays").value || 30);
      const data = await api(
        `/api/analytics/group?days=${encodeURIComponent(days)}&groupId=${encodeURIComponent(groupId)}`,
      );
      const dates = analyticsDates(data.days);
      const labels = dates.map(dateLabel);
      $("#analyticsRange").textContent = `${labels[0]} — ${labels.at(-1)}`;
      $("#analyticsMembers").textContent = formatNumber(data.overview?.members);
      $("#analyticsTotal").textContent = formatNumber(data.overview?.messages);
      $("#analyticsUsers").textContent = formatNumber(
        data.overview?.active_members,
      );
      $("#analyticsCharacters").textContent = formatNumber(
        data.overview?.characters,
      );

      const messageSeries = chartSeries(
        (data.series.messages || []).map((row) => ({
          ...row,
          type: "messages",
        })),
        dates,
        ["messages"],
      );
      const growthByDate = new Map(
        (data.series.growth || []).map((row) => [
          String(row.day).slice(0, 10),
          Number(row.total || 0),
        ]),
      );
      let memberCount =
        growthByDate.get(dates[0]) ||
        Number(data.series.growth?.[0]?.total || data.overview?.members || 0);
      const growthSeries = [
        {
          label: "members",
          color: window.AlexaCharts.palette[0],
          values: dates.map((date) => {
            if (growthByDate.has(date)) memberCount = growthByDate.get(date);
            return memberCount;
          }),
        },
      ];
      const memberSeries = chartSeries(data.series.memberEvents || [], dates, [
        "joined",
        "invited",
        "left",
        "removed",
      ]);
      const typeSeries = chartSeries(data.series.messageTypes || [], dates, [
        "text",
        "sticker",
        "photo",
        "video",
        "voice",
        "audio",
        "file",
        "contact",
        "location",
        "poll",
        "legacy",
        "other",
      ]);
      const moderationSeries = chartSeries(
        data.series.moderation || [],
        dates,
        [
          "message_deleted",
          "message_edited",
          "warn",
          "warn_removed",
          "member_removed",
          "member_promoted",
          "member_demoted",
          "group_muted",
          "group_unmuted",
        ],
      );
      const hourlyMap = new Map(
        (data.series.hourly || []).map((row) => [
          Number(row.hour),
          Number(row.total),
        ]),
      );
      const hourlyLabels = Array.from(
        { length: 24 },
        (_, hour) => `${String(hour).padStart(2, "0")}:00`,
      );
      const hourlySeries = [
        {
          label: "messages",
          color: window.AlexaCharts.palette[5],
          values: hourlyLabels.map((_, hour) => hourlyMap.get(hour) || 0),
        },
      ];
      const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const weekdayMap = new Map(
        (data.series.weekdays || []).map((row) => [
          Number(row.weekday) - 1,
          Number(row.total),
        ]),
      );
      const weekdaySeries = [
        {
          label: "messages",
          color: window.AlexaCharts.palette[6],
          values: weekdayLabels.map((_, day) => weekdayMap.get(day) || 0),
        },
      ];
      window.AlexaCharts.render($("#messageChart"), "line", {
        labels,
        series: messageSeries,
      });
      window.AlexaCharts.render($("#growthChart"), "line", {
        labels,
        series: growthSeries,
      });
      window.AlexaCharts.render($("#memberEventsChart"), "line", {
        labels,
        series: memberSeries,
      });
      window.AlexaCharts.render($("#messageTypesChart"), "bars", {
        labels,
        series: typeSeries,
      });
      window.AlexaCharts.render($("#moderationChart"), "line", {
        labels,
        series: moderationSeries,
      });
      window.AlexaCharts.render($("#hourlyChart"), "line", {
        labels: hourlyLabels,
        series: hourlySeries,
      });
      window.AlexaCharts.render($("#weekdayChart"), "bars", {
        labels: weekdayLabels,
        series: weekdaySeries,
      });
      renderLegend("#memberLegend", memberSeries);
      renderLegend("#messageTypeLegend", typeSeries);
      renderLegend("#moderationLegend", moderationSeries);

      $("#topMembers").innerHTML = data.topMembers?.length
        ? data.topMembers
            .map((person) =>
              analyticsPersonRow(
                person,
                `${formatNumber(person.total_messages)} messages, ${formatNumber(person.average_characters)} characters per message`,
              ),
            )
            .join("")
        : '<p class="text-slate-400">No member data yet.</p>';
      $("#topAdmins").innerHTML = data.topAdmins?.length
        ? data.topAdmins
            .map((person) =>
              analyticsPersonRow(
                person,
                `${formatNumber(person.actions)} actions · ${formatNumber(person.deletions)} deletions · ${formatNumber(person.removals)} removals · ${formatNumber(person.warnings)} warnings`,
              ),
            )
            .join("")
        : '<p class="text-slate-400">No moderation data yet.</p>';
      $("#memberSources").innerHTML = data.sources?.length
        ? data.sources
            .map(
              (source) =>
                `<span class="rounded-full bg-blue-500 px-3 py-2 text-xs font-bold text-white">✓ ${escapeHTML(String(source.source).replaceAll("_", " "))} · ${formatNumber(source.total)}</span>`,
            )
            .join("")
        : '<p class="text-slate-400">No member-source data yet.</p>';
    } catch (error) {
      $("#topMembers").innerHTML =
        `<p class="text-rose-300">${escapeHTML(error.message)}</p>`;
    }
  }

  async function loadAutomations() {
    try {
      const data = await api("/api/automations");
      $("#automationList").innerHTML = data.jobs.length
        ? data.jobs
            .map(
              (job) =>
                `<article class="flex flex-col gap-3 rounded-xl border border-slate-700 bg-slate-950/50 p-4 sm:flex-row sm:items-center sm:justify-between"><div><strong class="block text-white">${escapeHTML(job.name)}</strong><span class="block text-sm text-slate-400">${escapeHTML(job.schedule_type)} · ${escapeHTML(new Date(job.next_run_at).toLocaleString())}</span><small class="text-slate-500">${escapeHTML(job.group_id)}</small></div><button class="dashboard-tab automation-delete" data-job-id="${escapeHTML(job.id)}" type="button">Delete</button></article>`,
            )
            .join("")
        : '<p class="text-slate-400">No scheduled messages yet.</p>';
    } catch (error) {
      $("#automationList").innerHTML =
        `<p class="text-rose-300">${escapeHTML(error.message)}</p>`;
    }
  }

  async function loadLocalePreferences() {
    try {
      const data = await api("/api/account/preferences");
      supportedLocales = data.locales;
      const options = supportedLocales
        .map(
          (locale) =>
            `<option value="${locale.code}">${escapeHTML(locale.name)} (${locale.code})</option>`,
        )
        .join("");
      $("#accountLocale").innerHTML = options;
      $("#groupLocale").innerHTML = options;
      $("#accountLocale").value = data.locale;
      $("#accountTimezone").value = data.timezone;
      applyDashboardLocale(data.locale);
      const group =
        managedGroups.find(
          (item) => item.group_id === $("#localeGroup").value,
        ) || managedGroups[0];
      if (group) {
        $("#groupLocale").value = group.locale || "en";
        $("#groupTimezone").value = group.timezone || "Asia/Colombo";
      }
    } catch (error) {
      $("#accountLocaleFeedback").textContent = error.message;
    }
  }

  function setDetailBotBadge(isBotAdmin) {
    const badge = $("#detailBotAdmin");
    badge.textContent = isBotAdmin ? "Bot is admin" : "Bot is not admin";
    badge.className = `pill ${isBotAdmin ? "success" : "warning"}`;
  }

  function populateGroupDetail(group) {
    $("#detailGroupName").textContent = group.subject || "Unnamed group";
    $("#detailGroupId").textContent = group.group_id;
    setDetailBotBadge(Boolean(group.bot_is_admin));
    $("#detailChatbot").checked = Boolean(group.chatbot);
    $("#detailAllowBots").checked = Boolean(group.is_allow_bots);
    $("#detailAntilink").checked = Boolean(group.antilink);
    $("#detailLinkAction").value = group.link_a || "delete";
    $("#detailAntinsfw").checked = Boolean(group.antinsfw);
    $("#detailNsfwAction").value = group.nsfw_a || "delete";
    $("#detailWelcome").checked = Boolean(group.is_welcome);
    $("#detailWelcomeMessage").value = group.wc_m || "";
    $("#detailGoodbye").checked = Boolean(group.isleft_w);
    $("#detailGoodbyeMessage").value = group.left_m || "";
    $("#detailSaveState").textContent = "";
  }

  async function openGroupSettings(
    groupId,
    scope,
    { updateHistory = true } = {},
  ) {
    try {
      const data = await api(
        `/api/${scope}/groups/${encodeURIComponent(groupId)}`,
      );
      activeGroup = { id: data.group.group_id, scope };
      populateGroupDetail(data.group);
      $("#userDashboard").hidden = true;
      $("#ownerDashboard").hidden = true;
      $("#groupDetailView").hidden = false;
      if (updateHistory) {
        history.pushState(
          {},
          "",
          `/dashboard/group/${encodeURIComponent(activeGroup.id)}`,
        );
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      if (/Authentication required/.test(error.message))
        return showPublicView();
      alert(error.message || "Could not open this group’s settings.");
    }
  }

  async function returnToGroupList() {
    if (!currentRole) return showPublicView();
    history.pushState({}, "", "/dashboard");
    await showDashboard(currentRole);
  }

  async function saveGroupDetail(event) {
    event.preventDefault();
    if (!activeGroup) return;
    const button = $("#saveGroupDetailButton");
    const state = $("#detailSaveState");
    const payload = {};
    $$("[data-field]", $("#groupSettingsForm")).forEach((field) => {
      payload[field.dataset.field] =
        field.type === "checkbox" ? field.checked : field.value;
    });
    button.disabled = true;
    state.textContent = "Saving…";
    try {
      await api(
        `/api/${activeGroup.scope}/groups/${encodeURIComponent(activeGroup.id)}/settings`,
        {
          method: "PATCH",
          body: JSON.stringify(payload),
        },
      );
      state.textContent = "Saved securely ✓";
      setTimeout(() => {
        if (state.textContent === "Saved securely ✓") state.textContent = "";
      }, 2500);
    } catch (error) {
      state.textContent = error.message || "Save failed.";
    } finally {
      button.disabled = false;
    }
  }

  async function updatePrivateChatbot(enabled, toggle) {
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
    element.style.strokeDashoffset = String(
      RING_CIRCUMFERENCE * (1 - percent / 100),
    );
  }

  function setRingSegment(selector, startPercent, lengthPercent) {
    const element = $(selector);
    const start = Math.max(0, Math.min(100, Number(startPercent) || 0));
    const length = Math.max(
      0,
      Math.min(100 - start, Number(lengthPercent) || 0),
    );
    const startLength = (start / 100) * RING_CIRCUMFERENCE;
    const segmentLength = (length / 100) * RING_CIRCUMFERENCE;
    element.style.strokeDasharray = `0 ${startLength} ${segmentLength} ${RING_CIRCUMFERENCE}`;
    element.style.strokeDashoffset = "0";
  }

  function renderOwnerMemory(mem, legacyPercent) {
    const usedPercent = Number(mem?.usedPercent ?? legacyPercent) || 0;
    const cachePercent = Number(mem?.cachePercent) || 0;
    $("#ownerMemory").textContent = `${Math.round(usedPercent)}%`;
    setRing("#ownerMemoryGauge", usedPercent);
    setRingSegment("#ownerMemoryCacheGauge", usedPercent, cachePercent);

    if (!mem) {
      $("#ownerMemorySummary").textContent = "Live system usage";
      return;
    }

    $("#ownerMemorySummary").textContent =
      `${formatBytes(mem.used)} / ${formatBytes(mem.total)}`;
    $("#ownerMemoryUsed").textContent =
      `${formatBytes(mem.used)} (${Math.round(usedPercent)}%)`;
    $("#ownerMemoryCache").textContent =
      `${formatBytes(mem.buffcache?.total)} (${Math.round(cachePercent)}%)`;
    $("#ownerMemoryFree").textContent = formatBytes(mem.free);
    $("#ownerMemoryAvailable").textContent =
      `${formatBytes(mem.available)} (${Math.round(Number(mem.availablePercent) || 0)}%)`;

    const pressureTick = $("#ownerMemoryPressureTick");
    const pressure = Number(mem.pressurePercent) || 0;
    pressureTick.hidden = pressure <= 0.5;
    if (!pressureTick.hidden)
      pressureTick.setAttribute(
        "transform",
        `rotate(${(pressure / 100) * 360} 60 60)`,
      );

    $("#ownerMemoryScopeBadge").hidden = !mem.limited;
    const swap = mem.swap || {};
    $("#ownerMemorySwapRow").hidden = !(Number(swap.total) > 0);
    $("#ownerMemorySwap").textContent =
      `${formatBytes(swap.used)} / ${formatBytes(swap.total)}`;

    const processBox = $("#ownerMemoryProcesses");
    const processes = Array.isArray(mem.processes) ? mem.processes : [];
    processBox.replaceChildren();
    processBox.hidden = !processes.length;
    for (const processInfo of processes) {
      const row = document.createElement("div");
      const label = document.createElement("span");
      const value = document.createElement("strong");
      label.textContent = processInfo.label || "node";
      const cap = processInfo.heapCap
        ? ` / ${formatBytes(processInfo.heapCap)} cap`
        : "";
      value.textContent = `${formatBytes(processInfo.rss)}${cap}`;
      row.append(label, value);
      processBox.append(row);
    }
    $("#ownerMemoryNote").textContent = mem.limited
      ? "Container limit shown (cgroup). Buff/cache is reclaimable."
      : "Buff/cache is reclaimable — Linux uses spare RAM to speed up files.";
  }

  function renderOwnerTelemetry(stats, status) {
    if (currentRole !== "owner") return;
    const online = status === "Online";
    $("#ownerBotStatus").textContent = online ? "Bot online" : "Bot offline";
    $("#ownerLiveIndicator").classList.toggle("online", online);

    const cpu = Math.round(stats.cpu || 0);
    const downMbps = ((Number(stats.downloadSpeed) || 0) * 8) / 1_000_000;
    const upMbps = ((Number(stats.uploadSpeed) || 0) * 8) / 1_000_000;
    $("#ownerCpu").textContent = `${cpu}%`;
    $("#ownerDownload").textContent = `${downMbps.toFixed(2)} Mbps`;
    $("#ownerUpload").textContent = `${upMbps.toFixed(2)} Mbps`;
    setRing("#ownerCpuGauge", cpu);
    renderOwnerMemory(stats.mem, stats.memory);
    // Network has no fixed maximum. The ring uses a calm 10 Mbps reference
    // while the centre always displays the exact current throughput.
    setRing("#ownerDownloadGauge", Math.min(100, downMbps * 10));
    setRing("#ownerUploadGauge", Math.min(100, upMbps * 10));
  }

  async function loadOwnerGroups() {
    if (currentRole !== "owner") return;
    try {
      const data = await api("/api/owner/groups");
      renderGroups(data.groups || [], "owner");
    } catch (error) {
      if (/Authentication required/.test(error.message))
        return showPublicView();
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
    const nearBottom =
      area.scrollHeight - area.scrollTop - area.clientHeight < 40;
    const lines = logLines[activeLogTab];
    area.textContent = lines.length
      ? lines.join("\n")
      : "No log lines have been written yet.";
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
    if (
      currentRole !== "owner" ||
      logSocket?.readyState === WebSocket.OPEN ||
      logSocket?.readyState === WebSocket.CONNECTING
    )
      return;
    updateLogConnection("Connecting…");
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${location.host}/logs`);
    logSocket = socket;
    socket.onopen = () => updateLogConnection("Live stream", true);
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "telemetry" && data.stats) {
          renderOwnerTelemetry(data.stats, data.status);
          return;
        }
        if (
          !Array.isArray(data.logs) ||
          !Object.prototype.hasOwnProperty.call(logLines, data.type)
        )
          return;
        logLines[data.type] = data.logs.map((line) => String(line));
        if (data.type === activeLogTab) renderLogs();
      } catch {
        /* Ignore a malformed stream frame without breaking the dashboard. */
      }
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
      csrfToken = data.csrfToken || csrfToken;
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
    try {
      await api("/api/auth/logout", { method: "POST", body: "{}" });
    } catch {
      /* Session may already be gone. */
    }
    csrfToken = null;
    showPublicView();
  }

  async function initialise() {
    applyDashboardLocale(
      localStorage.getItem("alexa-dashboard-locale") || "en",
    );
    $("#loginButton").addEventListener("click", () =>
      currentRole ? showDashboard(currentRole) : openLoginModal(),
    );
    $("#heroLoginButton").addEventListener("click", openLoginModal);
    $("#homeButton").addEventListener("click", goHome);
    $("#featuresNavButton").addEventListener("click", (event) => {
      event.preventDefault();
      showPublicSection("features");
    });
    $("#deployNavButton").addEventListener("click", (event) => {
      event.preventDefault();
      showPublicSection("deploy");
    });
    $("#whatsappButton").addEventListener("click", () => openWhatsApp());
    $("#profileChatButton").addEventListener("click", openProfileChat);
    $("#ownerProfileChatButton").addEventListener("click", openProfileChat);
    $("#loginProfileChatButton").addEventListener("click", openProfileChat);
    $("#closeLoginModal").addEventListener("click", closeLoginModal);
    loginModal.addEventListener("click", (event) => {
      if (event.target === loginModal) closeLoginModal();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !loginModal.hidden) closeLoginModal();
    });
    $("#loginForm").addEventListener("submit", submitLogin);
    $("#logoutButton").addEventListener("click", logout);
    $$("[data-dashboard-tab]").forEach((button) =>
      button.addEventListener("click", () =>
        selectDashboardTab(button.dataset.dashboardTab),
      ),
    );
    $("#analyticsGroup").addEventListener("change", loadAnalytics);
    $$(".analytics-period").forEach((button) =>
      button.addEventListener("click", () => {
        $("#analyticsDays").value = button.dataset.days;
        $$(".analytics-period").forEach((item) => {
          item.classList.toggle("bg-blue-500", item === button);
          item.classList.toggle("text-white", item === button);
          item.classList.toggle("text-slate-400", item !== button);
        });
        void loadAnalytics();
      }),
    );
    $("#refreshAutomations").addEventListener("click", loadAutomations);
    $("#automationForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const feedback = $("#automationFeedback");
      feedback.textContent = "Saving…";
      try {
        await api("/api/automations", {
          method: "POST",
          body: JSON.stringify({
            groupId: $("#automationGroup").value,
            name: $("#automationName").value,
            type: $("#automationType").value,
            timezone: $("#automationTimezone").value,
            runAt: $("#automationRunAt").value,
            message: $("#automationMessage").value,
          }),
        });
        event.currentTarget.reset();
        $("#automationTimezone").value = "Asia/Colombo";
        feedback.textContent = "Automation created ✓";
        await loadAutomations();
      } catch (error) {
        feedback.textContent = error.message;
      }
    });
    $("#automationList").addEventListener("click", async (event) => {
      const button = event.target.closest(".automation-delete");
      if (!button) return;
      try {
        await api(
          `/api/automations/${encodeURIComponent(button.dataset.jobId)}`,
          { method: "DELETE", body: "{}" },
        );
        await loadAutomations();
      } catch (error) {
        $("#automationFeedback").textContent = error.message;
      }
    });
    $("#accountLocaleForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await api("/api/account/preferences", {
          method: "PATCH",
          body: JSON.stringify({
            locale: $("#accountLocale").value,
            timezone: $("#accountTimezone").value,
          }),
        });
        applyDashboardLocale($("#accountLocale").value);
        $("#accountLocaleFeedback").textContent = "Preferences saved ✓";
      } catch (error) {
        $("#accountLocaleFeedback").textContent = error.message;
      }
    });
    $("#localeGroup").addEventListener("change", () => {
      const group = managedGroups.find(
        (item) => item.group_id === $("#localeGroup").value,
      );
      if (group) {
        $("#groupLocale").value = group.locale || "en";
        $("#groupTimezone").value = group.timezone || "Asia/Colombo";
      }
    });
    $("#groupLocaleForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const groupId = $("#localeGroup").value;
      try {
        await api(`/api/groups/${encodeURIComponent(groupId)}/locale`, {
          method: "PATCH",
          body: JSON.stringify({
            locale: $("#groupLocale").value,
            timezone: $("#groupTimezone").value,
          }),
        });
        const group = managedGroups.find((item) => item.group_id === groupId);
        if (group) {
          group.locale = $("#groupLocale").value;
          group.timezone = $("#groupTimezone").value;
        }
        $("#groupLocaleFeedback").textContent = "Group locale saved ✓";
      } catch (error) {
        $("#groupLocaleFeedback").textContent = error.message;
      }
    });
    $("#privateChatbotToggle").addEventListener("change", (event) =>
      updatePrivateChatbot(event.target.checked, event.target),
    );
    $("#ownerPrivateChatbotToggle").addEventListener("change", (event) =>
      updatePrivateChatbot(event.target.checked, event.target),
    );
    $("#refreshDashboardButton").addEventListener("click", () =>
      requestGroupRefresh("user"),
    );
    $("#refreshOwnerDashboardButton").addEventListener("click", () =>
      requestGroupRefresh("owner"),
    );
    $("#groupGrid").addEventListener("click", (event) => {
      const button = event.target.closest(".open-group");
      if (button)
        openGroupSettings(decodeURIComponent(button.dataset.group), "user");
    });
    $("#ownerGroupGrid").addEventListener("click", (event) => {
      const button = event.target.closest(".open-group");
      if (button)
        openGroupSettings(decodeURIComponent(button.dataset.group), "owner");
    });
    $("#backToGroupListButton").addEventListener("click", returnToGroupList);
    $("#groupSettingsForm").addEventListener("submit", saveGroupDetail);
    $$("[data-log-tab]").forEach((button) =>
      button.addEventListener("click", () =>
        selectLogTab(button.dataset.logTab),
      ),
    );
    window.addEventListener("popstate", () => {
      if (location.pathname === "/") {
        showPublicView({
          preserveSession: Boolean(currentRole),
          replaceRoute: false,
        });
        const section = decodeURIComponent(location.hash.replace(/^#/, ""));
        if (section)
          requestAnimationFrame(() =>
            $("#" + section)?.scrollIntoView({
              behavior: "auto",
              block: "start",
            }),
          );
      } else if (currentRole) {
        const groupPrefix = "/dashboard/group/";
        const groupId = location.pathname.startsWith(groupPrefix)
          ? location.pathname.slice(groupPrefix.length)
          : null;
        if (groupId)
          openGroupSettings(decodeURIComponent(groupId), currentRole, {
            updateHistory: false,
          });
        else showDashboard(currentRole);
      }
    });

    const wantsLogin = new URLSearchParams(location.search).has("login");
    try {
      const session = await api("/api/auth/session", { headers: {} });
      csrfToken = session.csrfToken || null;
      if (session.authenticated) {
        currentRole = session.role;
        const groupPrefix = "/dashboard/group/";
        const groupId = location.pathname.startsWith(groupPrefix)
          ? location.pathname.slice(groupPrefix.length)
          : null;
        if (location.pathname.startsWith("/dashboard") || wantsLogin) {
          await showDashboard(session.role);
          if (groupId)
            await openGroupSettings(decodeURIComponent(groupId), session.role, {
              updateHistory: false,
            });
        } else {
          // A signed-in visitor may deliberately browse Home, Features or the
          // deployment guide. Keep their role so the Dashboard button returns
          // without another sign-in.
          showPublicView({ preserveSession: true, replaceRoute: false });
          const section = decodeURIComponent(location.hash.replace(/^#/, ""));
          if (section)
            requestAnimationFrame(() =>
              $("#" + section)?.scrollIntoView({
                behavior: "auto",
                block: "start",
              }),
            );
        }
      } else {
        showPublicView({
          replaceRoute:
            location.pathname.startsWith("/dashboard") || wantsLogin,
        });
        if (wantsLogin) openLoginModal();
      }
    } catch {
      showPublicView();
    }
  }

  document.addEventListener("DOMContentLoaded", initialise);
})();
