const clickSound = new Audio('/static/click.mp3');

let currentAnimationId = null;
let currentAnimationTimeout = null;
let stopAnimation = false;

function playClick() {
    clickSound.currentTime = 0;
    clickSound.play().catch(() => {});
}

function showMessage(message, isError = true) {
    const box = document.getElementById("messageBox");
    box.innerHTML = message;
    box.className = isError ? "errorBox" : "successBox";
}

function clearMessage() {
    const box = document.getElementById("messageBox");
    box.innerHTML = "";
    box.className = "";
}

function stopCurrentGanttAnimation() {
    stopAnimation = true;

    if (currentAnimationId !== null) {
        cancelAnimationFrame(currentAnimationId);
        currentAnimationId = null;
    }

    if (currentAnimationTimeout !== null) {
        clearTimeout(currentAnimationTimeout);
        currentAnimationTimeout = null;
    }
}

function getQueueCount() {
    return document.getElementById("policyTable").rows.length - 1;
}

function addQueueRow(policy = "FCFS", quantum = "") {
    playClick();

    const table = document.getElementById("policyTable");
    const queueNumber = table.rows.length;

    const row = table.insertRow();
    row.innerHTML = `
        <td>Q${queueNumber}</td>
        <td>
            <select id="policy${queueNumber}" onchange="toggleQuantum(${queueNumber})">
                <option value="RR" ${policy === "RR" ? "selected" : ""}>RR</option>
                <option value="FCFS" ${policy === "FCFS" ? "selected" : ""}>FCFS</option>
            </select>
        </td>
        <td>
            <input type="number" id="quantum${queueNumber}" min="1" value="${quantum}" placeholder="Quantum">
        </td>
    `;

    toggleQuantum(queueNumber);
}

function deleteQueueRow() {
    playClick();

    const table = document.getElementById("policyTable");
    const queueCount = getQueueCount();

    if (queueCount <= 0) {
        showMessage("No queue left to delete.", true);
        return;
    }

    table.deleteRow(table.rows.length - 1);
    clearMessage();
}

function clearQueueRows() {
    const table = document.getElementById("policyTable");
    while (table.rows.length > 1) {
        table.deleteRow(1);
    }
    clearMessage();
}

function toggleQuantum(q) {
    const policy = document.getElementById(`policy${q}`).value;
    const quantum = document.getElementById(`quantum${q}`);

    if (policy === "RR") {
        quantum.disabled = false;
        quantum.style.opacity = "1";
        quantum.style.pointerEvents = "auto";
        if (quantum.value.trim() === "") {
            quantum.value = "2";
        }
    } else {
        quantum.disabled = true;
        quantum.value = "";
        quantum.style.opacity = "0.6";
        quantum.style.pointerEvents = "none";
    }
}

function addRow(pid = "", arrival = "", burst = "", queue = "") {
    playClick();

    const table = document.getElementById("inputTable");
    const row = table.insertRow();

    row.innerHTML = `
        <td><input value="${pid}"></td>
        <td><input type="number" min="0" value="${arrival}"></td>
        <td><input type="number" min="1" value="${burst}"></td>
        <td><input type="number" min="1" value="${queue}"></td>
    `;
}

function clearProcessesOnly() {
    const table = document.getElementById("inputTable");
    while (table.rows.length > 1) {
        table.deleteRow(1);
    }
}

function addSampleData() {
    playClick();
    clearProcessesOnly();

    addRow("P1", 2, 5, 1);
    addRow("P2", 2, 4, 2);
    addRow("P3", 3, 6, 3);
    addRow("P4", 10, 2, 1);
    addRow("P5", 15, 3, 4);
    addRow("P6", 15, 2, 2);
    addRow("P7", 22, 4, 3);
}

function clearAllData() {
    playClick();
    stopCurrentGanttAnimation();
    clearProcessesOnly();
    clearMessage();

    document.getElementById("gantt").innerHTML = "";

    document.getElementById("statsTable").innerHTML = `
        <tr>
            <th>PID</th>
            <th>Arrival</th>
            <th>Burst</th>
            <th>Original Queue</th>
            <th>Final Queue</th>
            <th>Completion</th>
            <th>Turnaround</th>
            <th>Waiting</th>
            <th>Response</th>
        </tr>
    `;

    document.getElementById("summaryTable").innerHTML = `
        <tr>
            <th>Metric</th>
            <th>Value</th>
        </tr>
    `;

    document.getElementById("notesList").innerHTML = "";

    document.getElementById("tileCompletion").textContent = "--";
    document.getElementById("tileTurnaround").textContent = "--";
    document.getElementById("tileWaiting").textContent = "--";
    document.getElementById("tileResponse").textContent = "--";
}

