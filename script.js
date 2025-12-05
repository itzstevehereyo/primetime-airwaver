console.log("Primetime Airwaver enhanced booting...");

// -------------------- state --------------------
let shows = []; // {id, name, type, genre, quality, meta:{...}, episodes:[], parentId, archived:false}
let schedule = []; // {id, showId, day (0-6), hour (0-23), minute(0..59), epIndex?}
let renewRequests = []; // array of showIds wanting renewal
let archived = []; // array of showIds
let networkScore = 50.0;

const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

// UI refs
const showNameInput = document.getElementById("show-name");
const showTypeSelect = document.getElementById("show-type");
const showGenreSelect = document.getElementById("show-genre");
const addShowBtn = document.getElementById("add-show-btn");

const movieConfig = document.getElementById("movie-config");
const seriesConfig = document.getElementById("series-config");
const movieParent = document.getElementById("movie-parent");
const createSequelBtn = document.getElementById("create-sequel-btn");

const seriesShowrunner = document.getElementById("series-showrunner");
const seriesSeasons = document.getElementById("series-seasons");
const seriesEpisodes = document.getElementById("series-episodes");
const generateEpisodesBtn = document.getElementById("generate-episodes-btn");
const addEpisodeManualBtn = document.getElementById("add-episode-manual-btn");
const episodesList = document.getElementById("episodes-list");

const poolList = document.getElementById("pool-list");
const timetableEl = document.getElementById("timetable");
const scheduledFlat = document.getElementById("scheduled-flat");
const renewRequestsDiv = document.getElementById("renew-requests");
const archivedList = document.getElementById("archived-list");
const logDiv = document.getElementById("log");
const networkScoreSpan = document.getElementById("network-score");
const lastAir = document.getElementById("last-air");

const toggleAutoBtn = document.getElementById("toggle-auto");
const airNowBtn = document.getElementById("air-now-btn");
const clearWeekBtn = document.getElementById("clear-week-btn");

let autoAir = true;
let autoInterval = null;

// -------------------- helpers --------------------
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, (m)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }
function log(msg){
  const d = document.createElement('div');
  d.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  logDiv.prepend(d);
}
function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }

// -------------------- sample data + seeds --------------------
(function seed(){
  // small demo shows if empty
  if(!localStorage.getItem('primetime_demo')) {
    const s1 = createShowObject("Morning Headlines","news","Newsroom", { anchors: "A. Tan" });
    const s2 = createShowObject("Laugh Break","comedy","talkshow", { host: "K. Lee" });
    const s3 = createShowObject("My Little Series","series","Kids", { showrunner: "S. Austin" });
    // create episodes for series
    s3.episodes = generateEpisodeArray(1,6);
    s1.quality = 3.8; s2.quality = 4.1; s3.quality = 3.6;
    shows.push(s1,s2,s3);
    localStorage.setItem('primetime_demo','1');
  }
})();

// -------------------- show factory --------------------
function createShowObject(name, type, genre, meta={}) {
  const q = Math.round((Math.random()*3 + 2.2)*10)/10; // 2.2..5.2 clamp later
  return {
    id: uid(), name, type, genre, quality: clamp(q,1,5),
    meta, episodes: [], parentId: null, archived:false
  };
}

// -------------------- UI wiring --------------------
showTypeSelect.addEventListener('change', () => {
  const t = showTypeSelect.value;
  movieConfig.classList.toggle('hidden', t !== 'movie');
  seriesConfig.classList.toggle('hidden', t !== 'series');
  rebuildMovieParentOptions();
});
function rebuildMovieParentOptions(){
  movieParent.innerHTML = "<option value=''>(none)</option>";
  shows.filter(s=>s.type==='movie').forEach(m => {
    const o = document.createElement('option'); o.value = m.id; o.textContent = m.name; movieParent.appendChild(o);
  });
}

