const APP_VERSION = "1.0.8";
const VERSION_FILE = "./version.json";

const pad2 = n => String(n).padStart(2, "0");

function fmtDate(d){
  return `${pad2(d.getDate())}.${pad2(d.getMonth()+1)}.${d.getFullYear()}`;
}

function escapeHTML(value){
  return String(value ?? "").replace(/[&<>'"]/g, ch => ({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    "'":"&#039;",
    '"':"&quot;"
  }[ch]));
}

let celebrationScrollY = 0;
let celebrationViewportCleanup = null;
const CELEBRATION_SHOW_DURATION_MS = 60000;

function getStableViewportHeight(){
  const values = [
    window.innerHeight,
    document.documentElement.clientHeight,
    window.visualViewport?.height
  ].filter(Number.isFinite);

  return Math.max(320, Math.round(Math.max(...values)));
}

function syncAppViewportHeight(){
  const viewportHeight = getStableViewportHeight();
  document.documentElement.style.setProperty("--app-viewport-height", `${viewportHeight}px`);
}

function lockCelebrationViewportHeight(){
  const height = getStableViewportHeight();
  document.documentElement.style.setProperty("--celebration-lock-height", `${height}px`);
  document.documentElement.style.setProperty("--app-viewport-height", `${height}px`);
}

function startViewportSync(){
  syncAppViewportHeight();

  if (celebrationViewportCleanup) return;

  const handler = () => {
    if (document.documentElement.classList.contains("celebration-lock")) return;
    requestAnimationFrame(syncAppViewportHeight);
  };

  window.addEventListener("resize", handler, { passive:true });
  window.addEventListener("orientationchange", handler, { passive:true });

  celebrationViewportCleanup = () => {
    window.removeEventListener("resize", handler);
    window.removeEventListener("orientationchange", handler);
    celebrationViewportCleanup = null;
  };
}

function stopViewportSync(){
  if (celebrationViewportCleanup) celebrationViewportCleanup();
}

function lockPageForCelebration(){
  celebrationScrollY = window.scrollY || document.documentElement.scrollTop || 0;
  lockCelebrationViewportHeight();

  document.documentElement.style.setProperty("--celebration-lock-top", `-${celebrationScrollY}px`);
  document.documentElement.classList.add("celebration-lock");
  document.body.classList.add("celebration-lock");
}

function unlockPageForCelebration(){
  document.documentElement.classList.remove("celebration-lock");
  document.body.classList.remove("celebration-lock");
  document.documentElement.style.setProperty("--celebration-lock-top", "0px");

  window.scrollTo(0, celebrationScrollY);
  syncAppViewportHeight();
  stopViewportSync();
}

// Yıl-ay-gün-saat-dk-sn “takvimsel” fark
function diffCalendar(start, end){
  let y = end.getFullYear() - start.getFullYear();
  let m = end.getMonth() - start.getMonth();
  let d = end.getDate() - start.getDate();
  let h = end.getHours() - start.getHours();
  let min = end.getMinutes() - start.getMinutes();
  let s = end.getSeconds() - start.getSeconds();

  if (s < 0){ s += 60; min--; }
  if (min < 0){ min += 60; h--; }
  if (h < 0){ h += 24; d--; }
  if (d < 0){
    const prevMonth = new Date(end.getFullYear(), end.getMonth(), 0);
    d += prevMonth.getDate();
    m--;
  }
  if (m < 0){ m += 12; y--; }

  return {y,m,d,h,min,s};
}

function nextAnniversary(baseDate, now){
  const month = baseDate.getMonth();
  const day   = baseDate.getDate();
  const hh    = baseDate.getHours();
  const mm    = baseDate.getMinutes();
  const ss    = baseDate.getSeconds();

  let candidate = new Date(now.getFullYear(), month, day, hh, mm, ss);
  if (candidate <= now) candidate = new Date(now.getFullYear()+1, month, day, hh, mm, ss);
  return candidate;
}

async function loadEvents(){
  const res = await fetch("./dates.json", { cache:"no-store" });
  if (!res.ok) throw new Error("dates.json okunamadı");
  const data = await res.json();
  return data.events || [];
}

function normalizeVersion(value){
  return String(value || "").trim();
}

