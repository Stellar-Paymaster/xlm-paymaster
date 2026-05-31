//! Memory profiling utilities for zero-copy XDR optimization

use std::alloc::{GlobalAlloc, Layout, System};
use std::sync::atomic::{AtomicUsize, Ordering};

/// A simple allocator wrapper that tracks allocation counts
pub struct TrackingAllocator;

static ALLOCATION_COUNT: AtomicUsize = AtomicUsize::new(0);
static DEALLOCATION_COUNT: AtomicUsize = AtomicUsize::new(0);
static BYTES_ALLOCATED: AtomicUsize = AtomicUsize::new(0);

unsafe impl GlobalAlloc for TrackingAllocator {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        let ptr = System.alloc(layout);
        if !ptr.is_null() {
            ALLOCATION_COUNT.fetch_add(1, Ordering::Relaxed);
            BYTES_ALLOCATED.fetch_add(layout.size(), Ordering::Relaxed);
        }
        ptr
    }

    unsafe fn dealloc(&self, ptr: *mut u8, layout: Layout) {
        System.dealloc(ptr, layout);
        DEALLOCATION_COUNT.fetch_add(1, Ordering::Relaxed);
    }
}

/// Memory statistics for profiling
#[derive(Debug, Clone)]
pub struct MemoryStats {
    pub allocations: usize,
    pub deallocations: usize,
    pub bytes_allocated: usize,
    pub net_allocations: usize,
}

impl MemoryStats {
    pub fn current() -> Self {
        let allocations = ALLOCATION_COUNT.load(Ordering::Relaxed);
        let deallocations = DEALLOCATION_COUNT.load(Ordering::Relaxed);
        let bytes_allocated = BYTES_ALLOCATED.load(Ordering::Relaxed);
        
        Self {
            allocations,
            deallocations,
            bytes_allocated,
            net_allocations: allocations.saturating_sub(deallocations),
        }
    }

    pub fn reset() {
        ALLOCATION_COUNT.store(0, Ordering::Relaxed);
        DEALLOCATION_COUNT.store(0, Ordering::Relaxed);
        BYTES_ALLOCATED.store(0, Ordering::Relaxed);
    }

    pub fn diff(&self, other: &MemoryStats) -> MemoryStats {
        MemoryStats {
            allocations: self.allocations.saturating_sub(other.allocations),
            deallocations: self.deallocations.saturating_sub(other.deallocations),
            bytes_allocated: self.bytes_allocated.saturating_sub(other.bytes_allocated),
            net_allocations: self.net_allocations.saturating_sub(other.net_allocations),
        }
    }
}

/// Benchmark function to measure memory usage of XDR operations
pub fn benchmark_xdr_parsing<F>(name: &str, iterations: usize, mut operation: F) 
where 
    F: FnMut() -> Result<(), Box<dyn std::error::Error>>,
{
    // Reset counters
    MemoryStats::reset();
    
    let start_stats = MemoryStats::current();
    let start_time = std::time::Instant::now();
    
    for _ in 0..iterations {
        if let Err(e) = operation() {
            eprintln!("Benchmark error in {}: {}", name, e);
            return;
        }
    }
    
    let end_time = std::time::Instant::now();
    let end_stats = MemoryStats::current();
    let diff_stats = end_stats.diff(&start_stats);
    
    println!("\n=== {} Benchmark Results ===", name);
    println!("Iterations: {}", iterations);
    println!("Duration: {:?}", end_time - start_time);
    println!("Total allocations: {}", diff_stats.allocations);
    println!("Total bytes allocated: {}", diff_stats.bytes_allocated);
    println!("Allocations per iteration: {:.2}", diff_stats.allocations as f64 / iterations as f64);
    println!("Bytes per iteration: {:.2}", diff_stats.bytes_allocated as f64 / iterations as f64);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_memory_stats() {
        MemoryStats::reset();
        let initial = MemoryStats::current();
        
        // Allocate some memory
        let _vec: Vec<u8> = vec![0; 1024];
        
        let after_alloc = MemoryStats::current();
        let diff = after_alloc.diff(&initial);
        
        assert!(diff.allocations > 0);
        assert!(diff.bytes_allocated >= 1024);
    }
}