const $ = (s) => document.querySelector(s),
  fmt = (n) => n.toLocaleString("en-US");
const storage = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {}
  },
};
function eventId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
const pond = window.createMoyuApi(window.MOYU_CONFIG);
let nickname = storage.get("moyuName") || "匿名打工人",
  state = null,
  sound = false,
  audio = null,
  history = [],
  lastChoice = "",
  completionShown = null,
  finishShown = null,
  viewEpoch = 0,
  refreshing = false,
  connected = false,
  bossMode = false,
  bossSnapshot = null;
$("#nickname").textContent = nickname;
$("#nickname").style.cursor = "pointer";
const lines = [
  "你每摸一次鱼，世界上就有一条鱼被摸了一次。",
  "本次摸鱼已计入工时。",
  "鱼鳞 -1，班味 -1。",
  "检测到你正在工作，已为你自动纠正。",
  "鱼说可以，但没说可以一直。",
  "恭喜，你在本次会议中完成了唯一一件实事。",
  "这条鱼已经没有隐私了。",
  "你的老板少了一秒，你的人生多了一秒。",
  "摸鱼没有 KPI，但你完成得很好。",
  "这片鱼鳞，曾经也有自己的梦想。",
  "鱼已将紧急联系人修改为市场监管局。",
];
function toast(s) {
  if (bossMode) return;
  $("#toast").textContent = s;
  $("#toast").classList.add("show");
  clearTimeout(window.tt);
  window.tt = setTimeout(() => $("#toast").classList.remove("show"), 2600);
}
function setConnection(online) {
  connected = online;
  $("#connectionNotice").hidden = online;
  $("#fish").disabled =
    !online || !state || !!state.dish || state.count >= state.target;
  document
    .querySelectorAll("[data-cook]")
    .forEach((button) => (button.disabled = !online));
  $("#next").disabled = !online;
  if (!online) {
    $("#connection").textContent = "暂时连不上大家，正在重试";
    $("#connectionMessage").textContent = state
      ? "暂时连不上大家，先停一下。连上后就能继续摸这条鱼。"
      : "鱼塘还没连上，等大家集合后一起开摸。";
  } else {
    $("#connection").textContent =
      `${state?.participants || 0} 位打工人参与了本轮摸鱼`;
  }
}
function handleConnectionError(error) {
  if (
    !error.status ||
    error.status === 401 ||
    error.status === 404 ||
    error.status >= 500
  ) {
    setConnection(false);
    pending.length = 0;
  }
}
const fishes = [
  {
    name: "鱼大福",
    type: "草鱼 · 摸鱼办元老",
    desc: "资历最老，鱼鳞最多，饼也吃得最多。",
    line: "按摩可以，办卡就算了。",
    color: "#aabb8c",
    dark: "#718560",
    light: "#e4e0b7",
    kind: "carp",
  },
  {
    name: "鲑薪很高",
    type: "三文鱼 · 薪资保密岗",
    desc: "自带高级感。但工资都是画的饼。",
    line: "我这个颜色，是加班加出来的。",
    color: "#eea28b",
    dark: "#c87762",
    light: "#f9d5bb",
    kind: "salmon",
  },
  {
    name: "河豚气包",
    type: "河豚 · 情绪管理专员",
    desc: "一上班就膨胀，一开会就炸毛。",
    line: "别摸了！这不是胖，这是工伤。",
    color: "#d9c680",
    dark: "#9a8c51",
    light: "#fff0c0",
    kind: "puffer",
  },
  {
    name: "咸鱼翻翻",
    type: "咸鱼 · 资深躺平顾问",
    desc: "梦想是翻身，计划是明天。",
    line: "帮我翻个面，谢谢。",
    color: "#bdc9cf",
    dark: "#7b909c",
    light: "#e6e5d5",
    kind: "flat",
  },
  {
    name: "鲶终奖",
    type: "鲶鱼 · 饼图分析师",
    desc: "胡子很长，等待年终奖的日子更长。",
    line: "老板说的年终，到底是哪一年？",
    color: "#929daf",
    dark: "#5e6c85",
    light: "#ced2d8",
    kind: "catfish",
  },
];
function fishFor(s) {
  return fishes[(s.round - 1) % fishes.length];
}
function drawing(f, id = "fishdraw", scales = true) {
  const puffer = f.kind === "puffer",
    flat = f.kind === "flat",
    cat = f.kind === "catfish",
    salmon = f.kind === "salmon";
  const shape = puffer
    ? "M205 145C205 22 469 18 514 121C555 243 235 277 205 145Z"
    : flat
      ? "M154 155Q275 53 510 117Q557 135 580 158Q549 207 350 211Q225 208 154 155Z"
      : cat
        ? "M155 143Q255 44 480 91Q567 107 591 153Q550 217 340 217Q218 208 155 143Z"
        : "M155 140C210 34 433 20 539 106Q577 131 586 149Q571 182 532 199C398 258 225 234 155 140Z";
  let marks = "";
  for (let row = 0; row < 8; row++)
    for (let col = 0; col < 17; col++) {
      const x = 155 + col * 23 + (row % 2) * 11.5,
        y = 54 + row * 23;
      marks += `<path d="M${x - 11.5} ${y}Q${x} ${y + 22} ${x + 11.5} ${y}" fill="${f.light}" fill-opacity=".12" stroke="${f.dark}" stroke-opacity=".28" stroke-width="1" data-rank="${(col * 31 + row * 19) % 120}"/>`;
    }
  let spikes = "";
  if (puffer)
    for (let i = 0; i < 17; i++) {
      let a = (i * Math.PI * 2) / 17,
        cx = 360 + Math.cos(a) * 144,
        cy = 145 + Math.sin(a) * 99;
      spikes += `<path d="M${cx - 4} ${cy}l${Math.cos(a) * 14 + 4} ${Math.sin(a) * 14}l${4 - Math.cos(a) * 14} ${-Math.sin(a) * 14}" fill="${f.dark}" opacity=".65"/>`;
    }
  const eyes = flat
    ? '<path d="M505 136L522 139M530 132L546 135" stroke="#394337" stroke-width="4" stroke-linecap="round"/>'
    : puffer
      ? '<circle cx="453" cy="114" r="18" fill="#fff8d8"/><circle cx="457" cy="117" r="6" fill="#394337"/><path d="M433 91L459 97" stroke="#726438" stroke-width="4" stroke-linecap="round"/>'
      : '<ellipse cx="525" cy="124" rx="14" ry="15" fill="#fff8db"/><circle cx="529" cy="126" r="7" fill="#394337"/><circle cx="532" cy="122" r="2.5" fill="#fff"/>';
  return `<defs><linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${f.dark}"/><stop offset=".4" stop-color="${f.color}"/><stop offset="1" stop-color="${f.light}"/></linearGradient><clipPath id="${id}c"><path d="${shape}"/></clipPath></defs><g class="tail"><path d="M190 142Q131 111 78 76Q99 136 78 205Q139 186 190 149Z" fill="${f.color}" stroke="${f.dark}" stroke-width="2"/><path d="M88 91L169 144L88 190M88 117L165 145L88 165" fill="none" stroke="${f.dark}" opacity=".35"/></g><path d="${flat ? "M273 125Q319 77 368 98L423 123" : "M273 79Q319 22 368 43L423 80"}" fill="${f.dark}" opacity=".8"/><path d="${shape}" fill="url(#${id}b)" stroke="${f.dark}" stroke-width="2"/>${spikes}<g clip-path="url(#${id}c)" ${scales ? 'id="scales"' : ""}>${marks}${salmon ? '<path d="M180 128Q305 72 480 102M190 153Q328 96 495 128M215 181Q351 125 507 154M267 205Q386 163 491 180" fill="none" stroke="#ffe2ca" stroke-width="7" opacity=".5"/>' : ""}</g><path d="M477 90Q449 143 479 195" fill="none" stroke="${f.dark}" stroke-width="2" opacity=".5"/><g class="fin"><path d="M420 163Q397 218 350 220Q361 182 387 162" fill="${f.color}" stroke="${f.dark}" stroke-width="1.5"/><path d="M409 170L360 210M394 169L361 197" stroke="${f.dark}" opacity=".35"/></g>${eyes}<ellipse cx="${puffer ? 464 : 536}" cy="${puffer ? 146 : 151}" rx="15" ry="7" fill="#e3877d" opacity=".4"/>${puffer ? '<path d="M490 158q-10 -12 -18 0" stroke="#796d42" stroke-width="3" fill="none"/>' : flat ? '<path d="M551 158l17 -1" stroke="#52636d" stroke-width="2"/>' : '<path d="M565 153Q577 161 584 150" fill="none" stroke="#556443" stroke-width="2.5" stroke-linecap="round"/>'}${cat ? '<path d="M566 157Q613 134 634 152M565 163Q615 174 624 203M552 172Q575 215 562 237" fill="none" stroke="#5e6c85" stroke-width="2.5" stroke-linecap="round"/>' : ""}${flat ? '<path d="M347 73l12 -5 -7 -10 13 -5" stroke="#8b9eab" stroke-width="2" fill="none"/>' : ""}`;
}
let drawnFish = "";
function updateFish(s) {
  const f = fishFor(s);
  if (drawnFish !== f.kind) {
    drawnFish = f.kind;
    $("#fishSvg").setAttribute("viewBox", "60 30 580 220");
    $("#fishSvg").innerHTML = drawing(f, "hero");
    $("#speech").textContent = f.line;
    $("#fishName").textContent = "这位是，" + f.name + "。";
    $("#fishSubtitle").textContent = f.type + " / " + f.desc;
    $("#fishSubtitle").style.maxWidth = "300px";
    $("#fishSubtitle").style.lineHeight = "1.7";
  }
  document
    .querySelectorAll(".fish-card")
    .forEach((b, i) => b.classList.toggle("current", f === fishes[i]));
}
$("#fishRoster").innerHTML = fishes
  .map(
    (f, i) =>
      `<article class="fish-card"><span class="employee">EMPLOYEE / 00${i + 1}</span><svg viewBox="0 0 680 280" aria-hidden="true">${drawing(f, "card" + i, false)}</svg><strong>${f.name}</strong><p>${f.type}</p></article>`,
  )
  .join("");
