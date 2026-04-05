from flask import Flask, render_template, request, jsonify
from scheduler.mlq import MLQScheduler
from scheduler.process import Process

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/schedule', methods=['POST'])
def schedule():
    try:
        payload = request.get_json()

        if not payload or "processes" not in payload:
            return jsonify({
                "success": False,
                "error": "Invalid request. 'processes' data is required."
            }), 400

        raw_processes = payload.get("processes", [])
        config = payload.get("config", {})

        if not isinstance(raw_processes, list) or len(raw_processes) == 0:
            return jsonify({
                "success": False,
                "error": "Please add at least one process."
            }), 400

        processes = []
        seen_pids = set()

        for index, p in enumerate(raw_processes, start=1):
            pid = str(p.get("pid", "")).strip()
            arrival_raw = p.get("arrival", "")
            burst_raw = p.get("burst", "")
            queue_raw = p.get("queue", "")

            if pid == "":
                return jsonify({
                    "success": False,
                    "error": f"Row {index}: PID cannot be empty."
                }), 400

            if pid in seen_pids:
                return jsonify({
                    "success": False,
                    "error": f"Duplicate PID found: {pid}"
                }), 400

            seen_pids.add(pid)

            try:
                arrival = int(arrival_raw)
                burst = int(burst_raw)
                queue = int(queue_raw)
            except (TypeError, ValueError):
                return jsonify({
                    "success": False,
                    "error": f"Row {index}: Arrival, Burst, and Queue must be integers."
                }), 400

            if arrival < 0:
                return jsonify({
                    "success": False,
                    "error": f"Row {index}: Arrival time cannot be negative."
                }), 400

            if burst <= 0:
                return jsonify({
                    "success": False,
                    "error": f"Row {index}: Burst time must be greater than 0."
                }), 400

            if queue < 1 or queue > 6:
                return jsonify({
                    "success": False,
                    "error": f"Row {index}: Queue must be between 1 and 6."
                }), 400

            processes.append(Process(pid, arrival, burst, queue))

        scheduler = MLQScheduler(processes, config)
        result = scheduler.run()

        return jsonify({
            "success": True,
            "gantt": result["gantt"],
            "stats": result["stats"],
            "summary": result["summary"],
            "notes": result["notes"]
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "error": f"Server error: {str(e)}"
        }), 500

if __name__ == '__main__':
    app.run(debug=True)