#![no_main]

use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    let _ = fluid_server::xdr::parse_xdr_from_bytes(data);
});
