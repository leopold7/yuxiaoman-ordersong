//! 简易运行时指标 (计数器 + 平均耗时)

use std::collections::HashMap;
use std::time::Instant;

use parking_lot::Mutex;
use serde::Serialize;

#[derive(Default)]
pub struct Metrics {
    counters: Mutex<HashMap<String, u64>>,
    durations: Mutex<HashMap<String, DurStat>>,
    started_at: once_cell::sync::OnceCell<Instant>,
}

#[derive(Default, Clone, Copy)]
struct DurStat {
    sum_ms: f64,
    count: u64,
    max_ms: f64,
}

#[derive(Serialize)]
pub struct MetricsSnapshot {
    pub uptime_sec: u64,
    pub counters: HashMap<String, u64>,
    pub durations: HashMap<String, DurSerial>,
}

#[derive(Serialize, Clone, Copy)]
pub struct DurSerial {
    pub avg_ms: f64,
    pub count: u64,
    pub max_ms: f64,
}

impl Metrics {
    pub fn inc(&self, name: &str) {
        self.inc_by(name, 1)
    }

    pub fn inc_by(&self, name: &str, n: u64) {
        let mut m = self.counters.lock();
        *m.entry(name.into()).or_insert(0) += n;
        let _ = self.started_at.set(Instant::now());
    }

    pub fn observe(&self, name: &str, ms: f64) {
        let mut m = self.durations.lock();
        let e = m.entry(name.into()).or_default();
        e.sum_ms += ms;
        e.count += 1;
        if ms > e.max_ms {
            e.max_ms = ms;
        }
        let _ = self.started_at.set(Instant::now());
    }

    pub fn snapshot(&self) -> MetricsSnapshot {
        let started = self.started_at.get().copied().unwrap_or_else(Instant::now);
        let counters = self.counters.lock().clone();
        let dur = self.durations.lock();
        let durations = dur
            .iter()
            .map(|(k, v)| {
                (
                    k.clone(),
                    DurSerial {
                        avg_ms: if v.count == 0 {
                            0.0
                        } else {
                            v.sum_ms / v.count as f64
                        },
                        count: v.count,
                        max_ms: v.max_ms,
                    },
                )
            })
            .collect();
        MetricsSnapshot {
            uptime_sec: Instant::now().duration_since(started).as_secs(),
            counters,
            durations,
        }
    }
}
