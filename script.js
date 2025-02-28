let shows = [];
let schedule = [];

function addShow() {
    const name = document.getElementById("show-name").value;
    const genre = document.getElementById("show-genre").value;
    
    if (name) {
        let newShow = { name, genre };
        shows.push(newShow);
        
        let select = document.getElementById("schedule-show");
        let option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        select.appendChild(option);

        alert("Show added!");
    }
}

function scheduleShow() {
    const showName = document.getElementById("schedule-show").value;
    const timeSlot = document.getElementById("schedule-time").value;

    if (showName) {
        schedule.push({ showName, timeSlot });
        updateSchedule();
    }
}

function updateSchedule() {
    const list = document.getElementById("schedule-list");
    list.innerHTML = "";

    schedule.forEach(item => {
        let li = document.createElement("li");
        li.textContent = `${item.showName} - ${item.timeSlot}`;
        list.appendChild(li);
    });
}