function isNewerVersion(remoteVersion, currentVersion){
  remoteVersion = normalizeVersion(remoteVersion);
  currentVersion = normalizeVersion(currentVersion);

  if (!remoteVersion || remoteVersion === currentVersion) return false;

  const remoteParts = remoteVersion.split(/[.-]/).map(part => Number.parseInt(part, 10));
  const currentParts = currentVersion.split(/[.-]/).map(part => Number.parseInt(part, 10));
  const comparable = remoteParts.every(Number.isFinite) && currentParts.every(Number.isFinite);

  if (!comparable) return remoteVersion !== currentVersion;

  const max = Math.max(remoteParts.length, currentParts.length);
  for (let i = 0; i < max; i++){
    const r = remoteParts[i] || 0;
    const c = currentParts[i] || 0;
    if (r > c) return true;
    if (r < c) return false;
  }

  return false;
}

async function loadRemoteVersion(){
  const url = `${VERSION_FILE}?t=${Date.now()}`;
  const res = await fetch(url, {
    cache:"no-store",
    headers:{ "Cache-Control":"no-cache" }
  });

  if (!res.ok) throw new Error("version.json okunamadı");
  return res.json();
}

async function clearAppCaches(){
  if (!("caches" in window)) return;
  const keys = await caches.keys();
  await Promise.all(keys.map(key => caches.delete(key)));
}

async function activateLatestServiceWorker(){
  if (!("serviceWorker" in navigator)) return;

  const registration = await navigator.serviceWorker.getRegistration("./");
  if (!registration) return;

  await registration.update().catch(()=>{});

  if (registration.waiting){
    registration.waiting.postMessage({ type:"SKIP_WAITING" });
  }
}

async function applyUpdate(remote){
  const version = normalizeVersion(remote.version);
  const key = `biz-love-auto-updated-${version}`;

  if (sessionStorage.getItem(key) === "1") return;
  sessionStorage.setItem(key, "1");

  await activateLatestServiceWorker();
  await clearAppCaches();

  const url = new URL(window.location.href);
  url.searchParams.set("v", version || String(Date.now()));
  window.location.replace(url.toString());
}

function showUpdateNotice(remote){
  if (document.querySelector(".updateOverlay")) return;

  const overlay = document.createElement("div");
  overlay.className = "updateOverlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Uygulama güncellemesi");

  const card = document.createElement("div");
  card.className = "updateCard";
  card.addEventListener("click", e => e.stopPropagation());

  const icon = document.createElement("div");
  icon.className = "updateIcon";
  icon.textContent = "↻";
  icon.setAttribute("aria-hidden", "true");

  const eyebrow = document.createElement("div");
  eyebrow.className = "updateEyebrow";
  eyebrow.textContent = "Yeni sürüm hazır";

  const title = document.createElement("div");
  title.className = "updateTitle";
  title.textContent = remote.title || "Uygulama güncellendi";

  const text = document.createElement("div");
  text.className = "updateText";
  text.textContent = remote.message || "En yeni dosyaların yüklenmesi için uygulama şimdi yenilenecek.";

  const version = document.createElement("div");
  version.className = "updateVersion";
  version.textContent = `Mevcut: v${APP_VERSION} · Yeni: v${remote.version}`;

  const actions = document.createElement("div");
  actions.className = "updateActions";

  const later = document.createElement("button");
  later.type = "button";
  later.className = "updateLater";
  later.textContent = "Sonra";

  const update = document.createElement("button");
  update.type = "button";
  update.className = "updateNow";
  update.textContent = "Şimdi Güncelle";

  function close(){
    overlay.classList.remove("active");
    window.setTimeout(() => overlay.remove(), 220);
  }

  later.addEventListener("click", close);
  overlay.addEventListener("click", close);
  update.addEventListener("click", async () => {
    update.disabled = true;
    update.textContent = "Güncelleniyor...";
    await applyUpdate(remote).catch(() => {
      update.disabled = false;
      update.textContent = "Tekrar Dene";
    });
  });

  actions.append(later, update);
  card.append(icon, eyebrow, title, text, version, actions);
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  requestAnimationFrame(() => overlay.classList.add("active"));
}

async function checkForAppUpdate(){
  try{
    const remote = await loadRemoteVersion();
    if (!isNewerVersion(remote.version, APP_VERSION)) return;

    if (remote.updateMode === "auto" || remote.forceUpdate === true){
      await applyUpdate(remote);
      return;
    }

    showUpdateNotice(remote);
  } catch (error){
    console.log("Sürüm kontrolü yapılamadı:", error);
  }
}