function resetView() {
  viewEpoch++;
  pending.length = 0;
  state = null;
  drawnFish = "";
  completionShown = "";
  finishShown = "";
  combo = 0;
  lastTouch = 0;
  $("#combo").textContent = "";
  $("#fish").disabled = true;
  stopReaction();
  $("#finish").close();
  $("#result").close();
}
function render(s) {
  setConnection(true);
  if (
    state &&
    (s.round < state.round ||
      (s.round === state.round &&
        (s.count < state.count || (state.dish && !s.dish))))
  )
    return;
  if (state && s.round !== state.round) {
    $("#finish").close();
    $("#result").close();
    finishShown = "";
    completionShown = "";
  }
  state = s;
  updateFish(s);
  history = s.history || [];
  $("#count").textContent = fmt(s.count);
  $("#target").textContent = fmt(s.target);
  $("#mine").textContent = fmt(s.mine || 0);
  let p = s.count / s.target;
  $("#fill").style.width = p * 100 + "%";
  $("#percent").textContent = (p * 100).toFixed(1).replace(".0", "") + "% 已摸";
  $("#remaining").textContent =
    "待摸 " + fmt(Math.max(0, s.target - s.count)) + " 次";
  $("#fishNumber").textContent = "Fish No. " + String(s.round).padStart(3, "0");
  $("#playGuide").textContent =
    `大家一起摸够 ${fmt(s.target)} 下，最后一下的人决定红烧、清蒸，还是放生。`;
  $("#connection").textContent =
    `${s.participants || 0} 位打工人参与了本轮摸鱼`;
  $("#mood").innerHTML =
    "鱼的状态：<strong>" +
    (s.dish
      ? s.dish === "放生"
        ? "重获自由，明天再来"
        : "已完成从鱼到菜的转型"
      : p > 0.85
        ? "开始搜索劳动仲裁"
        : p > 0.5
          ? "怀疑 SPA 的经营资质"
          : p > 0.2
            ? "感觉事情不太对劲"
            : "以为是免费 SPA") +
    "</strong>";
  [...$("#scales").children].forEach(
    (e) => (e.style.opacity = Number(e.dataset.rank) < p * 120 ? "0" : "1"),
  );
  $("#fish").disabled = !!s.dish || s.count >= s.target;
  const finished = s.count >= s.target;
  $("#roundAction").hidden = !finished;
  $("#roundAction").textContent = s.dish
    ? "查看本轮结果"
    : s.canChoose
      ? "决定鱼的命运"
      : "等待鱼的去向";
  // Keep receiving shared progress, but never put a modal over the work view.
  if (bossMode) return;
  if (finished && !s.dish) {
    $("#cookOptions").hidden = !s.canChoose;
    $("#waitText").hidden = s.canChoose;
    $("#waitText").textContent =
      `正在等最后一摸的人决定。${s.choiceRemaining ?? 180} 秒后仍未决定，就替这条鱼放个生。`;
    $("#finishText").textContent = s.canChoose
      ? `最后一摸被你拿下了！请在 ${s.choiceRemaining ?? 180} 秒内决定它的鱼生。`
      : "锅都热好了，就等最后一摸的人发话。";
    if (finishShown !== s.round && !document.querySelector("dialog[open]")) {
      finishShown = s.round;
      $("#finish").showModal();
    }
  }
  if (s.dish) {
    $("#finish").close();
    if (
      completionShown !== s.round &&
      !document.querySelector("dialog[open]")
    ) {
      completionShown = s.round;
      showResult(s);
    }
  }
}
$("#roundAction").onclick = () => {
  if (!state) return;
  if (state.dish) showResult(state);
  else $("#finish").showModal();
};
const reactions = {
  squash: {
    label: "鱼被你摸成了鱼饼。",
    duration: 420,
    frames: ["none", "scale(1.09,.78)", "scale(.96,1.06)", "none"],
  },
  dodge: {
    label: "鱼：你手往哪儿放呢！",
    duration: 520,
    frames: [
      "none",
      "translateX(-30px) rotate(-5deg)",
      "translateX(20px) rotate(4deg)",
      "none",
    ],
  },
  wiggle: {
    label: "鱼开启了震动模式。",
    duration: 520,
    frames: [
      "none",
      "rotate(-5deg)",
      "rotate(5deg)",
      "rotate(-4deg)",
      "rotate(3deg)",
      "none",
    ],
  },
  flip: {
    label: "咸鱼翻身。翻完继续躺。",
    duration: 760,
    frames: [
      "none",
      "scaleY(.12) translateY(-12px)",
      "scaleY(-.85)",
      "scaleY(-.85)",
      "scaleY(.12)",
      "none",
    ],
  },
  puff: {
    label: "不是胖，是被你气膨胀了。",
    duration: 680,
    frames: [
      "none",
      "scale(1.05,1.16)",
      "scale(1.05,1.16)",
      "scale(.98,.96)",
      "none",
    ],
  },
  dead: {
    label: "本鱼已下班。有事明天再摸。",
    duration: 900,
    frames: [
      "none",
      "translateY(13px) rotate(7deg) scaleY(.72)",
      "translateY(13px) rotate(7deg) scaleY(.72)",
      "none",
    ],
  },
};
let reactionAnimation = null,
  reactionTimer = null,
  lastReaction = "",
  combo = 0,
  lastTouch = 0;