addShowBtn.addEventListener('click', () => {
  const name = showNameInput.value.trim();
  const type = showTypeSelect.value;
  const genre = showGenreSelect.value;
  if(!name) return alert("Put a title first.");
  const obj = createShowObject(name,type,genre);
  if(type==='movie'){
    obj.meta.director = document.getElementById('movie-director').value || '';
    obj.meta.cinematographer = document.getElementById('movie-cinematographer').value || '';
    obj.meta.writer = document.getElementById('movie-writer').value || '';
    obj.meta.actors = (document.getElementById('movie-actors').value || '').split(',').map(s=>s.trim()).filter(Boolean);
    const pid = movieParent.value; if(pid) obj.parentId = pid;
  }
  if(type==='series'){
    obj.meta.showrunner = seriesShowrunner.value || '';
    // episodes must be generated or added
    // user may have generated via button; if none, default to 6 episodes
    if(obj.episodes.length===0){
      obj.episodes = generateEpisodeArray(1, Number(seriesEpisodes.value || 6));
    }
  }
  shows.push(obj);
  showNameInput.value='';
  populatePool();
  rebuildMovieParentOptions();
  log(`Created ${type.toUpperCase()} "${obj.name}"`);
});

// Episode generation + UI
generateEpisodesBtn.addEventListener('click', () => {
  const count = Number(seriesEpisodes.value) || 6;
  const seasons = Number(seriesSeasons.value) || 1;
  // create episodes for season 1 only for simplicity; episodes structure: {title, crew:{director,..},aired:false}
  const eps = generateEpisodeArray(seasons, count);
  // attach to a temporary buffer. We'll show them and allow attach to the next created series.
  // For UX simplicity, if a series is selected in pool and it's a series, we attach directly to it.
  const target = shows.find(s => s.type==='series' && s.name === showNameInput.value.trim());
  if(target){ target.episodes = eps; log(`Generated ${eps.length} episodes attached to "${target.name}"`); populateEpisodesUI(target); populatePool(); return; }
  // else show them as preview; store on window.tempEpisodes
  window.tempEpisodes = eps;
  episodesList.innerHTML = '';
  eps.forEach((ep, idx) => {
    const div = document.createElement('div'); div.className='ep';
    div.innerHTML = `<div><strong>Ep ${idx+1}:</strong> ${escapeHtml(ep.title)}</div><div><button class="secondary" data-idx="${idx}" onclick="attachTempEpisode(${idx})">Attach</button></div>`;
    episodesList.appendChild(div);
  });
  log(`Generated ${eps.length} episodes (preview).`);
});

addEpisodeManualBtn.addEventListener('click', () => {
  const title = prompt("Episode title:");
  if(!title) return;
  const ep = { title, crew: { director: '', cinematographer:'', guestActors:[] }, aired:false };
  // attach to temp or to a selected series if matching name
  if(window.tempEpisodes) window.tempEpisodes.push(ep);
  else {
    // find a series with same name as input
    const target = shows.find(s=>s.type==='series' && s.name===showNameInput.value.trim());
    if(target){ target.episodes.push(ep); populateEpisodesUI(target); }
    else {
      window.tempEpisodes = [ep];
      episodesList.innerHTML = `<div class="ep">Preview manual ep: ${escapeHtml(title)} <button class="secondary" onclick="attachTempEpisode(0)">Attach</button></div>`;
    }
  }
  log("Manual episode created (preview).");
});

window.attachTempEpisode = function(idx){
  // attach tempEpisodes[idx] to a series with name in input, or to first series
  const name = showNameInput.value.trim();
  let target = shows.find(s=>s.type==='series' && s.name===name);
  if(!target) target = shows.find(s=>s.type==='series');
  if(!target) return alert("No series found to attach to. Create it first.");
  const ep = (window.tempEpisodes || [])[idx];
  if(!ep) return alert("No temp episode found.");
  target.episodes.push(ep);
  populateEpisodesUI(target);
  populatePool();
  log(`Attached episode "${ep.title}" to series "${target.name}"`);
};

// build a small episode list for display when series exist in pool
function populateEpisodesUI(series){
  episodesList.innerHTML = '';
  if(!series) return;
  series.episodes.forEach((ep, i) => {
    const el = document.createElement('div'); el.className='ep';
    el.innerHTML = `<div><strong>Ep ${i+1}:</strong> ${escapeHtml(ep.title)}</div>
      <div><button class="secondary" onclick='editEpisode("${series.id}",${i})'>Edit</button></div>`;
    episodesList.appendChild(el);
  });
}
window.editEpisode = function(seriesId, idx){
  const series = shows.find(s=>s.id===seriesId); if(!series) return;
  const ep = series.episodes[idx];
  const newTitle = prompt("Episode title:", ep.title); if(newTitle) ep.title = newTitle;
  // simple crew editing prompt
  const director = prompt("Director:", ep.crew?.director || '');
  if(typeof director === 'string') { ep.crew = ep.crew || {}; ep.crew.director = director; }
  populateEpisodesUI(series); populatePool();
};

