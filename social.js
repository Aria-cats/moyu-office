/* Presence is independent of the public round. Hidden tabs stop sending heartbeats. */
window.startPondSocial = function ({ pond, storage, firstRound, initialName, onName, notify }) {
  const el = id => document.getElementById(id);
  const modal = el("nameModal");
  const nameInput = el("nameInput");
  const regionInput = el("regionInput");
  const regions = "北京 天津 河北 山西 内蒙古 辽宁 吉林 黑龙江 上海 江苏 浙江 安徽 福建 江西 山东 河南 湖北 湖南 广东 广西 海南 重庆 四川 贵州 云南 西藏 陕西 甘肃 青海 宁夏 新疆 香港 澳门 台湾 海外".split(" ");
  const choices = Array.from(document.querySelectorAll("[data-board]"));
  const boardNames = {players: "个人累计前五名", regions: "地区代表队前五名"};

  let profile = { name: initialName, region: "" };
  let profileLoaded = false;
  let legacyName = storage.get("moyuName");
  if (legacyName === "匿名打工人") legacyName = "";
  let activeBoard = "players";
  let snapshot = null;
  let lastLoadFailed = false;
  let canRead = false;
  let reading = false;
  let saving = false;
  let refreshAfterRead = false;
  let timer;
  let profileVersion = 0;
  let draftVersion = 0;
  let nameEdited = false;
  let regionEdited = false;

  for (const region of regions) regionInput.add(new Option(region, region));

  function showSavedRegion() {
    regionInput.value = profile.region || (profile.regionOptedOut ? "" : "unassigned");
    el("regionState").textContent = profileLoaded ? "未匹配到地区" :
      lastLoadFailed ? "代表队暂时未同步" : "正在读取代表队…";
  }

  function applyProfile(next) {
    profile = next;
    profileLoaded = true;
    onName(profile.name || "匿名打工人");
    const regionLabel = el("myRegion");
    regionLabel.textContent = profile.region ? profile.region + "队" : "";
    regionLabel.hidden = !profile.region;
    if (modal.open) {
      if (!nameEdited) nameInput.value = profile.name;
      if (!regionEdited) showSavedRegion();
    }
  }

  function renderBoard() {
    const list = el("rankRows");
    const status = el("rankStatus");
    list.setAttribute("aria-label", boardNames[activeBoard]);
    list.replaceChildren();
    const rows = snapshot?.[activeBoard] || [];
    for (const player of rows.slice(0, 5)) {
      const row = document.createElement("li");
      const name = document.createElement("span");
      const count = document.createElement("strong");
      name.textContent = player.name;
      count.textContent = player.count.toLocaleString("zh-CN") + " 下";
      row.append(name, count);
      list.append(row);
    }
    if (lastLoadFailed) {
      status.textContent = rows.length ? "暂时没能更新，显示上次的排名。" : "榜单暂时没连上。";
    } else if (!snapshot) {
      status.textContent = "正在加载榜单…";
    } else if (!rows.length) {
      status.textContent = activeBoard === "players" ? "还没人上榜，摸一下就有机会。" : "还没有地区上榜。来给你的队摸下第一分！";
    }
    status.hidden = !lastLoadFailed && !!rows.length;
    el("rankRetry").hidden = !lastLoadFailed;
    choices.forEach(button => button.setAttribute("aria-pressed", String(button.dataset.board === activeBoard)));
  }

  function schedule() {
    clearTimeout(timer);
    if (!document.hidden) timer = setTimeout(refresh, 22000);
  }

  async function refresh() {
    clearTimeout(timer);
    if (!canRead || reading || saving || document.hidden) return;
    reading = true;
    const version = profileVersion;
    try {
      const response = await pond.social(legacyName);
      if (version !== profileVersion) return;
      lastLoadFailed = false;
      snapshot = response;
      legacyName = "";
      el("onlineCount").textContent = response.online.toLocaleString("zh-CN");
      applyProfile(response.profile);
    } catch {
      if (version !== profileVersion) return;
      lastLoadFailed = true;
      el("onlineCount").textContent = "—";
      if (modal.open && !regionEdited) showSavedRegion();
    } finally {
      reading = false;
      renderBoard();
      if (refreshAfterRead && !saving) {
        refreshAfterRead = false;
        refresh();
      } else {
        schedule();
      }
    }
  }

  function message(text) {
    const status = el("profileStatus");
    status.textContent = text;
    status.hidden = !text;
  }

  function openEditor() {
    draftVersion++;
    nameEdited = false;
    regionEdited = false;
    nameInput.value = profile.name;
    showSavedRegion();
    message("");
    nameInput.disabled = saving;
    regionInput.disabled = saving;
    el("regionHint").disabled = saving;
    modal.showModal();
    nameInput.focus();
  }

  choices.forEach(button => {
    button.onclick = () => { activeBoard = button.dataset.board; renderBoard(); };
  });
  el("nickname").onclick = openEditor;
  el("editProfile").onclick = openEditor;
  el("rankRetry").onclick = refresh;
  nameInput.oninput = () => { nameEdited = true; };
  regionInput.onchange = () => {
    regionEdited = true;
    draftVersion++;
    el("regionHint").disabled = saving;
    message("");
  };

  el("regionHint").onclick = async () => {
    const version = ++draftVersion;
    const button = el("regionHint");
    button.disabled = true;
    message("正在推荐地区…");
    try {
      await firstRound;
      if (version !== draftVersion || !modal.open) return;
      const {region} = await pond.regionHint();
      if (version !== draftVersion || !modal.open) return;
      if (regions.includes(region)) {
        regionInput.value = region;
        regionEdited = true;
        message("已推荐" + region + "，保存后将加入代表队。");
      } else {
        message("暂时查不到地区，可以手动选择。");
      }
    } catch {
      if (version === draftVersion && modal.open) message("暂时查不到地区，可以手动选择。");
    } finally {
      if (version === draftVersion) button.disabled = false;
    }
  };

  el("profileForm").onsubmit = async event => {
    event.preventDefault();
    if (saving) return;
    const changes = {};
    if (nameEdited) changes.name = nameInput.value.trim();
    if (regionEdited) changes.region = regionInput.value;
    if (!Object.keys(changes).length) {
      message("鱼片没有改动。");
      return;
    }
    ++profileVersion;
    ++draftVersion;
    saving = true;
    const editorVersion = draftVersion;
    const button = el("saveName");
    button.disabled = true;
    nameInput.disabled = true;
    regionInput.disabled = true;
    el("regionHint").disabled = true;
    message("正在保存…");
    try {
      await firstRound;
      const response = await pond.profile(changes);
      legacyName = "";
      applyProfile(response.profile);
      storage.set("moyuName", profile.name);
      message("");
      if (editorVersion === draftVersion) modal.close();
      notify("鱼片已保存。");
    } catch {
      message("鱼片暂时没保存成功，请重试。");
    } finally {
      saving = false;
      button.disabled = false;
      nameInput.disabled = false;
      regionInput.disabled = false;
      el("regionHint").disabled = false;
      if (reading) refreshAfterRead = true;
      else refresh();
    }
  };

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) clearTimeout(timer);
    else refresh();
  });
  // A fresh self-hosted session gets its HttpOnly cookie on the first round read.
  // Starting both requests together could create two different player identities.
  Promise.resolve(firstRound).then(() => {
    canRead = true;
    refresh();
  });
};