function stopReaction() {
  clearTimeout(reactionTimer);
  reactionAnimation?.cancel();
  reactionAnimation = null;
  $("#fishSvg").classList.remove("reacting");
  $("#fishSvg").removeAttribute("data-reaction");
}
function react(x, y) {
  const now = performance.now();
  combo = now - lastTouch < 650 ? combo + 1 : 1;
  lastTouch = now;
  $("#combo").textContent =
    combo >= 3
      ? `连摸 ${combo} 下 · ${combo >= 10 ? "鱼已申请工伤" : "手法逐渐专业"}`
      : "";
  const kind = fishFor(state).kind;
  const pool = Object.keys(reactions);
  if (kind === "puffer") pool.push("puff", "puff");
  if (kind === "flat") pool.push("dead", "flip");
  if (kind === "catfish") pool.push("wiggle");
  let candidates = pool.filter((k) => k !== lastReaction);
  const key =
    combo > 0 && combo % 10 === 0
      ? "flip"
      : candidates[Math.floor(Math.random() * candidates.length)];
  lastReaction = key;
  const reaction = reactions[key];
  stopReaction();
  const fish = $("#fishSvg");
  fish.dataset.reaction = key;
  fish.classList.add("reacting");
  $("#speech").textContent = reaction.label;
  $("#ticker").textContent =
    Math.random() < 0.4
      ? fishFor(state).line
      : lines[Math.floor(Math.random() * lines.length)];
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
    reactionAnimation = fish.animate(
      reaction.frames.map((transform) => ({ transform })),
      { duration: reaction.duration, easing: "ease-in-out" },
    );
    reactionAnimation.onfinish = () => {
      fish.classList.remove("reacting");
      reactionAnimation = null;
    };
  } else {
    reactionTimer = setTimeout(() => fish.classList.remove("reacting"), 150);
  }
  for (let i = 0; i < 4; i++) {
    const particle = document.createElement("i");
    particle.className = "floating scale-particle";
    particle.style.left = x + Math.random() * 30 - 15 + "px";
    particle.style.top = y + "px";
    particle.style.setProperty("--dx", Math.random() * 110 - 55 + "px");
    particle.style.background = fishFor(state).color;
    document.body.append(particle);
    setTimeout(() => particle.remove(), 800);
  }
  if (sound) {
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)();
      audio.resume().catch(() => {});
      const o = audio.createOscillator(),
        g = audio.createGain();
      o.connect(g);
      g.connect(audio.destination);
      o.frequency.setValueAtTime(
        260 + Object.keys(reactions).indexOf(key) * 70,
        audio.currentTime,
      );
      o.frequency.exponentialRampToValueAtTime(100, audio.currentTime + 0.12);
      g.gain.setValueAtTime(0.05, audio.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.15);
      o.start();
      o.stop(audio.currentTime + 0.15);
      o.onended = () => {
        o.disconnect();
        g.disconnect();
      };
    } catch {
      sound = false;
      $("#sound").textContent = "♫ 音效关";
      toast("当前浏览器暂不支持音效");
    }
  }
}
function point(x, y) {
  const e = document.createElement("span");
  e.className = "floating";
  e.textContent = "+1";
  e.style.left = x + "px";
  e.style.top = y - 20 + "px";
  document.body.append(e);
  setTimeout(() => e.remove(), 1000);
}
const pending = [];
let processing = false;
async function drain() {
  if (processing) return;
  processing = true;
  try {
    while (pending.length) {
      const item = pending.shift();
      if (item.epoch !== viewEpoch) continue;
      try {
        let s;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            s = await pond.touch({
              round: item.round,
              event: item.event,
              name: nickname,
            });
            break;
          } catch (e) {
            if (attempt === 1 || e.status) throw e;
          }
        }
        if (item.epoch !== viewEpoch) continue;
        if (s.accepted) point(item.x, item.y);
        render(s);
      } catch (e) {
        if (item.epoch === viewEpoch) {
          handleConnectionError(e);
          toast(
            e.name === "AbortError" ? "连接有点慢，请稍后再摸。" : e.message,
          );
          pending.length = 0;
        }
      }
    }
  } finally {
    processing = false;
  }
}
function pat(e) {
  if (!connected || !state || state.count >= state.target || bossMode) return;
  if (pending.length >= 16) {
    toast("慢一点，鱼正在消化你的热情。");
    return;
  }
  const r = $("#fish").getBoundingClientRect(),
    x = e?.clientX || r.x + r.width * 0.6,
    y = e?.clientY || r.y + r.height * 0.5;
  react(x, y);
  pending.push({
    round: state.round,
    event: eventId(),
    epoch: viewEpoch,
    x,
    y,
  });
  drain();
}
$("#fish").onclick = pat;
async function refresh() {
  if (refreshing || processing) return;
  refreshing = true;
  $("#reconnect").disabled = true;
  const epoch = viewEpoch;
  try {
    const s = await pond.getState();
    if (epoch === viewEpoch) render(s);
  } catch {
    if (epoch === viewEpoch) setConnection(false);
  } finally {
    refreshing = false;
    $("#reconnect").disabled = false;
  }
}
$("#reconnect").onclick = refresh;
function showResult(s) {
  if (bossMode) return;
  $("#resultEmoji").innerHTML =
    `<svg viewBox="0 0 64 64" style="width:100px;height:100px" aria-hidden="true">${dishArt[s.dish]}</svg>`;
  $("#resultTitle").textContent =
    fishFor(s).name + (s.dish === "放生" ? "，重获自由。" : "，光荣出锅。");
  $("#resultCopy").textContent = s.autoReleased
    ? "最后一摸的人下班了。超过了选择时间，鱼塘决定替它放个生。"
    : s.dish === "放生"
      ? "鱼已回到河里。由于失去记忆，明天仍可继续参与本项目。"
      : "从带薪摸鱼，到集体加餐。这一锅，每个打工人都有份。";
  $("#certificate").replaceChildren();
  const title = document.createElement("p");
  title.textContent = `第 ${s.round} 条鱼 · ${fishFor(s).name} · ${s.dish}收场`;
  const detail = document.createElement("p");
  detail.textContent = `${s.participants} 人共同摸了 ${fmt(s.target)} 下`;
  const winner = document.createElement("p");
  winner.textContent = `最后一摸：${s.winnerName || "匿名打工人"}`;
  $("#certificate").append(title, detail, winner);
  $("#result").showModal();
}
document.querySelectorAll("[data-cook]").forEach((button) => {
  button.onclick = async () => {
    if (!connected || !state?.canChoose) return;
    button.disabled = true;
    const epoch = viewEpoch;
    try {
      const s = await pond.cook({
        dish: button.dataset.cook,
        round: state.round,
        name: nickname,
      });
      if (epoch === viewEpoch) render(s);
    } catch (error) {
      handleConnectionError(error);
      toast(error.message);
    } finally {
      button.disabled = !connected;
    }
  };
});
$("#next").onclick = async () => {
  if (!connected || !state?.dish) return;
  $("#next").disabled = true;
  const epoch = viewEpoch;
  try {
    const s = await pond.next({ round: state.round, name: nickname });
    if (epoch === viewEpoch) {
      resetView();
      render(s);
    }
  } catch (error) {
    handleConnectionError(error);
    toast(error.message);
  } finally {
    $("#next").disabled = !connected;
  }
};
$("#sound").onclick = () => {
  sound = !sound;
  $("#sound").textContent = sound ? "♫ 音效开" : "♫ 音效关";
  $("#sound").classList.toggle("sound-on", sound);
};
$("#invite").onclick = async () => {
  if (
    ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname) ||
    location.protocol === "file:"
  ) {
    toast("这个网址还没上线，暂时不能邀请同事。上线后大家就能来一起摸。");
    return;
  }
  try {
    await navigator.clipboard.writeText(location.href);
    toast("链接已复制，喊同事一起来摸鱼！");
  } catch (e) {
    toast("复制浏览器地址，喊同事一起来摸鱼吧");
  }
};
function setBossMode(active) {
  if (bossMode === active) return;
  bossMode = active;
  const workPage = $("#workPage");
  if (active) {
    bossSnapshot = {
      title: document.title,
      focus: document.activeElement,
      dialogs: [...document.querySelectorAll("dialog[open]")],
      epoch: viewEpoch,
      round: state?.round,
    };
    // Native dialogs live above every z-index. Close them before showing cover.
    bossSnapshot.dialogs.forEach((dialog) => dialog.close());
    stopReaction();
    audio?.suspend().catch(() => {});
    $("#toast").classList.remove("show");
    document.title = "Q4 项目推进与执行进度表";
  }
  document.body.classList.toggle("boss-active", active);
  document
    .querySelectorAll("header, main")
    .forEach((el) => (el.inert = active));
  workPage.hidden = !active;
  $("#boss").setAttribute("aria-expanded", String(active));
  if (active) {
    workPage.focus({ preventScroll: true });
    return;
  }

  const previous = bossSnapshot;
  bossSnapshot = null;
  document.title = previous?.title || "摸鱼办事处 · 今天也要有所鱼获";
  if (sound) audio?.resume().catch(() => {});
  // Restore drafts and still-valid dialogs; an old round must not reappear.
  if (previous?.epoch === viewEpoch) {
    for (const dialog of previous.dialogs) {
      if (dialog.id === "finish" || dialog.id === "result") {
        if (previous.round !== state?.round) continue;
        if (dialog.id === "finish" && state?.dish) continue;
        if (dialog.id === "result" && !state?.dish) continue;
      }
      dialog.showModal();
    }
  }
  if (state) render(state);
  const openDialog = document.querySelector("dialog[open]");
  const focus = previous?.focus;
  if (
    focus?.isConnected &&
    !focus.disabled &&
    (!openDialog || openDialog.contains(focus))
  ) {
    focus.focus({ preventScroll: true });
  } else if (!openDialog) {
    $("#boss").focus({ preventScroll: true });
  }
}
$("#boss").onclick = () => setBossMode(true);
$("#backToPond").onclick = () => setBossMode(false);
window.addEventListener(
  "keydown",
  (e) => {
    if (e.key === "Escape") {
      // Handle before the browser's default dialog-cancel action, even in inputs.
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!e.repeat) setBossMode(!bossMode);
      return;
    }
    if (bossMode) {
      // Tab stays inside the cover. Space must never activate the fish behind it.
      if (e.key === "Tab") {
        e.preventDefault();
        $("#backToPond").focus();
      }
      return;
    }
    if (e.repeat) return;
    if (
      e.code === "Space" &&
      !["INPUT", "BUTTON", "TEXTAREA"].includes(
        document.activeElement.tagName,
      ) &&
      !document.activeElement.isContentEditable &&
      !document.querySelector("dialog[open]")
    ) {
      e.preventDefault();
      pat();
    }
  },
  { capture: true },
);
document.querySelectorAll("dialog").forEach((dialog) => {
  dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    setBossMode(true);
  });
});
document
  .querySelectorAll("[data-close]")
  .forEach((b) => (b.onclick = () => b.closest("dialog").close()));