async function registerServiceWorker(){
  if (!("serviceWorker" in navigator)) return;

  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  window.addEventListener("load", async () => {
    try{
      const registration = await navigator.serviceWorker.register("./sw.js");
      registration.update().catch(()=>{});

      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        if (!worker) return;

        worker.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller){
            worker.postMessage({ type:"SKIP_WAITING" });
          }
        });
      });
    } catch (error){
      console.log("Service Worker kaydı yapılamadı:", error);
    }
  });
}

function render(events){
  const list = document.getElementById("list");
  list.innerHTML = "";

  for (const ev of events){
    const d = new Date(ev.date);

    const item = document.createElement("div");
    item.className = "item";

    item.innerHTML = `
      <div class="itemTop">
        <div class="itemName">${escapeHTML(ev.title)}</div>
        <div class="itemDate">${fmtDate(d)}</div>
      </div>

      <div class="centerHeart" aria-hidden="true">
        <svg class="heart" viewBox="0 0 64 64">
          <path fill="#FF2D55" d="
            M32 56
            C32 56 6 40 6 22
            C6 14 12 8 20 8
            C26 8 30 11 32 15
            C34 11 38 8 44 8
            C52 8 58 14 58 22
            C58 40 32 56 32 56
            Z"/>
        </svg>
      </div>

      ${ev.message ? `<div class="pill">${escapeHTML(ev.message)}</div>` : ""}

      <div id="since-${escapeHTML(ev.id)}" class="big">—</div>
      <div id="next-${escapeHTML(ev.id)}" class="pill">Bir sonraki yıldönümüne: —</div>
    `;

    list.appendChild(item);
  }
}

function tick(events){
  const now = new Date();

  for (const ev of events){
    const base = new Date(ev.date);

    const since = diffCalendar(base, now);
    const sinceEl = document.getElementById(`since-${ev.id}`);
    if (sinceEl){
      sinceEl.textContent =
        `${since.y} yıl ${since.m} ay ${since.d} gün ${since.h} sa ${since.min} dk ${since.s} sn`;
    }

    const next = nextAnniversary(base, now);
    const left = diffCalendar(now, next);
    const nextEl = document.getElementById(`next-${ev.id}`);
    if (nextEl){
      nextEl.textContent =
        `Bir sonraki yıldönümüne: ${left.y} yıl ${left.m} ay ${left.d} gün ${left.h} sa ${left.min} dk ${left.s} sn`;
    }
  }
}

function isSameMonthDay(dateA, dateB){
  return dateA.getMonth() === dateB.getMonth() && dateA.getDate() === dateB.getDate();
}

function getCelebrationIcon(ev){
  const key = `${ev.id || ""} ${ev.title || ""}`.toLocaleLowerCase("tr-TR");
  if (ev.celebrationIcon) return ev.celebrationIcon;
  if (key.includes("doğum") || key.includes("dogum")) return "🎂";
  if (key.includes("teklif") || key.includes("nişan") || key.includes("nisan")) return "💍";
  if (key.includes("nikâh") || key.includes("nikah")) return "🤍";
  if (key.includes("düğün") || key.includes("dugun")) return "✨";
  if (key.includes("tanış") || key.includes("tanis")) return "💞";
  return "❤️";
}

function getCelebrationTitle(ev, years){
  if (ev.celebrationTitle) return ev.celebrationTitle;

  const key = `${ev.id || ""} ${ev.title || ""}`.toLocaleLowerCase("tr-TR");
  if (key.includes("doğum") || key.includes("dogum")){
    return `${ev.title} kutlu olsun`;
  }

  if (years > 0){
    return `${years}. ${ev.title} yıl dönümümüz kutlu olsun`;
  }

  return `${ev.title} günümüz kutlu olsun`;
}

function getCelebrationMessage(ev, years){
  if (ev.celebrationMessage) return ev.celebrationMessage;

  const key = `${ev.id || ""} ${ev.title || ""}`.toLocaleLowerCase("tr-TR");
  if (key.includes("doğum") || key.includes("dogum")){
    return "Bugün sevgiyle, neşeyle ve en güzel anılarla hatırlanacak özel bir gün.";
  }

  if (years > 0){
    return `Bugün bu güzel hatıranın ${years}. yılı. İyi ki aynı hikâyenin içindeyiz.`;
  }

  return "Bugün bizim için özel bir gün. İyi ki var, iyi ki bizim hikâyemizin bir parçası.";
}