function collectPolicies() {
    const table = document.getElementById("policyTable");
    const queuePolicies = {};

    if (table.rows.length <= 1) {
        throw new Error("Please add at least one queue.");
    }

    for (let q = 1; q < table.rows.length; q++) {
        const type = document.getElementById(`policy${q}`).value;
        const quantumInput = document.getElementById(`quantum${q}`);
        let quantum = null;

        if (type === "RR") {
            quantum = parseInt(quantumInput.value, 10);
            if (!Number.isInteger(quantum) || quantum <= 0) {
                throw new Error(`Q${q}: Quantum must be greater than 0.`);
            }
        }

        queuePolicies[q] = {
            type: type,
            quantum: quantum
        };
    }

    return queuePolicies;
}

function collectProcesses() {
    const table = document.getElementById("inputTable");
    const processes = [];
    const pidSet = new Set();
    const queueCount = getQueueCount();

    if (queueCount <= 0) {
        throw new Error("Please add at least one queue first.");
    }

    if (table.rows.length <= 1) {
        throw new Error("Please add at least one process.");
    }

    for (let i = 1; i < table.rows.length; i++) {
        const cells = table.rows[i].cells;

        const pid = cells[0].children[0].value.trim();
        const arrival = cells[1].children[0].value.trim();
        const burst = cells[2].children[0].value.trim();
        const queue = cells[3].children[0].value.trim();

        if (pid === "" && arrival === "" && burst === "" && queue === "") {
            continue;
        }

        if (pid === "" || arrival === "" || burst === "" || queue === "") {
            throw new Error(`Row ${i}: Fill all fields.`);
        }

        if (pidSet.has(pid)) {
            throw new Error(`Duplicate PID found: ${pid}`);
        }
        pidSet.add(pid);

        const arrivalNum = Number(arrival);
        const burstNum = Number(burst);
        const queueNum = Number(queue);

        if (!Number.isInteger(arrivalNum) || !Number.isInteger(burstNum) || !Number.isInteger(queueNum)) {
            throw new Error(`Row ${i}: Arrival, Burst, and Queue must be integers.`);
        }

        if (arrivalNum < 0) {
            throw new Error(`Row ${i}: Arrival cannot be negative.`);
        }

        if (burstNum <= 0) {
            throw new Error(`Row ${i}: Burst must be greater than 0.`);
        }

        if (queueNum < 1 || queueNum > queueCount) {
            throw new Error(`Row ${i}: Queue must be between 1 and ${queueCount}.`);
        }

        processes.push({
            pid: pid,
            arrival: arrivalNum,
            burst: burstNum,
            queue: queueNum
        });
    }

    if (processes.length === 0) {
        throw new Error("Please enter valid process data.");
    }

    return processes;
}

function runScheduler() {
    playClick();
    clearMessage();
    stopCurrentGanttAnimation();
    document.getElementById("gantt").innerHTML = "";

    try {
        const processes = collectProcesses();
        const agingThresholdValue = parseInt(document.getElementById("agingThreshold").value, 10);

        if (!Number.isInteger(agingThresholdValue) || agingThresholdValue < 0) {
            throw new Error("Aging threshold must be 0 or greater.");
        }

        const config = {
            aging_enabled: document.getElementById("agingEnabled").checked,
            aging_threshold: agingThresholdValue,
            migrate_on_aging: document.getElementById("migrateOnAging").checked,
            queue_policies: collectPolicies()
        };

        fetch('/schedule', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                processes: processes,
                config: config
            })
        })
        .then(async (res) => {
            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.error || "Something went wrong.");
            }
            return data;
        })
        .then((data) => {
            drawGanttAnimated(data.gantt);
            fillStatsTable(data.stats);
            fillSummaryTable(data.summary);
            fillNotes(data.notes);
            showMessage("Scheduling completed successfully.", false);
        })
        .catch((err) => {
            showMessage(err.message, true);
        });

    } catch (err) {
        showMessage(err.message, true);
    }
}

function getQueueColor(queue, pid) {
    if (pid === "IDLE") return "#2b3445";
    if (queue == 1) return "#ef9a9a";
    if (queue == 2) return "#90caf9";
    if (queue == 3) return "#a5d6a7";
    if (queue == 4) return "#ffcc80";
    if (queue == 5) return "#ce93d8";
    if (queue == 6) return "#fff59d";
    return "#d7ccc8";
}

