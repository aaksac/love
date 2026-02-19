const pad = n => String(n).padStart(2,"0");

function fmtDate(d){
  return `${pad(d.getDate())}.${pad(d.getMonth()+1)}.${d.getFullYear()}`;
}

function diffCalendar(start,end){
  let y=end.getFullYear()-start.getFullYear();
  let m=end.getMonth()-start.getMonth();
  let d=end.getDate()-start.getDate();
  let h=end.getHours()-start.getHours();
  let min=end.getMinutes()-start.getMinutes();
  let s=end.getSeconds()-start.getSeconds();

  if(s<0){s+=60;min--}
  if(min<0){min+=60;h--}
  if(h<0){h+=24;d--}
  if(d<0){
    const pm=new Date(end.getFullYear(),end.getMonth(),0);
    d+=pm.getDate();m--;
  }
  if(m<0){m+=12;y--}
  return {y,m,d,h,min,s};
}

async function loadEvents(){
  const res=await fetch("./dates.json",{cache:"no-store"});
  const data=await res.json();
  return data.events||[];
}

function render(events){
  const list=document.getElementById("list");
  list.innerHTML="";

  events.forEach(ev=>{
    const d=new Date(ev.date);

    const el=document.createElement("div");
    el.className="item";

    el.innerHTML=`
      <div class="itemTop">
        <div class="itemName">${ev.title}</div>
        <div class="itemDate">${fmtDate(d)}</div>
      </div>

      <div class="centerHeart">
        <svg class="heart" viewBox="0 0 24 24">
          <path fill="#FF2D55"
            d="M12 21s-7.2-4.6-9.6-8.6C.6 9 2.1 5.9 5.3 5.1c1.8-.4 3.6.2 4.7 1.6
               1.1-1.4 2.9-2 4.7-1.6 3.2.8 4.7 3.9 2.9 7.3C19.2 16.4 12 21 12 21z"/>
        </svg>
      </div>

      ${ev.message?`<div class="pill">${ev.message}</div>`:""}

      <div id="since-${ev.id}" class="big">—</div>
      <div id="next-${ev.id}" class="pill">Bir sonraki yıldönümüne: —</div>
    `;

    list.appendChild(el);
  });
}

function tick(events){
  const now=new Date();
  events.forEach(ev=>{
    const base=new Date(ev.date);

    const r=diffCalendar(base,now);
    document.getElementById(`since-${ev.id}`).textContent=
      `${r.y}y ${r.m}a ${r.d}g ${r.h}s ${r.min}dk ${r.s}sn`;

    let next=new Date(now.getFullYear(),base.getMonth(),base.getDate());
    if(next<=now) next=new Date(now.getFullYear()+1,base.getMonth(),base.getDate());

    const left=diffCalendar(now,next);
    document.getElementById(`next-${ev.id}`).textContent=
      `Bir sonraki yıldönümüne: ${left.y}y ${left.m}a ${left.d}g ${left.h}s ${left.min}dk ${left.s}sn`;
  });
}

(async function(){
  const events=await loadEvents();
  events.sort((a,b)=>new Date(a.date)-new Date(b.date));
  render(events);
  tick(events);
  setInterval(()=>tick(events),1000);
})();