// -------------------- episode name generator --------------------
function randomEpisodeTitle(){
  const wordsA = ["Secret","Midnight","Return","Last","First","Lost","Magic","Final","Broken","Hidden","Neon","Quiet","Burning","Crystal"];
  const wordsB = ["Promise","Sky","Day","Hour","Trail","City","Song","Heart","Game","Light","Echo","Signal","Memory"];
  return `${wordsA[Math.floor(Math.random()*wordsA.length)]} ${wordsB[Math.floor(Math.random()*wordsB.length)]}`;
}
function generateEpisodeArray(season, count){
  const arr = [];
  for(let i=0;i<count;i++){
    arr.push({ title: `${randomEpisodeTitle()}`, crew:{ director: '', cinematographer: '', guestActors:[] }, aired:false });
  }
  return arr;
}

// -------------------- pool + scheduled UI --------------------
function populatePool(){
  poolList.innerHTML = '';
  if(shows.length===0) { poolList.innerHTML = "<li class='muted'>No shows yet</li>"; return; }
  shows.filter(s=>!s.archived).forEach(s => {
    const li = document.createElement('li');
    li.draggable = true; li.dataset.id = s.id;
    li.innerHTML = `<div><strong>${escapeHtml(s.name)}</strong> <span class="badge">${escapeHtml(s.type)}</span>
      <div class="muted small">Genre: ${escapeHtml(s.genre)} • Q:${s.quality.toFixed(1)}</div>
      ${s.type==='series' ? `<div class="muted small">Episodes: ${s.episodes.length}</div>` : ''}</div>
      <div>
        <button class="secondary" onclick='scheduleFromPool("${s.id}")'>Quick Schedule</button>
        <button class="secondary" onclick='archiveShow("${s.id}")'>Archive</button>
      </div>`;
    li.addEventListener('dblclick', ()=>renameShow(s.id));
    // drag handlers
    li.addEventListener('dragstart', (e)=>{ e.dataTransfer.setData('text/show', s.id); li.classList.add('dragging'); });
    li.addEventListener('dragend', ()=>li.classList.remove('dragging'));
    poolList.appendChild(li);
  });
  rebuildMovieParentOptions();
  renderScheduledFlat();
}
window.renameShow = function(id){
  const s = shows.find(x=>x.id===id); if(!s) return;
  const nv = prompt("Rename show:", s.name);
  if(nv) { s.name = nv; populatePool(); renderTimetable(); renderScheduledFlat(); log(`Renamed show to "${nv}"`); }
};
window.archiveShow = function(id){
  const s = shows.find(x=>x.id===id); if(!s) return;
  s.archived = true; archived.push(id);
  populatePool(); renderArchived();
  log(`Archived "${s.name}"`);
};

// quick schedule: puts into next available hourly slot (today + next free hour)
window.scheduleFromPool = function(showId){
  const now = new Date();
  let day = now.getDay(), hour = now.getHours()+1;
  if(hour>23){ hour=0; day=(day+1)%7; }
  // if slot occupied, advance until free
  for(let i=0;i<7*24;i++){
    if(!slotHasSchedule(day,hour)){ break; }
    hour++; if(hour>23){ hour=0; day=(day+1)%7; }
  }
  schedule.push({ id: uid(), showId, day, hour, minute:0, epIndex: undefined });
  renderScheduledFlat(); renderTimetable(); log(`Quick scheduled "${shows.find(s=>s.id===showId).name}" at ${days[day]} ${hour}:00`);
};

// scheduled flat rendering
function renderScheduledFlat(){
  scheduledFlat.innerHTML='';
  if(schedule.length===0){ scheduledFlat.innerHTML="<li class='muted'>No scheduled slots</li>"; return; }
  schedule.forEach(s => {
    const show = shows.find(x=>x.id===s.showId);
    const li = document.createElement('li'); li.draggable=true; li.dataset.id=s.id;
    li.innerHTML = `<div>${escapeHtml(show?.name || 'Unknown')} — ${days[s.day]} ${s.hour}:00 ${show?.type==='series' ? '• '+escapeHtml(show.episodes[(s.epIndex||0)].title||'Ep') : ''}</div>
      <div><button class="secondary" onclick='unschedule("${s.id}")'>Remove</button></div>`;
    // dragging reorder by moving to other slot? We'll allow dragging flat to a slot by transferring schedule id
    li.addEventListener('dragstart', (e)=>{ e.dataTransfer.setData('text/sched', s.id); li.classList.add('dragging'); });
    li.addEventListener('dragend', ()=>li.classList.remove('dragging'));
    scheduledFlat.appendChild(li);
  });
}
window.unschedule = function(id){ schedule = schedule.filter(s=>s.id!==id); renderScheduledFlat(); renderTimetable(); log('Removed scheduled slot'); };