document.querySelectorAll(".recipe").forEach(
  (b) =>
    (b.onclick = () => {
      document
        .querySelectorAll(".recipe")
        .forEach((b) => b.classList.remove("selected"));
      b.classList.add("selected");
      lastChoice = b.dataset.recipe;
      toast(`已惦记上${lastChoice}。抢到最后一下，才有最终决定权。`);
    }),
);
$("#recipeHelp").onclick = () =>
  toast(
    "大家摸的次数加在一起，抢到最后一下的人决定做法。点鱼身或按空格，就能帮忙摸一下。",
  );
$("#archive").onclick = () => {
  const list = $("#archiveList");
  list.replaceChildren();
  if (!history.length) {
    const p = document.createElement("p");
    p.textContent = "暂时还没有鱼完成鱼生。第一张纪念卡，等你来创造。";
    list.append(p);
  }
  history.forEach((h) => {
    const el = document.createElement("div");
    el.className = "archive-item";
    const icon = document.createElement("span");
    icon.innerHTML = `<svg viewBox="0 0 64 64" width="44" height="44" aria-hidden="true">${dishArt[h.dish]}</svg>`;
    const p = document.createElement("p");
    p.textContent = `第 ${h.round} 条 · ${h.fishName || fishes[(h.round - 1) % 5].name} · ${h.dish} / ${h.participants} 人参与 / 最后一摸：${h.winnerName}`;
    el.append(icon, p);
    list.append(el);
  });
  $("#archiveModal").showModal();
};
$("#home").onclick = () => window.scrollTo({ top: 0, behavior: "smooth" });
$("#nickname").onclick = () => {
  $("#nameInput").value = nickname;
  $("#nameModal").showModal();
};
$("#saveName").onclick = () => {
  nickname = $("#nameInput").value.trim() || "匿名打工人";
  storage.set("moyuName", nickname);
  $("#nickname").textContent = nickname;
  $("#nameModal").close();
  toast("化名已就位，开始带薪摸鱼。");
};

