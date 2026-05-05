const pad2 = n => String(n).padStart(2, "0");

function fmtDate(d){
  return `${pad2(d.getDate())}.${pad2(d.getMonth()+1)}.${d.getFullYear()}`;
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
        <div class="itemName">${ev.title}</div>
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

      ${ev.message ? `<div class="pill">${ev.message}</div>` : ""}

      <div id="since-${ev.id}" class="big">—</div>
      <div id="next-${ev.id}" class="pill">Bir sonraki yıldönümüne: —</div>
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

  setInterval(() => tick(events), 1000);

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(()=>{});
    });
  }
})();