function createParticleLayer(parent){
  const icons = ["♡", "✦", "✨", "♥", "✧", "❦"];
  const positions = [
    [8,18,22,3.1,-.3], [18,74,18,3.7,-1.1], [82,16,20,3.4,-.7],
    [90,70,19,4.0,-1.6], [26,12,14,3.5,-2.0], [72,84,15,3.9,-.9],
    [10,52,14,4.4,-1.4], [88,42,16,3.8,-.5], [42,8,13,4.2,-1.8],
    [58,90,18,4.1,-1.2], [32,82,13,3.6,-.6], [68,10,16,4.0,-1.5]
  ];

  positions.forEach((p, i) => {
    const span = document.createElement("span");
    span.className = "celebrationParticle";
    span.textContent = icons[i % icons.length];
    span.style.setProperty("--x", `${p[0]}%`);
    span.style.setProperty("--y", `${p[1]}%`);
    span.style.setProperty("--s", `${p[2]}px`);
    span.style.setProperty("--d", `${p[3]}s`);
    span.style.setProperty("--delay", `${p[4]}s`);
    parent.appendChild(span);
  });
}


function createCelebrationFireworkLayer(parent){
  const layer = document.createElement("div");
  layer.className = "celebrationFireworkLayer";
  layer.setAttribute("aria-hidden", "true");
  parent.appendChild(layer);
  return layer;
}

function randomBetween(min, max){
  return min + Math.random() * (max - min);
}

function getCelebrationLayer(overlay){
  return overlay?.querySelector?.(".celebrationFireworkLayer") || null;
}

function createHeartFirework(layer, xPercent, yPercent, scale = 1, intensity = 1){
  if (!layer || !layer.isConnected) return;

  const firework = document.createElement("div");
  firework.className = "heartFirework heartFireworkMega";
  firework.style.setProperty("--fx", `${xPercent}%`);
  firework.style.setProperty("--fy", `${yPercent}%`);
  firework.style.setProperty("--fw-scale", String(scale));

  const core = document.createElement("span");
  core.className = "heartFireworkCore";
  firework.appendChild(core);

  const colors = [
    "#FFFFFF", "#FFF3B0", "#FFD166", "#FF9F1C",
    "#FF2D55", "#FF4FA3", "#FF7AA2", "#B517FF"
  ];
  const total = Math.round(104 * intensity);
  const spread = 8.2 * scale;

  for (let i = 0; i < total; i++){
    const t = (Math.PI * 2 * i) / total;

    // Kalp eğrisi: x=16sin³t, y=13cost-5cos2t-2cos3t-cos4t
    const hx = 16 * Math.pow(Math.sin(t), 3);
    const hy = -(13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t));

    const spark = document.createElement("span");
    spark.className = i % 5 === 0 ? "heartSpark heartSparkBig" : "heartSpark";
    spark.style.setProperty("--tx", `${hx * spread}px`);
    spark.style.setProperty("--ty", `${hy * spread}px`);
    spark.style.setProperty("--delay", `${(i % 12) * 0.010}s`);
    spark.style.setProperty("--spark", colors[i % colors.length]);
    spark.style.setProperty("--spark-size", `${Math.max(5.2, 10.4 * scale)}px`);
    firework.appendChild(spark);
  }

  // Kalp dışına dev altın/pembe şok halkası ve saçılan yıldızlar.
  const ringTotal = Math.round(46 * intensity);
  for (let i = 0; i < ringTotal; i++){
    const angle = (Math.PI * 2 * i) / ringTotal;
    const radius = randomBetween(112, 210) * scale;

    const spark = document.createElement("span");
    spark.className = i % 3 === 0 ? "heartSpark celebrationRingSpark celebrationRingSparkBig" : "heartSpark celebrationRingSpark";
    spark.style.setProperty("--tx", `${Math.cos(angle) * radius}px`);
    spark.style.setProperty("--ty", `${Math.sin(angle) * radius}px`);
    spark.style.setProperty("--delay", `${(i % 8) * 0.014}s`);
    spark.style.setProperty("--spark", colors[(i + 3) % colors.length]);
    spark.style.setProperty("--spark-size", `${Math.max(4.2, 8.8 * scale)}px`);
    firework.appendChild(spark);
  }

  const shock = document.createElement("span");
  shock.className = "celebrationShockwave";
  firework.appendChild(shock);

  layer.appendChild(firework);
  window.setTimeout(() => firework.remove(), 3600);
}


