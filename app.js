const APP_VERSION = "1.0.4";
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

function syncAppViewportHeight(){
  const viewportHeight = window.visualViewport?.height || window.innerHeight || document.documentElement.clientHeight;
  document.documentElement.style.setProperty("--app-viewport-height", `${Math.round(viewportHeight)}px`);
}

function startViewportSync(){
  syncAppViewportHeight();

  if (celebrationViewportCleanup) return;

  const target = window.visualViewport || window;
  const handler = () => requestAnimationFrame(syncAppViewportHeight);

  target.addEventListener("resize", handler, { passive:true });
  target.addEventListener("scroll", handler, { passive:true });
  window.addEventListener("orientationchange", handler, { passive:true });

  celebrationViewportCleanup = () => {
    target.removeEventListener("resize", handler);
    target.removeEventListener("scroll", handler);
    window.removeEventListener("orientationchange", handler);
    celebrationViewportCleanup = null;
  };
}

function stopViewportSync(){
  if (celebrationViewportCleanup) celebrationViewportCleanup();
}

function lockPageForCelebration(){
  celebrationScrollY = window.scrollY || document.documentElement.scrollTop || 0;
  startViewportSync();

  document.documentElement.classList.add("celebration-lock");
  document.body.classList.add("celebration-lock");

  Object.assign(document.body.style, {
    position:"fixed",
    top:`-${celebrationScrollY}px`,
    left:"0",
    right:"0",
    width:"100%",
    overflow:"hidden"
  });
}

function unlockPageForCelebration(){
  document.documentElement.classList.remove("celebration-lock");
  document.body.classList.remove("celebration-lock");

  Object.assign(document.body.style, {
    position:"",
    top:"",
    left:"",
    right:"",
    width:"",
    overflow:""
  });

  window.scrollTo(0, celebrationScrollY);
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

function createHeartFirework(layer, xPercent, yPercent, scale = 1){
  if (!layer) return;

  const firework = document.createElement("div");
  firework.className = "heartFirework";
  firework.style.setProperty("--fx", `${xPercent}%`);
  firework.style.setProperty("--fy", `${yPercent}%`);
  firework.style.setProperty("--fw-scale", String(scale));

  const core = document.createElement("span");
  core.className = "heartFireworkCore";
  firework.appendChild(core);

  const colors = ["#FFF6D8", "#FFD166", "#FF5C8A", "#FF2D55", "#FF9FB2"];
  const total = 46;

  for (let i = 0; i < total; i++){
    const t = (Math.PI * 2 * i) / total;

    // Kalp eğrisi: x=16sin³t, y=13cost-5cos2t-2cos3t-cos4t
    const hx = 16 * Math.pow(Math.sin(t), 3);
    const hy = -(13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t));

    const spark = document.createElement("span");
    spark.className = "heartSpark";
    spark.style.setProperty("--tx", `${hx * 4.8 * scale}px`);
    spark.style.setProperty("--ty", `${hy * 4.8 * scale}px`);
    spark.style.setProperty("--delay", `${(i % 7) * 0.012}s`);
    spark.style.setProperty("--spark", colors[i % colors.length]);
    spark.style.setProperty("--spark-size", `${Math.max(3.5, 6.5 * scale)}px`);
    firework.appendChild(spark);
  }

  layer.appendChild(firework);
  window.setTimeout(() => firework.remove(), 1900);
}

function createMusicNotes(parent){
  const notes = ["♪", "♫", "♬", "♩", "𝄞"];
  const positions = [
    [12,72,-34,-96,0], [22,58,-18,-118,90], [78,62,24,-122,160],
    [88,74,34,-106,240], [15,38,-30,-86,320], [84,38,30,-88,400]
  ];

  positions.forEach((p, i) => {
    const note = document.createElement("span");
    note.className = "celebrationMusicNote";
    note.textContent = notes[i % notes.length];
    note.style.setProperty("--nx", `${p[0]}%`);
    note.style.setProperty("--ny", `${p[1]}%`);
    note.style.setProperty("--ndx", `${p[2]}px`);
    note.style.setProperty("--ndy", `${p[3]}px`);
    note.style.setProperty("--note-delay", `${p[4]}ms`);
    parent.appendChild(note);
    window.setTimeout(() => note.remove(), 2300 + p[4]);
  });
}

function launchHeartFireworkShow(overlay){
  const layer = overlay.querySelector(".celebrationFireworkLayer");
  const bursts = [
    [50, 17, 1.18, 0],
    [22, 30, .82, 260],
    [78, 31, .84, 520],
    [50, 42, .62, 850],
    [14, 63, .54, 1100],
    [86, 64, .54, 1320]
  ];

  bursts.forEach(([x, y, scale, delay]) => {
    window.setTimeout(() => createHeartFirework(layer, x, y, scale), delay);
  });
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

function showCelebrationIfToday(events){
  const now = new Date();
  const todaysEvents = events
    .map(ev => ({ ev, base: new Date(ev.date) }))
    .filter(item => !Number.isNaN(item.base.getTime()) && isSameMonthDay(item.base, now));

  if (!todaysEvents.length) return;

  lockPageForCelebration();

  const primary = todaysEvents[0];
  const years = Math.max(0, now.getFullYear() - primary.base.getFullYear());
  const overlay = document.createElement("div");
  overlay.className = "celebrationOverlay";
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
    overlay.classList.remove("active");
    window.setTimeout(() => {
      overlay.remove();
      unlockPageForCelebration();
    }, 260);
  }

  close.addEventListener("click", async (e) => {
    e.stopPropagation();

    overlay.classList.add("celebrating");
    createMusicNotes(overlay);
    launchHeartFireworkShow(overlay);

    if (!celebrationStarted){
      celebrationStarted = true;
      close.classList.add("celebrating");
      close.textContent = "Kutlama Başladı ❤️";

      try{
        await startCelebrationMusic();
      } catch (err){
        console.log("Kutlama müziği başlatılamadı:", err);
      }

      window.setTimeout(() => {
        close.textContent = "Tekrar Kutla ❤️";
      }, 1800);
    }
  });

  overlay.addEventListener("click", removeOverlay);
  window.addEventListener("keydown", function onKey(e){
    if (e.key === "Escape"){
      window.removeEventListener("keydown", onKey);
      removeOverlay();
    }
  });

  card.appendChild(close);
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  requestAnimationFrame(() => {
    overlay.classList.add("active");
  });
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

(async function main(){
  syncAppViewportHeight();
  const events = await loadEvents();

  // Akif’in altına Baba ve Anne doğum gününü koymak için:
  // dates.json zaten o sırada verildi; yine de sıralamayı tarihe göre yapıyoruz.
  events.sort((a,b)=> new Date(a.date) - new Date(b.date));

  render(events);
  tick(events);
  setupMusic();
  showCelebrationIfToday(events);
  registerServiceWorker();
  checkForAppUpdate();

  setInterval(() => tick(events), 1000);
})();
