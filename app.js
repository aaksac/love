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

function showCelebrationIfToday(events){
  const now = new Date();
  const todaysEvents = events
    .map(ev => ({ ev, base: new Date(ev.date) }))
    .filter(item => !Number.isNaN(item.base.getTime()) && isSameMonthDay(item.base, now));

  if (!todaysEvents.length) return;

  const primary = todaysEvents[0];
  const years = Math.max(0, now.getFullYear() - primary.base.getFullYear());
  const overlay = document.createElement("div");
  overlay.className = "celebrationOverlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Özel gün kutlaması");

  createParticleLayer(overlay);

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

  function removeOverlay(){
    overlay.classList.remove("active");
    window.setTimeout(() => overlay.remove(), 260);
  }

  close.addEventListener("click", removeOverlay);
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
    close.focus({ preventScroll:true });
  });
}

/* MUSIC (iOS: user gesture required) */
function setupMusic(){
  const music = document.getElementById("bgMusic");
  const btn = document.getElementById("musicBtn");
  let playing = false;

  if (!music || !btn) return;

  music.volume = 0.6;

  btn.addEventListener("click", async () => {
    try{
      if (!playing){
        await music.play();
        playing = true;
        btn.textContent = "⏸ Müzik Durdur";
        btn.classList.add("playing");

        document.querySelectorAll(".heart").forEach(h=>{
          h.style.filter =
            "drop-shadow(0 10px 22px rgba(0,0,0,.55)) drop-shadow(0 0 18px rgba(255,45,85,.38))";
        });
      } else {
        music.pause();
        playing = false;
        btn.textContent = "🎵 Müzik Başlat";
        btn.classList.remove("playing");

        document.querySelectorAll(".heart").forEach(h=>{
          h.style.filter =
            "drop-shadow(0 10px 22px rgba(0,0,0,.55)) drop-shadow(0 0 14px rgba(255,45,85,.18))";
        });
      }
    } catch (e){
      console.log("Müzik başlatılamadı:", e);
    }
  });
}

(async function main(){
  const events = await loadEvents();

  // Akif’in altına Baba ve Anne doğum gününü koymak için:
  // dates.json zaten o sırada verildi; yine de sıralamayı tarihe göre yapıyoruz.
  events.sort((a,b)=> new Date(a.date) - new Date(b.date));

  render(events);
  tick(events);
  setupMusic();
  showCelebrationIfToday(events);

  setInterval(() => tick(events), 1000);

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(()=>{});
    });
  }
})();
