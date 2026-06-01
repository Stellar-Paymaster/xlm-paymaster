fn main() {
    napi_build::setup();

    tonic_build::configure()
        .build_server(true)
        .build_client(false)
        .compile_protos(&["proto/internal_signer.proto"], &["proto"])
        .expect("failed to compile internal signer protobufs");
}