// -------------------- timetable rendering and drag/drop --------------------
function buildTimetableGrid(){
  timetableEl.innerHTML = '';
  // first column: hour labels, then 7 day columns
  const hourColHeader = document.createElement('div'); hourColHeader.className='hour-label'; hourColHeader.textContent='';
  timetableEl.appendChild(hourColHeader);
  // day headers
  for(let d=0; d<7; d++){
    const dh = document.createElement('div'); dh.className='hour-label'; dh.textContent = days[d];
    timetableEl.appendChild(dh);
  }
  // rows: 24 rows of 8 columns each (labels + 7 slots)
  for(let h=0; h<24; h++){
    // hour label cell
    const label = document.createElement('div'); label.className='hour-label'; label.textContent = `${String(h).padStart(2,'0')}:00`;
    timetableEl.appendChild(label);
    for(let d=0; d<7; d++){
      const slot = document.createElement('div'); slot.className='slot'; slot.dataset.day = d; slot.dataset.hour = h;
      slot.addEventListener('dragover', (e)=>{ e.preventDefault(); slot.classList.add('over'); });
      slot.addEventListener('dragleave', ()=>slot.classList.remove('over'));
      slot.addEventListener('drop', (e)=>{
        e.preventDefault(); slot.classList.remove('over');
        const showId = e.dataTransfer.getData('text/show');
        const schedId = e.dataTransfer.getData('text/sched');
        if(showId){
          // create schedule at this slot
          schedule.push({ id: uid(), showId, day: Number(slot.dataset.day), hour: Number(slot.dataset.hour), minute:0, epIndex: undefined });
          log(`Scheduled "${shows.find(s=>s.id===showId).name}" on ${days[slot.dataset.day]} ${slot.dataset.hour}:00`);
        } else if(schedId){
          // move existing schedule entry to this slot
          const sIdx = schedule.findIndex(s=>s.id===schedId);
          if(sIdx>=0){ schedule[sIdx].day = Number(slot.dataset.day); schedule[sIdx].hour = Number(slot.dataset.hour); log('Moved scheduled slot'); }
        }
        renderScheduledFlat(); renderTimetable();
      });
      slot.addEventListener('click', ()=>{ // quick inspect or remove
        const s = schedule.find(x=>x.day==slot.dataset.day && x.hour==slot.dataset.hour);
        if(s){ if(confirm('Remove scheduled show at this slot?')) { schedule = schedule.filter(x=>x.id!==s.id); renderScheduledFlat(); renderTimetable(); log('Removed scheduled slot'); } }
      });
      timetableEl.appendChild(slot);
    }
  }
}
function renderTimetable() {
    // Clear all slots first
    const slots = timetableEl.querySelectorAll('.slot');
    slots.forEach(slot => slot.innerHTML = '');

    schedule.forEach(s => {
        const selector = `.slot[data-day="${s.day}"][data-hour="${s.hour}"]`;
        const slot = timetableEl.querySelector(selector);
        if (!slot) return;

        const show = shows.find(x => x.id === s.showId);
        const title = show ? show.name : 'Unknown';

        // Build episode label (if series)
        let epLabel = "";
        if (show && show.type === "series") {
            const epIndex = typeof s.epIndex === "number" ? s.epIndex : 0;
            const ep = show.episodes[epIndex];
            const epName = ep ? ep.title : "Episode";
            epLabel = `<div class="muted small">${escapeHtml(epName)}</div>`;
        }

        // Build DOM
        const display = document.createElement('div');
        display.className = 'item';

        const left = document.createElement('div');
        left.innerHTML = `
            <strong>${escapeHtml(title)}</strong>
            ${epLabel}
        `;

        const right = document.createElement('div');
        right.innerHTML = `
            <button class="secondary" onclick="removeScheduleAt(${s.day}, ${s.hour})">X</button>
        `;

        display.appendChild(left);
        display.appendChild(right);

        slot.appendChild(display);
    });
}

