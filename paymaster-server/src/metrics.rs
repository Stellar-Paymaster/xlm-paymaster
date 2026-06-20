use std::{
    collections::BTreeMap,
    fmt::Write,
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
};

struct HistogramState {
    buckets: Vec<f64>,
    bucket_counts: Vec<u64>,
    count: u64,
    sum: f64,
}

impl HistogramState {
    fn new(buckets: Vec<f64>) -> Self {
        Self {
            bucket_counts: vec![0; buckets.len()],
            buckets,
            count: 0,
            sum: 0.0,
        }
    }

    fn observe(&mut self, value: f64) {
        self.count += 1;
        self.sum += value;

        for (index, bucket) in self.buckets.iter().enumerate() {
            if value <= *bucket {
                self.bucket_counts[index] += 1;
            }
        }
    }
}

pub struct AppMetrics {
    total_transactions: AtomicU64,
    failed_transactions: AtomicU64,
    signing_latency_ms: Mutex<HistogramState>,
    available_account_balance: Mutex<f64>,
    current_sequence_number: Mutex<BTreeMap<String, i64>>,
}

impl AppMetrics {
    pub fn new(initial_account_balance: f64) -> Self {
        Self {
            total_transactions: AtomicU64::new(0),
            failed_transactions: AtomicU64::new(0),
            signing_latency_ms: Mutex::new(HistogramState::new(vec![
                0.1, 0.5, 1.0, 2.5, 5.0, 10.0, 25.0, 50.0, 100.0, 250.0,
            ])),
            available_account_balance: Mutex::new(initial_account_balance),
            current_sequence_number: Mutex::new(BTreeMap::new()),
        }
    }

    pub fn inc_total_transactions(&self) {
        self.total_transactions.fetch_add(1, Ordering::Relaxed);
    }

    pub fn inc_failed_transactions(&self) {
        self.failed_transactions.fetch_add(1, Ordering::Relaxed);
    }

    pub fn observe_signing_latency_ms(&self, value: f64) {
        self.signing_latency_ms
            .lock()
            .expect("signing latency mutex should not be poisoned")
            .observe(value);
    }

    pub fn set_available_account_balance(&self, value: f64) {
        *self
            .available_account_balance
            .lock()
            .expect("account balance mutex should not be poisoned") = value;
    }

    pub fn set_current_sequence_number(&self, label: &str, value: i64) {
        self.current_sequence_number
            .lock()
            .expect("sequence number mutex should not be poisoned")
            .insert(label.to_string(), value);
    }

    pub fn render(&self) -> Result<String, std::fmt::Error> {
        let total_transactions = self.total_transactions.load(Ordering::Relaxed);
        let failed_transactions = self.failed_transactions.load(Ordering::Relaxed);
        let available_account_balance = *self
            .available_account_balance
            .lock()
            .expect("account balance mutex should not be poisoned");
        let sequence_numbers = self
            .current_sequence_number
            .lock()
            .expect("sequence number mutex should not be poisoned")
            .clone();
        let histogram = self
            .signing_latency_ms
            .lock()
            .expect("signing latency mutex should not be poisoned");

        let mut output = String::new();
        writeln!(
            output,
            "# HELP total_transactions Total number of fee-bump transactions processed by the Rust engine."
        )?;
        writeln!(output, "# TYPE total_transactions counter")?;
        writeln!(output, "total_transactions {total_transactions}")?;

        writeln!(
            output,
            "# HELP failed_transactions Total number of fee-bump transaction requests that failed."
        )?;
        writeln!(output, "# TYPE failed_transactions counter")?;
        writeln!(output, "failed_transactions {failed_transactions}")?;

        writeln!(
            output,
            "# HELP signing_latency_ms Latency in milliseconds for the Rust signing and fee-bump pipeline."
        )?;
        writeln!(output, "# TYPE signing_latency_ms histogram")?;
        for (index, bucket) in histogram.buckets.iter().enumerate() {
            writeln!(
                output,
                "signing_latency_ms_bucket{{le=\"{bucket}\"}} {}",
                histogram.bucket_counts[index]
            )?;
        }
        writeln!(
            output,
            "signing_latency_ms_bucket{{le=\"+Inf\"}} {}",
            histogram.count
        )?;
        writeln!(output, "signing_latency_ms_sum {}", histogram.sum)?;
        writeln!(output, "signing_latency_ms_count {}", histogram.count)?;

        writeln!(
            output,
            "# HELP available_account_balance Currently available fee-payer account balance."
        )?;
        writeln!(output, "# TYPE available_account_balance gauge")?;
        writeln!(
            output,
            "available_account_balance {available_account_balance}"
        )?;

        writeln!(
            output,
            "# HELP current_sequence_number Latest observed sequence number tracked by the Rust engine."
        )?;
        writeln!(output, "# TYPE current_sequence_number gauge")?;
        for (label, value) in sequence_numbers {
            writeln!(
                output,
                "current_sequence_number{{source=\"{label}\"}} {value}"
            )?;
        }

        Ok(output)
    }
}

#[cfg(test)]
mod tests {
    use super::AppMetrics;

    #[test]
    fn renders_prometheus_text() {
        let metrics = AppMetrics::new(125.5);
        metrics.inc_total_transactions();
        metrics.inc_failed_transactions();
        metrics.observe_signing_latency_ms(4.2);
        metrics.set_current_sequence_number("classic_v1", 42);

        let output = metrics.render().expect("metrics should render");

        assert!(output.contains("# TYPE total_transactions counter"));
        assert!(output.contains("total_transactions 1"));
        assert!(output.contains("failed_transactions 1"));
        assert!(output.contains("# TYPE signing_latency_ms histogram"));
        assert!(output.contains("signing_latency_ms_count 1"));
        assert!(output.contains("available_account_balance 125.5"));
        assert!(output.contains("current_sequence_number{source=\"classic_v1\"} 42"));
    }
}
