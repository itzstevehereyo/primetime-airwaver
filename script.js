let shows = [];     
let schedule = [];   
let networkScore = 50;

const slotBonuses = {
  "Morning": 0.8,
  "Afternoon": 1.2,
  "Prime Time": 2.2,
  "Late Night": 0.9
};

const genreBonus = {
  "Drama": { "Prime Time": 0.6, "default": 0.2 },
  "Comedy": { "Prime Time": 0.4, "default": 0.3 },
  "News": { "Morning": 0.6, "Afternoon": 0.5, "default": 0.0 },
  "Reality": { "Prime Time": 0.3, "default": 0.2 }
};

// --- UI refs
const showNameInput = document.getElementById("show-name");
const showGenreSelect = document.getElementById("show-genre");
const addShowBtn = document.getElementById("add-show-btn");

const scheduleShowSelect = document.getElementById("schedule-show");
const scheduleTimeSelect = document.getElementById("schedule-time");
const scheduleBtn = document.getElementById("schedule-btn");

const showsUl = document.getElementById("shows-ul");
const scheduleList = document.getElementById("schedule-list");
const logDiv = document.getElementById("log");
const networkScoreSpan = document.getElementById("network-score");
const lastAir = document.getElementById("last-air");

const airNextBtn = document.getElementById("air-next-btn");
const simulateAllBtn = document.getElementById("simulate-all-btn");
const clearScheduleBtn = document.getElementById("clear-schedule-btn");

// --- helpers
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }

function clamp(num, min, max){ return Math.max(min, Math.min(max, num)); }

function randRange(min, max){ return Math.random()*(max-min)+min; }

// create show with base quality (1.0 - 5.0)
function createShow(name, genre){
  let q = clamp(Math.round((randRange(2.2,4.8) + Number.EPSILON) * 10) / 10, 1, 5);
  let s = { id: uid(), name, genre, quality: q };
  shows.push(s);
  return s;
}

function populateShowsUI(){
  // shows list
  showsUl.innerHTML = "";
  scheduleShowSelect.innerHTML = "";
  if(shows.length === 0){
    showsUl.innerHTML = "<li class='muted'>No shows yet</li>";
    scheduleShowSelect.innerHTML = "<option value=''>-- Add a show first --</option>";
    return;
  }
  shows.forEach(s => {
    let li = document.createElement("li");
    li.innerHTML = `<div>
                      <strong>${escapeHtml(s.name)}</strong>
                      <div class="show-meta">${s.genre} • Quality ${s.quality.toFixed(1)}</div>
                    </div>
                    <div>
                      <button class="secondary" onclick="removeShow('${s.id}')">Delete</button>
                    </div>`;
    showsUl.appendChild(li);

    let opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.name;
    scheduleShowSelect.appendChild(opt);
  });
}

function removeShow(id){
  shows = shows.filter(s => s.id !== id);
  // also remove scheduled entries referencing it
  schedule = schedule.filter(slot => slot.showId !== id);
  populateShowsUI();
  updateScheduleUI();
  log(`Removed show and cleaned schedule.`);
}

// scheduling
function scheduleShow(){
  const showId = scheduleShowSelect.value;
  const timeSlot = scheduleTimeSelect.value;
  if(!showId) {
    alert("Choose a show to schedule.");
    return;
  }
  const show = shows.find(s => s.id === showId);
  if(!show) return;

  const entry = {
    id: uid(),
    showId: show.id,
    showName: show.name,
    timeSlot
  };
  schedule.push(entry);
  updateScheduleUI();
  log(`Scheduled: ${show.name} — ${timeSlot}`);
}

// rating algorithm
function computeRating(show, timeSlot){
  // base = show quality [1..5]
  let base = show.quality;
  let slot = slotBonuses[timeSlot] ?? 1;
  let genreAdd = (genreBonus[show.genre] && (genreBonus[show.genre][timeSlot] ?? genreBonus[show.genre].default)) ?? 0.2;
  let randomness = randRange(-0.5,0.6); // slight randomness
  let rating = base * 0.8 + slot * 0.5 + genreAdd + randomness;
  rating = clamp(Math.round((rating + Number.EPSILON) * 10) / 10, 0, 5); // one decimal
  return rating;
}

// network score update rules
function applyNetworkScore(rating){
  // scale rating 0..5 -> score change roughly -6..+6
  let change = Math.round((rating - 3) * 2.5 * 10) / 10; // negative if below 3
  networkScore = Math.round((networkScore + change) * 10) / 10;
  networkScore = clamp(networkScore, 0, 100);
  networkScoreSpan.textContent = networkScore.toFixed(1);
  return change;
}