function createCelebrationRocket(overlay, targetX = randomBetween(14, 86), targetY = randomBetween(10, 58), scale = randomBetween(.75, 1.22)){
  const layer = getCelebrationLayer(overlay);
  if (!layer) return;

  const rect = layer.getBoundingClientRect();
  const startX = randomBetween(8, 92);
  const dx = (rect.width * (targetX - startX)) / 100;
  const dy = (rect.height * targetY / 100) - rect.height - 28;

  const rocket = document.createElement("span");
  rocket.className = "celebrationRocket";
  rocket.style.setProperty("--rsx", `${startX}%`);
  rocket.style.setProperty("--rdx", `${dx}px`);
  rocket.style.setProperty("--rdy", `${dy}px`);
  rocket.style.setProperty("--rocket-scale", String(scale));
  layer.appendChild(rocket);

  window.setTimeout(() => {
    rocket.remove();
    createHeartFirework(layer, targetX, targetY, scale, randomBetween(.92, 1.28));
    createScreenFlash(overlay);
  }, 780);

  window.setTimeout(() => rocket.remove(), 1200);
}

function createScreenFlash(overlay){
  if (!overlay || !overlay.isConnected) return;
  overlay.classList.remove("celebrationFlash");
  // Reflow: aynı class art arda geldiğinde animasyon tekrar başlasın.
  void overlay.offsetWidth;
  overlay.classList.add("celebrationFlash");
  window.setTimeout(() => overlay.classList.remove("celebrationFlash"), 260);
}

function createCelebrationLightTrails(overlay, amount = 5){
  const layer = getCelebrationLayer(overlay);
  if (!layer) return;

  for (let i = 0; i < amount; i++){
    const trail = document.createElement("span");
    trail.className = "celebrationLightTrail";
    trail.style.setProperty("--trail-top", `${randomBetween(18, 78)}%`);
    trail.style.setProperty("--trail-rot", `${randomBetween(-28, 28)}deg`);
    trail.style.setProperty("--trail-delay", `${randomBetween(0, .35)}s`);
    layer.appendChild(trail);
    window.setTimeout(() => trail.remove(), 3000);
  }
}

function createCelebrationVortex(overlay){
  const layer = getCelebrationLayer(overlay);
  if (!layer) return;

  for (let i = 0; i < 3; i++){
    const ring = document.createElement("span");
    ring.className = "celebrationVortexRing";
    ring.style.setProperty("--ring-size", `${randomBetween(340, 720)}px`);
    ring.style.setProperty("--ring-delay", `${i * .18}s`);
    ring.style.setProperty("--ring-rot", `${i % 2 ? -360 : 360}deg`);
    layer.appendChild(ring);
    window.setTimeout(() => ring.remove(), 5200);
  }
}

function createCelebrationConfetti(overlay, amount = 18){
  const layer = getCelebrationLayer(overlay);
  if (!layer) return;

  const pieces = ["♥", "♡", "❥", "💖", "💘", "✦", "✨", "✧", "❣", "◆"];
  for (let i = 0; i < amount; i++){
    const confetti = document.createElement("span");
    confetti.className = "celebrationConfetti";
    confetti.textContent = pieces[i % pieces.length];
    confetti.style.setProperty("--cx", `${randomBetween(3, 97)}%`);
    confetti.style.setProperty("--csize", `${randomBetween(16, 34)}px`);
    confetti.style.setProperty("--cdx", `${randomBetween(-58, 58)}px`);
    confetti.style.setProperty("--cdur", `${randomBetween(3.2, 6.2)}s`);
    confetti.style.setProperty("--crot", `${randomBetween(-220, 220)}deg`);
    confetti.style.setProperty("--cdelay", `${randomBetween(0, .7)}s`);
    layer.appendChild(confetti);

    window.setTimeout(() => confetti.remove(), 7800);
  }
}

function createMusicNotes(parent, options = {}){
  const notes = ["♪", "♫", "♬", "♩", "𝄞"];
  const count = options.count || 10;

  for (let i = 0; i < count; i++){
    const note = document.createElement("span");
    note.className = "celebrationMusicNote";
    note.textContent = notes[i % notes.length];
    note.style.setProperty("--nx", `${randomBetween(9, 91)}%`);
    note.style.setProperty("--ny", `${randomBetween(55, 86)}%`);
    note.style.setProperty("--ndx", `${randomBetween(-58, 58)}px`);
    note.style.setProperty("--ndy", `${randomBetween(-240, -120)}px`);
    note.style.setProperty("--note-delay", `${Math.round(randomBetween(0, 620))}ms`);
    parent.appendChild(note);
    window.setTimeout(() => note.remove(), 4200);
  }
}

