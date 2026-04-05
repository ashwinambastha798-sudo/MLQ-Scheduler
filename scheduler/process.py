class Process:
    def __init__(self, pid, arrival, burst, queue):
        self.pid = pid
        self.arrival = arrival
        self.burst = burst
        self.queue = queue