window.removeScheduleAt = function(day,hour){
  schedule = schedule.filter(s => !(s.day==day && s.hour==hour));
  renderScheduledFlat(); renderTimetable(); log('Removed slot');
};
function slotHasSchedule(day,hour){
  return schedule.some(s=>s.day==day && s.hour==hour);
}

// -------------------- auto-airing logic --------------------
function computeRating(show, slot){
  // base + type/slot modifiers + episodes factor
  let base = show.quality || 3.0;
  const timeFactor = (slot.hour>=20 && slot.hour<=22) ? 1.3 : (slot.hour>=6 && slot.hour<=9 ? 1.0 : 0.9);
  const genreFactor = (show.genre==='Drama' && slot.hour>=20) ? 1.2 : 1.0;
  let epBoost = 0;
  if(show.type==='series' && typeof slot.epIndex !== 'undefined'){ epBoost = 0.2; }
  let rand = (Math.random()*0.8 - 0.25);
  let rating = clamp(Math.round((base * 0.8 + timeFactor * 0.6 + genreFactor*0.2 + epBoost + rand)*10)/10, 0, 5);
  return rating;
}
function applyNetworkScoreDiff(rating){
  const diff = Math.round((rating - 3)*2.5*10)/10;
  networkScore = clamp(Math.round((networkScore + diff)*10)/10, 0, 100);
  networkScoreSpan.textContent = networkScore.toFixed(1);
  return diff;
}
function airSlotIfDue(day,hour){
  const now = new Date();
  if(now.getDay()!==day || now.getHours()!==hour) return;
  const s = schedule.find(x=>x.day==day && x.hour==hour);
  if(!s) return;
  // avoid re-airing same schedule every minute: store a lastAired token on schedule item
  if(s.lastAired && (Date.now() - s.lastAired) < (1000*60*30)) return; // 30 minutes lock
  const show = shows.find(x=>x.id===s.showId);
  if(!show) return;
  // for series: pick next unaired episode index if not set
  if(show.type==='series'){
    if(typeof s.epIndex === 'undefined'){
      // find first episode not yet aired
      const nextIdx = show.episodes.findIndex(e=>!e.aired);
      s.epIndex = nextIdx>=0 ? nextIdx : 0;
    }
  }
  const rating = computeRating(show, s);
  const delta = applyNetworkScoreDiff(rating);
  s.lastAired = Date.now();
  // mark episode aired
  if(show.type==='series' && typeof s.epIndex === 'number'){
    show.episodes[s.epIndex].aired = true;
    log(`${rating>=3.5 ? '✅' : rating>=2.5 ? '⚠️':'❌'} Aired "${show.name}" Ep:${(s.epIndex+1)} "${show.episodes[s.epIndex].title}" — Rating ${rating.toFixed(1)} (${delta>=0?'+':'')}${delta}`);
    // check if all episodes aired -> random chance of renewal request
    const allAired = show.episodes.every(e=>e.aired);
    if(allAired && !renewRequests.includes(show.id) && Math.random() < 0.45){
      renewRequests.push(show.id);
      renderRenewRequests();
      log(`Series "${show.name}" requested renewal.`);
    }
  } else {
    log(`${rating>=3.5 ? '✅' : rating>=2.5 ? '⚠️':'❌'} Aired "${show.name}" — Rating ${rating.toFixed(1)} (${delta>=0?'+':'')}${delta}`);
    // for movies: random chance for sequel request
    if(show.type==='movie' && Math.random() < 0.15 && !renewRequests.includes(show.id)){
      renewRequests.push(show.id); renderRenewRequests(); log(`Movie "${show.name}" requested sequel/renewal.`);
    }
  }
  lastAir.textContent = `Last aired: ${show.name} — ${new Date().toLocaleString()}`;
  // after airing update UI
  populatePool(); renderScheduledFlat(); renderTimetable();
}

// periodic check
function startAutoAir(){
  if(autoInterval) clearInterval(autoInterval);
  autoInterval = setInterval(()=>{
    if(!autoAir) return;
    const n = new Date(); const d = n.getDay(); const h = n.getHours();
    airSlotIfDue(d,h);
  }, 30*1000); // every 30s
}

// manual air now: trigger any slot matching current day/hour
airNowBtn.addEventListener('click', ()=>{ const n=new Date(); airSlotIfDue(n.getDay(), n.getHours()); });

