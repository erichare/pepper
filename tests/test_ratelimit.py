from __future__ import annotations

from pepper.archive.net.ratelimit import RateLimiter


class FakeClock:
    def __init__(self) -> None:
        self.t = 0.0
        self.slept = 0.0

    def time(self) -> float:
        return self.t

    def sleep(self, s: float) -> None:
        self.slept += s
        self.t += s


def test_token_bucket_blocks_until_refilled():
    clk = FakeClock()
    rl = RateLimiter(2.0, burst=2, time_fn=clk.time, sleep_fn=clk.sleep)
    # burst of 2 immediate
    rl.acquire()
    rl.acquire()
    assert clk.slept == 0.0
    # third must wait ~0.5s (rate 2/s)
    rl.acquire()
    assert clk.slept >= 0.5


def test_per_minute_helper():
    clk = FakeClock()
    rl = RateLimiter.per_minute(60, burst=1, time_fn=clk.time, sleep_fn=clk.sleep)
    rl.acquire()
    rl.acquire()  # needs ~1s at 1/s
    assert clk.slept >= 1.0