// air next show (FIFO)
function airNext(){
  if(schedule.length === 0){
    alert("Schedule is empty.");
    return;
  }
  const next = schedule.shift();
  const show = shows.find(s => s.id === next.showId);
  if(!show){
    log(`Aired unknown show (it was removed).`);
    updateScheduleUI();
    return;
  }
  const rating = computeRating(show, next.timeSlot);
  const scoreDelta = applyNetworkScore(rating);
  const color = rating >= 3.5 ? "✅" : (rating >= 2.5 ? "⚠️" : "❌");
  const msg = `${color} Aired "${show.name}" (${next.timeSlot}) — Rating: ${rating.toFixed(1)} — Network ${scoreDelta >= 0 ? '+' : ''}${scoreDelta}`;
  log(msg);
  lastAir.textContent = `Last aired: ${show.name} — ${next.timeSlot} — ${rating.toFixed(1)}`;
  updateScheduleUI();
}

// simulate full schedule (airs everything sequentially)
function simulateAll(){
  // clone schedule to avoid mutation issues in UI loop
  let clone = schedule.slice();
  if(clone.length === 0){ alert("Schedule is empty."); return; }
  // sequentially compute and log (but remove from schedule)
  while(schedule.length) airNext();
}

// logging helper
function log(text){
  const p = document.createElement("div");
  p.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
  logDiv.prepend(p);
}

// UI schedule rendering + drag/drop
let dragSrcId = null;

function updateScheduleUI(){
  scheduleList.innerHTML = "";
  if(schedule.length === 0){
    scheduleList.innerHTML = "<li class='muted'>No scheduled shows</li>";
    return;
  }
  schedule.forEach(entry => {
    const li = document.createElement("li");
    li.draggable = true;
    li.dataset.id = entry.id;
    li.innerHTML = `<div>
                      <strong>${escapeHtml(entry.showName)}</strong>
                      <div class="show-meta">${entry.timeSlot}</div>
                    </div>
                    <div class="rating">Drag</div>`;
    // drag events
    li.addEventListener('dragstart', (e) => {
      dragSrcId = entry.id;
      li.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    li.addEventListener('dragend', () => {
      li.classList.remove('dragging');
      dragSrcId = null;
    });

    li.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      li.classList.add('over');
    });
    li.addEventListener('dragleave', () => {
      li.classList.remove('over');
    });
    li.addEventListener('drop', (e) => {
      e.preventDefault();
      li.classList.remove('over');
      const dstId = entry.id;
      if(!dragSrcId || dragSrcId === dstId) return;
      reorderSchedule(dragSrcId, dstId);
      updateScheduleUI();
    });

    scheduleList.appendChild(li);
  });
}

// reorder schedule: move item with id srcId to index of dstId (insert before dst)
function reorderSchedule(srcId, dstId){
  const srcIndex = schedule.findIndex(x => x.id === srcId);
  const dstIndex = schedule.findIndex(x => x.id === dstId);
  if(srcIndex < 0 || dstIndex < 0) return;
  const [item] = schedule.splice(srcIndex,1);
  schedule.splice(dstIndex,0,item);
  log(`Reordered schedule: moved "${item.showName}"`);
}

// simple escaper for safety
function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

// button wiring
addShowBtn.addEventListener('click', () => {
  const name = showNameInput.value.trim();
  const genre = showGenreSelect.value;
  if(!name){ alert("Enter show name"); return; }
  const s = createShow(name, genre);
  populateShowsUI();
  updateScheduleUI();
  showNameInput.value = "";
  log(`Created show "${s.name}" (Quality ${s.quality.toFixed(1)})`);
});

scheduleBtn.addEventListener('click', () => {
  scheduleShow();
});

airNextBtn.addEventListener('click', () => airNext());
simulateAllBtn.addEventListener('click', () => simulateAll());
clearScheduleBtn.addEventListener('click', () => {
  schedule = [];
  updateScheduleUI();
  log("Cleared schedule");
});

// initial render
(function init(){
  networkScoreSpan.textContent = networkScore.toFixed(1);
  populateShowsUI();
  updateScheduleUI();

  // small demo shows (optional) - comment out if you want blank start
  const demo = [
    createShow("Morning Headlines","News"),
    createShow("Laugh Break","Comedy"),
    createShow("Star Drama","Drama"),
  ];
  populateShowsUI();
  log("Demo shows created. Add your own shows!");
})();