// toggle
toggleAutoBtn.addEventListener('click', ()=>{
  autoAir = !autoAir;
  toggleAutoBtn.textContent = `Toggle Auto-air (${autoAir ? 'on':'off'})`;
  log(`Auto-air ${autoAir ? 'enabled' : 'disabled'}`);
});

// clear week
clearWeekBtn.addEventListener('click', ()=>{ if(confirm('Clear entire week schedule?')){ schedule=[]; renderScheduledFlat(); renderTimetable(); log('Cleared weekly schedule'); } });

// -------------------- renew requests UI --------------------
function renderRenewRequests(){
  renewRequestsDiv.innerHTML = '';
  if(renewRequests.length===0){ renewRequestsDiv.textContent = 'No requests yet.'; return; }
  renewRequests.forEach(id => {
    const s = shows.find(x=>x.id===id);
    if(!s) return;
    const div = document.createElement('div'); div.style.marginBottom='8px';
    div.innerHTML = `<strong>${escapeHtml(s.name)}</strong> <div class="muted small">${escapeHtml(s.type)}</div>
      <div style="margin-top:6px">
        <button class="secondary" onclick='approveRenew("${id}")'>Renew</button>
        <button class="secondary" onclick='denyRenew("${id}")'>Cancel</button>
      </div>`;
    renewRequestsDiv.appendChild(div);
  });
}
window.approveRenew = function(id){
  // if series: auto-create a continued series (new show) or reset episodes for new season
  const s = shows.find(x=>x.id===id);
  if(!s) return;
  if(s.type==='series'){
    // create a new season/series clone with fresh episodes
    const newSeries = createShowObject(s.name + " (Renewed)", 'series', s.genre, { showrunner: s.meta.showrunner || '' });
    newSeries.parentId = s.id;
    newSeries.episodes = generateEpisodeArray(1, Math.max(4, Math.round(s.episodes.length * (0.8 + Math.random()*0.6))));
    shows.push(newSeries);
    log(`Renewed series "${s.name}" -> created "${newSeries.name}"`);
  } else if(s.type==='movie'){
    // make a sequel
    const sequel = createShowObject(s.name + " II", 'movie', s.genre, {});
    sequel.parentId = s.id;
    shows.push(sequel);
    log(`Created sequel/movie follow-up for "${s.name}"`);
  }
  // remove request
  renewRequests = renewRequests.filter(x=>x!==id);
  renderRenewRequests(); populatePool();
};
window.denyRenew = function(id){
  // cancel -> archive original (but allow later renewal)
  const s = shows.find(x=>x.id===id);
  if(!s) return;
  s.archived = true; archived.push(id);
  renewRequests = renewRequests.filter(x=>x!==id);
  renderRenewRequests(); renderArchived(); populatePool();
  log(`Cancelled renewal for "${s.name}" -> archived`);
};
function renderArchived(){
  archivedList.innerHTML = '';
  if(archived.length===0){ archivedList.innerHTML = '<li class="muted">No archived shows</li>'; return; }
  archived.forEach(id => {
    const s = shows.find(x=>x.id===id);
    if(!s) return;
    const li = document.createElement('li');
    li.innerHTML = `<div>${escapeHtml(s.name)} • ${escapeHtml(s.type)}</div><div><button class="secondary" onclick='restoreArchived("${id}")'>Restore</button></div>`;
    archivedList.appendChild(li);
  });
}
window.restoreArchived = function(id){ const s = shows.find(x=>x.id===id); if(!s) return; s.archived=false; archived = archived.filter(x=>x!==id); populatePool(); renderArchived(); log(`Restored "${s.name}" from archive`); };

// -------------------- utilities + init --------------------
function renderAll(){
  populatePool();
  buildTimetableGrid();
  renderTimetable();
  renderScheduledFlat();
  renderRenewRequests();
  renderArchived();
  networkScoreSpan.textContent = networkScore.toFixed(1);
}

function initDemoIfNeeded(){
  // if shows empty, seed some defaults
  if(shows.length===0){
    shows.push(createShowObject("Demo Movie","movie","Drama",{director:'A. Dir'}));
    const s = createShowObject("Demo Series","series","Sci-Fi",{showrunner:'X'});
    s.episodes = generateEpisodeArray(1,5);
    shows.push(s);
  }
}

initDemoIfNeeded();
renderAll();
startAutoAir();