function launchHeartFireworkShow(overlay, mode = "burst"){
  const layer = getCelebrationLayer(overlay);
  if (!layer) return;

  const grand = mode === "grand" || mode === "finale";
  const finale = mode === "finale";
  const bursts = grand ? [
    [50, 11, 1.82, 0, 1.35],
    [18, 18, 1.22, 120, 1.18],
    [82, 18, 1.22, 240, 1.18],
    [32, 32, 1.08, 360, 1.08],
    [68, 32, 1.08, 480, 1.08],
    [50, 42, .98, 610, 1.02],
    [14, 56, .84, 760, .94],
    [86, 56, .84, 900, .94],
    [28, 70, .72, 1040, .86],
    [72, 70, .72, 1180, .86],
    [50, 75, .66, 1320, .82]
  ] : [
    [50, 15, 1.42, 0, 1.12],
    [22, 28, 1.04, 160, 1.02],
    [78, 29, 1.04, 310, 1.02],
    [50, 43, .88, 460, .96],
    [15, 62, .72, 620, .86],
    [85, 62, .72, 780, .86]
  ];

  bursts.forEach(([x, y, scale, delay, intensity]) => {
    window.setTimeout(() => createHeartFirework(layer, x, y, scale, intensity), delay);
  });

  if (finale){
    createCelebrationVortex(overlay);
    createCelebrationLightTrails(overlay, 8);
  }

  createScreenFlash(overlay);
  createCelebrationConfetti(overlay, grand ? 54 : 30);
  createMusicNotes(overlay, { count: grand ? 16 : 9 });
}

function getCelebrationState(overlay){
  if (!overlay.__celebrationState){
    overlay.__celebrationState = {
      running:false,
      intervals:[],
      timeouts:[],
      endsAt:0
    };
  }
  return overlay.__celebrationState;
}

function clearCelebrationShow(overlay){
  const state = overlay.__celebrationState;
  if (!state) return;

  state.intervals.forEach(id => window.clearInterval(id));
  state.timeouts.forEach(id => window.clearTimeout(id));
  state.intervals = [];
  state.timeouts = [];
  state.running = false;
  state.endsAt = 0;
}

function finishCelebrationShow(overlay, actionButton){
  const state = getCelebrationState(overlay);
  if (!state.running) return;

  state.intervals.forEach(id => window.clearInterval(id));
  state.timeouts.forEach(id => window.clearTimeout(id));
  state.intervals = [];
  state.timeouts = [];
  state.running = false;
  state.endsAt = 0;

  overlay.classList.remove("celebrationMinuteShow", "celebrationDizzyShow");
  actionButton.textContent = "Tekrar Kutla ❤️";

  launchHeartFireworkShow(overlay, "finale");
  createMusicNotes(overlay, { count:12 });
}