function drawGanttAnimated(data) {
    const gantt = document.getElementById("gantt");

    stopCurrentGanttAnimation();
    gantt.innerHTML = "";
    stopAnimation = false;

    const pxPerUnit = 36;
    let index = 0;

    function animateNext() {
        if (stopAnimation || index >= data.length) {
            currentAnimationTimeout = null;
            currentAnimationId = null;
            return;
        }

        const seg = data[index];
        const duration = seg.end - seg.start;
        const targetWidth = Math.max(duration * pxPerUnit, 72);

        const wrapper = document.createElement("div");
        wrapper.className = "gantt-segment-wrapper";

        const startLabel = document.createElement("div");
        startLabel.className = "time-label";
        startLabel.textContent = seg.start;

        const block = document.createElement("div");
        block.className = "gantt-block";
        block.style.width = "0px";
        block.style.background = getQueueColor(seg.queue, seg.pid);
        block.style.color = seg.pid === "IDLE" ? "#ffffff" : "#08131d";

        block.innerHTML = `
            <div class="gantt-pid">${seg.pid}</div>
            <div class="gantt-range">${seg.start}-${seg.end}</div>
            <div class="gantt-queue">${seg.queue === "-" ? "-" : "Q" + seg.queue}</div>
        `;

        wrapper.appendChild(startLabel);
        wrapper.appendChild(block);
        gantt.appendChild(wrapper);

        let currentWidth = 0;
        const step = Math.max(4, targetWidth / 24);

        function grow() {
            if (stopAnimation) {
                currentAnimationId = null;
                return;
            }

            currentWidth += step;

            if (currentWidth >= targetWidth) {
                currentWidth = targetWidth;
            }

            block.style.width = currentWidth + "px";

            if (currentWidth < targetWidth) {
                currentAnimationId = requestAnimationFrame(grow);
            } else {
                const endLabel = document.createElement("div");
                endLabel.className = "time-label";
                endLabel.textContent = seg.end;
                wrapper.appendChild(endLabel);

                index++;
                currentAnimationId = null;
                currentAnimationTimeout = setTimeout(animateNext, 120);
            }
        }

        currentAnimationId = requestAnimationFrame(grow);
    }

    animateNext();
}

function fillStatsTable(stats) {
    const table = document.getElementById("statsTable");
    table.innerHTML = `
        <tr>
            <th>PID</th>
            <th>Arrival</th>
            <th>Burst</th>
            <th>Original Queue</th>
            <th>Final Queue</th>
            <th>Completion</th>
            <th>Turnaround</th>
            <th>Waiting</th>
            <th>Response</th>
        </tr>
    `;

    stats.forEach((p) => {
        const row = table.insertRow();
        row.innerHTML = `
            <td>${p.pid}</td>
            <td>${p.arrival}</td>
            <td>${p.burst}</td>
            <td>Q${p.original_queue}</td>
            <td>Q${p.final_queue}</td>
            <td>${p.completion}</td>
            <td>${p.turnaround}</td>
            <td>${p.waiting}</td>
            <td>${p.response}</td>
        `;
    });
}

function fillSummaryTable(summary) {
    const table = document.getElementById("summaryTable");
    table.innerHTML = `
        <tr>
            <th>Metric</th>
            <th>Value</th>
        </tr>
    `;

    const rows = [
        ["Average Completion Time", summary.avg_completion],
        ["Average Turnaround Time", summary.avg_turnaround],
        ["Average Waiting Time", summary.avg_waiting],
        ["Average Response Time", summary.avg_response],
        ["Aging Enabled", summary.aging_enabled ? "Yes" : "No"],
        ["Aging Threshold", summary.aging_threshold],
        ["Migrate on Aging", summary.migrate_on_aging ? "Yes" : "No"]
    ];

    rows.forEach((item) => {
        const row = table.insertRow();
        row.innerHTML = `<td>${item[0]}</td><td>${item[1]}</td>`;
    });

    document.getElementById("tileCompletion").textContent = summary.avg_completion;
    document.getElementById("tileTurnaround").textContent = summary.avg_turnaround;
    document.getElementById("tileWaiting").textContent = summary.avg_waiting;
    document.getElementById("tileResponse").textContent = summary.avg_response;
}

function fillNotes(notes) {
    const list = document.getElementById("notesList");
    list.innerHTML = "";

    notes.forEach((note) => {
        const li = document.createElement("li");
        li.textContent = note;
        list.appendChild(li);
    });
}

document.addEventListener("DOMContentLoaded", function () {
    const navItems = document.querySelectorAll(".nav-item");

    navItems.forEach((item) => {
        item.addEventListener("click", function () {
            navItems.forEach((nav) => nav.classList.remove("active"));
            this.classList.add("active");
        });
    });

    clearQueueRows();
    addQueueRow("RR", "2");
    addQueueRow("RR", "3");
    addQueueRow("FCFS", "");
    addRow();

    const reveals = document.querySelectorAll(".reveal");
    reveals.forEach((el, index) => {
        el.style.animationDelay = `${index * 0.08}s`;
    });
});