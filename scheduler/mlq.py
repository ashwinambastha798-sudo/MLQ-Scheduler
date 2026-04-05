from collections import deque

class MLQScheduler:
    def __init__(self, processes, config=None):
        self.processes = processes
        self.config = config or {}
        self.queue_policies = self._build_queue_policies()
        self.max_queue = max(self.queue_policies.keys()) if self.queue_policies else 0

        self.aging_enabled = bool(self.config.get("aging_enabled", True))
        self.aging_threshold = int(self.config.get("aging_threshold", 8))
        self.migrate_on_aging = bool(self.config.get("migrate_on_aging", True))

    def _build_queue_policies(self):
        user_policies = self.config.get("queue_policies", {})

        if user_policies:
            queue_policies = {}

            for q_key, policy in user_policies.items():
                q = int(q_key)
                policy_type = str(policy.get("type", "FCFS")).upper()
                quantum = policy.get("quantum", None)

                if policy_type == "RR":
                    if quantum is None:
                        quantum = 2
                    quantum = int(quantum)
                    if quantum <= 0:
                        quantum = 2
                else:
                    quantum = None

                queue_policies[q] = {
                    "type": policy_type,
                    "quantum": quantum
                }

            return dict(sorted(queue_policies.items()))

        return {
            1: {"type": "RR", "quantum": 2},
            2: {"type": "RR", "quantum": 3},
            3: {"type": "FCFS", "quantum": None}
        }

    def _append_segment(self, gantt, pid, start, end, queue):
        if start == end:
            return

        gantt.append({
            "pid": pid,
            "start": start,
            "end": end,
            "queue": queue
        })

    def _apply_aging(self, ready, current_time, notes):
        if not self.aging_enabled or not self.migrate_on_aging:
            return

        for q in range(2, self.max_queue + 1):
            if q not in ready:
                continue

            kept = deque()

            while ready[q]:
                proc = ready[q].popleft()
                wait_time = current_time - proc["last_ready_enter_time"]

                if wait_time >= self.aging_threshold:
                    old_queue = proc["queue"]
                    proc["queue"] = q - 1
                    proc["last_ready_enter_time"] = current_time
                    ready[proc["queue"]].append(proc)
                    notes.append(
                        f"{proc['pid']} moved from Q{old_queue} to Q{proc['queue']} due to aging at time {current_time}."
                    )
                else:
                    kept.append(proc)

            ready[q] = kept

    def run(self):
        if not self.processes:
            return {
                "gantt": [],
                "stats": [],
                "summary": {},
                "notes": ["No processes available."]
            }

        all_procs = []
        for p in self.processes:
            all_procs.append({
                "pid": p.pid,
                "arrival": p.arrival,
                "burst": p.burst,
                "remaining": p.burst,
                "queue": p.queue,
                "original_queue": p.queue,
                "completion": None,
                "response": None,
                "last_ready_enter_time": p.arrival
            })

        all_procs.sort(key=lambda x: (x["arrival"], x["queue"], x["pid"]))

        time = 0
        i = 0
        n = len(all_procs)

        ready = {q: deque() for q in range(1, self.max_queue + 1)}
        gantt = []
        notes = [
            "Tie rule: earlier arrival first, then higher-priority queue, then PID order.",
            "Lower queue number means higher priority.",
            "RR processes are shown as separate quantum blocks in the Gantt chart."
        ]

        def add_arrivals(up_to_time):
            nonlocal i
            while i < n and all_procs[i]["arrival"] <= up_to_time:
                proc = all_procs[i]
                proc["last_ready_enter_time"] = up_to_time
                ready[proc["queue"]].append(proc)
                i += 1

        def get_highest_ready_queue():
            for q in range(1, self.max_queue + 1):
                if ready[q]:
                    return q
            return None

        while i < n or any(len(ready[q]) > 0 for q in ready):
            add_arrivals(time)
            self._apply_aging(ready, time, notes)

            q = get_highest_ready_queue()

            if q is None:
                next_arrival = all_procs[i]["arrival"]
                self._append_segment(gantt, "IDLE", time, next_arrival, "-")
                time = next_arrival
                continue

            current = ready[q].popleft()
            policy = self.queue_policies[q]

            if current["response"] is None:
                current["response"] = time - current["arrival"]

            if policy["type"] == "RR":
                run_time = min(current["remaining"], policy["quantum"])
                start = time
                end = time + run_time

                self._append_segment(gantt, current["pid"], start, end, current["queue"])

                time = end
                current["remaining"] -= run_time

                add_arrivals(time)
                self._apply_aging(ready, time, notes)

                if current["remaining"] > 0:
                    current["last_ready_enter_time"] = time
                    ready[current["queue"]].append(current)
                else:
                    current["completion"] = time

            elif policy["type"] == "FCFS":
                start = time

                next_higher_arrival = None
                for j in range(i, n):
                    if all_procs[j]["queue"] < current["queue"]:
                        next_higher_arrival = all_procs[j]["arrival"]
                        break

                if next_higher_arrival is None:
                    run_time = current["remaining"]
                else:
                    run_time = min(current["remaining"], max(0, next_higher_arrival - time))

                if run_time == 0:
                    current["last_ready_enter_time"] = time
                    ready[current["queue"]].appendleft(current)
                    add_arrivals(time)
                    self._apply_aging(ready, time, notes)
                    continue

                end = time + run_time
                self._append_segment(gantt, current["pid"], start, end, current["queue"])

                time = end
                current["remaining"] -= run_time

                add_arrivals(time)
                self._apply_aging(ready, time, notes)

                if current["remaining"] > 0:
                    current["last_ready_enter_time"] = time
                    ready[current["queue"]].appendleft(current)
                else:
                    current["completion"] = time

            else:
                raise ValueError(f"Unsupported policy type for Q{q}: {policy['type']}")

        stats = []
        for proc in all_procs:
            completion = proc["completion"]
            turnaround = completion - proc["arrival"]
            waiting = turnaround - proc["burst"]
            response = proc["response"]

            stats.append({
                "pid": proc["pid"],
                "arrival": proc["arrival"],
                "burst": proc["burst"],
                "original_queue": proc["original_queue"],
                "final_queue": proc["queue"],
                "completion": completion,
                "turnaround": turnaround,
                "waiting": waiting,
                "response": response
            })

        stats.sort(key=lambda x: x["pid"])

        avg_completion = round(sum(x["completion"] for x in stats) / len(stats), 2)
        avg_turnaround = round(sum(x["turnaround"] for x in stats) / len(stats), 2)
        avg_waiting = round(sum(x["waiting"] for x in stats) / len(stats), 2)
        avg_response = round(sum(x["response"] for x in stats) / len(stats), 2)

        summary = {
            "avg_completion": avg_completion,
            "avg_turnaround": avg_turnaround,
            "avg_waiting": avg_waiting,
            "avg_response": avg_response,
            "aging_enabled": self.aging_enabled,
            "aging_threshold": self.aging_threshold,
            "migrate_on_aging": self.migrate_on_aging,
            "queue_policies": self.queue_policies
        }

        return {
            "gantt": gantt,
            "stats": stats,
            "summary": summary,
            "notes": notes
        }