function startMinuteCelebrationShow(overlay, actionButton){
  const state = getCelebrationState(overlay);

  if (state.running){
    // Kullanıcı tekrar dokunursa süreyi sıfırlamadan ekstra büyük patlama verir.
    launchHeartFireworkShow(overlay, "grand");
    createCelebrationVortex(overlay);
    createCelebrationLightTrails(overlay, 7);
    createCelebrationConfetti(overlay, 42);
    return;
  }

  state.running = true;
  state.endsAt = Date.now() + CELEBRATION_SHOW_DURATION_MS;
  overlay.classList.add("celebrating", "celebrationMinuteShow", "celebrationDizzyShow");
  actionButton.classList.add("celebrating");

  const updateCountdown = () => {
    const remaining = Math.max(0, Math.ceil((state.endsAt - Date.now()) / 1000));
    actionButton.textContent = `Kutlama sürüyor ❤️ ${remaining} sn`;
  };

  updateCountdown();

  // Başlangıç: bir anda sahneyi dolduran büyük giriş.
  launchHeartFireworkShow(overlay, "grand");
  createCelebrationVortex(overlay);
  createCelebrationLightTrails(overlay, 9);
  createCelebrationConfetti(overlay, 68);

  // Roketler aşağıdan çıkıp hedefte kalpli havai fişeğe dönüşür.
  state.intervals.push(window.setInterval(() => {
    createCelebrationRocket(
      overlay,
      randomBetween(10, 90),
      randomBetween(8, 62),
      randomBetween(.78, 1.48)
    );
  }, 430));

  // Aralarda doğrudan dev kalp patlamaları: ekran boş kalmasın.
  state.intervals.push(window.setInterval(() => {
    const layer = getCelebrationLayer(overlay);
    if (!layer) return;

    createHeartFirework(
      layer,
      randomBetween(10, 90),
      randomBetween(10, 72),
      randomBetween(.82, 1.68),
      randomBetween(.95, 1.38)
    );
  }, 760));

  // Baş döndürücü ışık çizgileri ve halka dönüşleri.
  state.intervals.push(window.setInterval(() => {
    createCelebrationLightTrails(overlay, 5);
    if (Math.random() > .38) createCelebrationVortex(overlay);
  }, 2200));

  // Sürekli kalp/confetti yağmuru.
  state.intervals.push(window.setInterval(() => {
    createCelebrationConfetti(overlay, 26);
  }, 620));

  // Müzik notaları daha sık ve daha büyük görünür.
  state.intervals.push(window.setInterval(() => {
    createMusicNotes(overlay, { count:10 });
  }, 980));

  // Her 10 saniyede büyük final dalgası.
  state.intervals.push(window.setInterval(() => {
    launchHeartFireworkShow(overlay, "grand");
  }, 10000));

  state.intervals.push(window.setInterval(() => {
    updateCountdown();
    if (Date.now() >= state.endsAt){
      finishCelebrationShow(overlay, actionButton);
    }
  }, 1000));

  state.timeouts.push(window.setTimeout(() => {
    finishCelebrationShow(overlay, actionButton);
  }, CELEBRATION_SHOW_DURATION_MS));
}

async function startCelebrationMusic(){
  const music = document.getElementById("bgMusic");
  if (!music) return false;

  music.volume = 0.72;

  if (music.paused){
    await music.play();
  }

  return true;
}

function stopCelebrationTapSideEffects(event){
  if (!event) return;
  event.preventDefault();
  event.stopPropagation();
}

function stopCelebrationBubble(event){
  if (!event) return;
  event.stopPropagation();
}

