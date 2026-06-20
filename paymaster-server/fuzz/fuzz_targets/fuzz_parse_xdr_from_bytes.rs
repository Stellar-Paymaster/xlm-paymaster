#![no_main]

use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    let _ = paymaster_server::xdr::parse_xdr_from_bytes(data);
});