const dishArt = {
  红烧: '<ellipse cx="32" cy="40" rx="27" ry="11" fill="#ded7c5"/><path d="M5 29Q8 52 32 52Q57 52 59 29Z" fill="#c97950" stroke="#594c37" stroke-width="1.7"/><ellipse cx="32" cy="29" rx="27" ry="9" fill="#a64f35" stroke="#594c37" stroke-width="1.7"/><path d="M16 29Q30 17 47 28Q34 39 16 29Z" fill="#e6aa69"/><circle cx="42" cy="27" r="2" fill="#514b32"/><path d="M23 24l4 9m5-10 4 10M18 20l7-6m8 6 7-7" stroke="#a75432" stroke-width="2"/><path d="M19 10q-4-5 1-8M33 10q-4-5 1-8" stroke="#aeaa91" stroke-width="1.5" fill="none"/>',
  清蒸: '<ellipse cx="32" cy="36" rx="29" ry="16" fill="#f3eee0" stroke="#909887" stroke-width="1.7"/><ellipse cx="32" cy="35" rx="23" ry="10" fill="#e0e4ca"/><path d="M14 35Q30 20 49 33Q33 47 14 35L7 29L8 40Z" fill="#b6c59c" stroke="#6c805c" stroke-width="1.6"/><circle cx="44" cy="32" r="2" fill="#43553c"/><path d="M25 29l4 11m5-13 3 11" stroke="#758d65" stroke-width="1.5"/><path d="M18 30l24 9m-21-14 20 12" stroke="#79935c" stroke-width="2"/><path d="M22 13q-5-6 0-11m16 12q-5-6 0-11" fill="none" stroke="#b4b59e" stroke-width="1.5"/>',
  剁椒: '<path d="M38 17Q54 26 40 43Q27 56 10 51Q30 40 27 26Z" fill="#d87857" stroke="#79553e" stroke-width="1.7"/><path d="M37 20Q34 9 43 6" fill="none" stroke="#71865b" stroke-width="4" stroke-linecap="round"/><path d="M34 24Q39 28 36 33" fill="none" stroke="#f0bd8c" stroke-width="2.5" stroke-linecap="round"/><path d="M48 34Q60 28 58 18" fill="none" stroke="#b7ac7d" stroke-width="1.5"/><path d="M50 45l7 1m-8-5 7-3" stroke="#b7ac7d" stroke-width="1.5"/>',
  放生: '<path d="M5 40q9-9 18 0t18 0t18 0M5 49q9-9 18 0t18 0t18 0" stroke="#8daaaa" stroke-width="2" fill="none"/><path d="M16 23Q31 8 49 24Q33 38 16 25L7 17V32Z" fill="#bbc9a0" stroke="#6f8259" stroke-width="1.7" transform="rotate(-18 30 23)"/><path d="M38 19l6 2" stroke="#566b44" stroke-width="2" stroke-linecap="round"/><path d="M45 9l4-5m4 12 7-1" stroke="#d1b76d" stroke-width="2" stroke-linecap="round"/>',
};
document.querySelectorAll("[data-cook]").forEach((b) => {
  const small = b.querySelector("small");
  const label = b.dataset.cook;
  b.replaceChildren();
  const icon = document.createElement("span");
  icon.innerHTML = `<svg viewBox="0 0 64 64" width="48" height="48" aria-hidden="true">${dishArt[label]}</svg>`;
  icon.style.display = "block";
  b.append(icon, document.createTextNode(label), small);
});
document
  .querySelectorAll(".recipe")
  .forEach(
    (b) =>
      (b.querySelector(".dish").innerHTML =
        `<svg viewBox="0 0 64 64" aria-hidden="true">${dishArt[b.dataset.recipe]}</svg>`),
  );
$(".avatar").innerHTML =
  `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M14 43Q7 33 13 30Q17 29 23 37L19 17Q20 10 24 16L28 32L29 10Q32 5 35 11L35 31L40 14Q44 10 46 16L43 34L49 25Q54 23 55 28L48 47Q44 57 32 56Q20 55 14 43Z" fill="#edbc80" stroke="#9d7850" stroke-width="1.7"/><path d="M25 42q7-7 14 0m-4 4q-3 5-7 0" fill="none" stroke="#9d7850" stroke-width="1.5"/><path d="M7 15l-4-4m8 10H4M53 8l4-4" stroke="#d3a56c" stroke-width="2" stroke-linecap="round"/></svg>`;

refresh();
setInterval(refresh, pond.pollIntervalMs);