function showCelebrationIfToday(events){
  const now = new Date();
  const todaysEvents = events
    .map(ev => ({ ev, base: new Date(ev.date) }))
    .filter(item => !Number.isNaN(item.base.getTime()) && isSameMonthDay(item.base, now));

  if (!todaysEvents.length) return false;

  const primary = todaysEvents[0];
  const years = Math.max(0, now.getFullYear() - primary.base.getFullYear());
  const overlay = document.createElement("div");
  overlay.className = "celebrationOverlay active";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Özel gün kutlaması");

  createParticleLayer(overlay);
  createCelebrationFireworkLayer(overlay);

  const card = document.createElement("div");
  card.className = "celebrationCard";
  card.addEventListener("click", e => e.stopPropagation());

  const halo = document.createElement("div");
  halo.className = "celebrationHalo";
  halo.setAttribute("aria-hidden", "true");

  const icon = document.createElement("div");
  icon.className = "celebrationIcon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = getCelebrationIcon(primary.ev);

  const eyebrow = document.createElement("div");
  eyebrow.className = "celebrationEyebrow";
  eyebrow.textContent = todaysEvents.length > 1 ? "Bugünün özel anları" : "Bugün özel bir gün";

  const title = document.createElement("div");
  title.className = "celebrationTitle";
  title.textContent = getCelebrationTitle(primary.ev, years);

  const text = document.createElement("div");
  text.className = "celebrationText";
  text.textContent = getCelebrationMessage(primary.ev, years);

  const meta = document.createElement("div");
  meta.className = "celebrationMeta";
  meta.textContent = `${fmtDate(primary.base)} tarihinden bugüne ${years} yıl geçti.`;

  card.append(halo, icon, eyebrow, title, text, meta);

  if (todaysEvents.length > 1){
    const eventList = document.createElement("div");
    eventList.className = "celebrationEvents";
    todaysEvents.forEach(({ev, base}) => {
      const mini = document.createElement("div");
      mini.className = "celebrationEventMini";
      mini.textContent = `${getCelebrationIcon(ev)} ${ev.title} · ${now.getFullYear() - base.getFullYear()}. yıl`;
      eventList.appendChild(mini);
    });
    card.appendChild(eventList);
  }

  const close = document.createElement("button");
  close.type = "button";
  close.className = "celebrationClose";
  close.textContent = "Bugünü Kutla";

  let celebrationStarted = false;
  let celebrationClosing = false;

  function removeOverlay(){
    if (celebrationClosing) return;
    celebrationClosing = true;
    // Çarpıya basınca sahne kapanır; müzik özellikle durdurulmaz.
    clearCelebrationShow(overlay);
    overlay.remove();
    unlockPageForCelebration();
  }

  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = "celebrationDismiss";
  dismiss.setAttribute("aria-label", "Kutlama ekranını kapat");
  dismiss.textContent = "×";
  dismiss.addEventListener("click", (e) => {
    stopCelebrationTapSideEffects(e);
    removeOverlay();
  });

  close.addEventListener("pointerdown", stopCelebrationBubble);
  close.addEventListener("touchstart", stopCelebrationBubble, { passive:true });
  close.addEventListener("click", async (e) => {
    stopCelebrationTapSideEffects(e);
    lockCelebrationViewportHeight();

    if (!celebrationStarted){
      celebrationStarted = true;

      try{
        await startCelebrationMusic();
      } catch (err){
        console.log("Kutlama müziği başlatılamadı:", err);
      }
    }

    startMinuteCelebrationShow(overlay, close);
  });

  overlay.addEventListener("click", (e) => {
    // Kutlama sırasında yanlışlıkla arka ekranın açılıp kapanmasını önler.
    stopCelebrationTapSideEffects(e);
  });
  window.addEventListener("keydown", function onKey(e){
    if (e.key === "Escape"){
      window.removeEventListener("keydown", onKey);
      removeOverlay();
    }
  });

  card.appendChild(close);
  overlay.append(dismiss, card);
  document.body.appendChild(overlay);

  // İlk açılışta önce overlay eklenir, sonra arka sayfa kilitlenir.
  // Böylece mobil tarayıcıda arka ekran/beyaz alan bir anlığına görünmez.
  lockPageForCelebration();

  return true;
}

/* MUSIC (iOS: user gesture required) */
function setupMusic(){
  const music = document.getElementById("bgMusic");
  const btn = document.getElementById("musicBtn");

  if (!music || !btn) return;

  music.volume = 0.6;

  function syncMusicUI(){
    if (music.paused){
      btn.textContent = "🎵 Müzik Başlat";
      btn.classList.remove("playing");
      document.querySelectorAll(".heart").forEach(h=>{
        h.style.filter =
          "drop-shadow(0 10px 22px rgba(0,0,0,.55)) drop-shadow(0 0 14px rgba(255,45,85,.18))";
      });
    } else {
      btn.textContent = "⏸ Müzik Durdur";
      btn.classList.add("playing");
      document.querySelectorAll(".heart").forEach(h=>{
        h.style.filter =
          "drop-shadow(0 10px 22px rgba(0,0,0,.55)) drop-shadow(0 0 18px rgba(255,45,85,.38))";
      });
    }
  }

  btn.addEventListener("click", async () => {
    try{
      if (music.paused){
        await music.play();
      } else {
        music.pause();
      }
      syncMusicUI();
    } catch (e){
      console.log("Müzik başlatılamadı:", e);
    }
  });

  music.addEventListener("play", syncMusicUI);
  music.addEventListener("pause", syncMusicUI);
  music.addEventListener("ended", syncMusicUI);
  syncMusicUI();
}

function finishAppBoot(){
  document.body.classList.remove("appBooting");
}

(async function main(){
  syncAppViewportHeight();

  try{
    const events = await loadEvents();

    // Akif’in altına Baba ve Anne doğum gününü koymak için:
    // dates.json zaten o sırada verildi; yine de sıralamayı tarihe göre yapıyoruz.
    events.sort((a,b)=> new Date(a.date) - new Date(b.date));

    render(events);
    tick(events);
    setupMusic();
    showCelebrationIfToday(events);
    finishAppBoot();
    registerServiceWorker();
    checkForAppUpdate();

    setInterval(() => tick(events), 1000);
  } catch (error){
    console.log("Uygulama başlatılamadı:", error);
    finishAppBoot();
  }
})();
