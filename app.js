const pad2 = n => String(n).padStart(2, "0");

function fmtDate(d){
  return `${pad2(d.getDate())}.${pad2(d.getMonth()+1)}.${d.getFullYear()}`;
}

// Takvimsel fark (yıl-ay-gün-saat-dk-sn)
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

function setTopClock(){
  const now = new Date();
  document.getElementById("today").textContent =
    now.toLocaleDateString("tr-TR",{ weekday:"long", day:"numeric", month:"long", year:"numeric" });
  document.getElementById("now").textContent =
    `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;
}

async function loadEvents(){
  const res = await fetch("./dates.json", { cache: "no-store" });
  if (!res.ok) throw new Error("dates.json okunamadı");
  const data = await res.json();
  return (data.events || []);
}

function photoPath(id){
  return `./photos/${id}.jpg`;
}

function escapeHTML(s){
  return String(s)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}

function makePlaceholderSVG(title){
  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="900" height="900">
    <defs>
      <radialGradient id="g" cx="35%" cy="25%" r="85%">
        <stop offset="0" stop-color="#1a1a22"/>
        <stop offset="1" stop-color="#07070A"/>
      </radialGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
      font-family="-apple-system,Segoe UI,Arial" font-size="46" fill="rgba(255,255,255,.82)" font-weight="800">${escapeHTML(title)}</text>
  </svg>`;
}

function renderList(events){
  const list = document.getElementById("list");
  list.innerHTML = "";

  for (const ev of events){
    const d = new Date(ev.date);
    const src = photoPath(ev.id);

    const el = document.createElement("div");
    el.className = "item";

    el.innerHTML = `
      <div class="itemTop">
        <div class="itemName">${escapeHTML(ev.title)}</div>
        <div class="itemDate">${fmtDate(d)}</div>
      </div>

      <div class="thumbRow">
        <div class="thumb" data-photo="${src}" data-title="${escapeHTML(ev.title)}">
          <img src="${src}" alt="${escapeHTML(ev.title)}"
               onerror="this.onerror=null; this.src='data:image/svg+xml;utf8,${encodeURIComponent(makePlaceholderSVG(ev.title))}'">
        </div>
      </div>

      ${ev.message ? `<div class="loveMsg">${escapeHTML(ev.message)}</div>` : ""}

      <div id="since-${ev.id}" class="big">—</div>

      <div class="sub">
        <div id="next-${ev.id}" class="pill">Bir sonraki yıldönümüne: —</div>
        <div id="age-${ev.id}" class="pill" style="display:${ev.isBirthday ? "inline-flex":"none"}">Yaş: —</div>
      </div>
    `;

    list.appendChild(el);
  }
}

function tick(events){
  const now = new Date();

  for (const ev of events){
    const base = new Date(ev.date);

    const r = diffCalendar(base, now);
    const sinceEl = document.getElementById(`since-${ev.id}`);
    if (sinceEl){
      sinceEl.textContent = `${r.y} yıl ${r.m} ay ${r.d} gün ${r.h} sa ${r.min} dk ${r.s} sn`;
    }

    const next = nextAnniversary(base, now);
    const left = diffCalendar(now, next);
    const nextEl = document.getElementById(`next-${ev.id}`);
    if (nextEl){
      nextEl.textContent = `Bir sonraki yıldönümüne: ${left.y} yıl ${left.m} ay ${left.d} gün ${left.h} sa ${left.min} dk ${left.s} sn`;
    }

    if (ev.isBirthday){
      const ageEl = document.getElementById(`age-${ev.id}`);
      if (ageEl){
        ageEl.textContent = `Yaş: ${r.y} yıl ${r.m} ay ${r.d} gün`;
      }
    }
  }
}

/* Modal */
const modal = document.getElementById("modal");
const modalImg = document.getElementById("modalImg");
const modalTitle = document.getElementById("modalTitle");
const closeBtn = document.getElementById("closeBtn");

function openModal(src, title){
  modal.classList.add("open");
  modal.setAttribute("aria-hidden","false");
  modalImg.src = src;
  modalImg.alt = title || "Fotoğraf";
  modalTitle.textContent = title || "";
}

function closeModal(){
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden","true");
  modalImg.src = "";
}

closeBtn.addEventListener("click", closeModal);
modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

document.addEventListener("click", (e) => {
  const thumb = e.target.closest?.(".thumb");
  if (!thumb) return;
  openModal(thumb.dataset.photo, thumb.dataset.title);
});

/* Music (iOS: user gesture required) */
const music = document.getElementById("bgMusic");
const musicBtn = document.getElementById("musicBtn");
let playingMusic = false;

if (music) music.volume = 0.55;

if (musicBtn && music){
  musicBtn.addEventListener("click", async () => {
    try{
      if (!playingMusic){
        await music.play();
        playingMusic = true;
        musicBtn.textContent = "⏸ Durdur";
      } else {
        music.pause();
        playingMusic = false;
        musicBtn.textContent = "🎵 Müzik";
      }
    } catch (e){
      console.log("Müzik başlatılamadı:", e);
    }
  });
}

(async function main(){
  const events = await loadEvents();
  events.sort((a,b)=> new Date(a.date) - new Date(b.date));

  renderList(events);
  setTopClock();
  tick(events);

  setInterval(() => {
    setTopClock();
    tick(events);
  }, 1000);

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(()=>{});
    });
  }
})();
