# Awesome Fluid [![Awesome](https://awesome.re/badge.svg)](https://awesome.re)

> A curated list of resources, tools, tutorials, and integrations for the [Fluid](https://github.com/Stellar-Fluid/fluid) fee-sponsorship platform on Stellar.

Fluid lets developers sponsor Stellar network fees so their users never need to hold XLM for gas.  
Pull requests welcome — please read the [contributing guidelines](#contributing) first.

---

## Contents

- [Official Resources](#official-resources)
- [SDKs & Client Libraries](#sdks--client-libraries)
- [Tutorials & Guides](#tutorials--guides)
- [Integrations](#integrations)
- [Demo dApps](#demo-dapps)
- [Blog Posts & Articles](#blog-posts--articles)
- [Talks & Videos](#talks--videos)
- [Community](#community)

---

## Official Resources

- [Fluid GitHub Repository](https://github.com/Stellar-Fluid/fluid) - Main monorepo: Rust backend, TypeScript SDK, admin dashboard, and CLI.
- [Fluid Documentation](https://docs.fluid.dev) - Official API reference, quickstart guides, and architecture docs.
- [Admin Dashboard](https://github.com/Stellar-Fluid/fluid/tree/main/admin-dashboard) - Next.js 15 admin and developer portal.
- [Fluid CLI](https://github.com/Stellar-Fluid/fluid/tree/main/fluid-cli) - Command-line interface for managing Fluid deployments.
- [Changelog](https://github.com/Stellar-Fluid/fluid/releases) - Release notes and versioning history.
- [Discord Community](https://discord.gg/fluid) - Real-time support and community discussion.
- [Roadmap](https://github.com/Stellar-Fluid/fluid/blob/main/admin-dashboard/public/roadmap.json) - Public product roadmap with voting.

## SDKs & Client Libraries

- [fluid-client (TypeScript)](https://github.com/Stellar-Fluid/fluid/tree/main/client) - Official TypeScript/JavaScript SDK for requesting fee-bump transactions.
- [fluid-py (Python)](https://github.com/Stellar-Fluid/fluid/tree/main/fluid-py) - Python SDK for server-side fee sponsorship.
- [fluid-go (Go)](https://github.com/Stellar-Fluid/fluid/tree/main/fluid-go) - Go client library for Fluid fee-bump requests.
- [fluid-core (Rust)](https://github.com/Stellar-Fluid/fluid/tree/main/fluid-core) - Core Rust crate used by the Fluid server signing engine.

## Tutorials & Guides

- [Quickstart: Gasless Stellar dApp](https://docs.fluid.dev/quickstart) - Build your first gasless Stellar application in under 10 minutes.
- [Soroban + Fluid Integration](https://github.com/Stellar-Fluid/fluid/blob/main/docs/integrations/soroswap.md) - How to pair Soroban contract calls with Fluid fee bumps.
- [NFT Gasless Minting Guide](https://github.com/Stellar-Fluid/fluid/blob/main/docs/integrations/nft-gasless-minting.md) - Sponsor fees for Stellar NFT mint transactions.
- [Blend Protocol Integration](https://github.com/Stellar-Fluid/fluid/blob/main/docs/integrations/blend-protocol.md) - Use Fluid with Blend lending pools.
- [Fluid vs Manual Fee Bump](https://github.com/Stellar-Fluid/fluid/blob/main/docs/fluid-vs-manual.md) - Side-by-side comparison of Fluid and raw XDR fee-bump transactions.
- [gRPC mTLS Setup](https://github.com/Stellar-Fluid/fluid/blob/main/docs/grpc-mtls.md) - Secure Rust signing engine communication with mutual TLS.
- [Horizontal Scaling](https://github.com/Stellar-Fluid/fluid/blob/main/docs/horizontal-scaling.md) - Run Fluid across multiple regions with active-active replication.
- [Rate Limiting Guide](https://github.com/Stellar-Fluid/fluid/blob/main/docs/rate-limiting.md) - Intelligent per-tenant rate limiting configuration.
- [Database Encryption](https://github.com/Stellar-Fluid/fluid/blob/main/docs/database-encryption.md) - Encrypting sensitive fields at rest.

## Integrations

- [Soroswap](https://github.com/Stellar-Fluid/fluid/blob/main/docs/integrations/soroswap.md) - Gasless swaps on the Soroswap DEX using Fluid fee sponsorship.
- [Blend Protocol](https://github.com/Stellar-Fluid/fluid/blob/main/docs/integrations/blend-protocol.md) - Fee-free lending and borrowing with Blend + Fluid.
- [Freighter Wallet](https://github.com/Stellar-Fluid/fluid/blob/main/admin-dashboard/lib/freighter.ts) - Connect Freighter browser wallet for user-signed transactions.
- [Helm Chart](https://github.com/Stellar-Fluid/fluid/tree/main/helm) - Deploy Fluid on Kubernetes with the official Helm chart.
- [Docker Compose](https://github.com/Stellar-Fluid/fluid/blob/main/docker-compose.yml) - Local multi-service development environment.
- [PgBouncer](https://github.com/Stellar-Fluid/fluid/tree/main/pgbouncer) - Connection pooling configuration for high-throughput deployments.

## Demo dApps

- [Fluid Sandbox](https://github.com/Stellar-Fluid/fluid/tree/main/admin-dashboard/app/admin/sandbox) - Built-in sandbox environment for testing fee bumps against Stellar Quickstart.
- [WASM Demo](https://github.com/Stellar-Fluid/fluid/tree/main/fluid-server/wasm-demo) - In-browser WASM demo of the Fluid signing engine.
- [Vue SDK Example](https://github.com/Stellar-Fluid/fluid/tree/main/client/examples/vue) - Vue.js frontend example using `fluid-client`.

## Blog Posts & Articles

- [Introducing Fluid: Gasless Stellar Transactions](https://github.com/Stellar-Fluid/fluid/blob/main/docs/adr/001-chain-agnostic-fee-sponsor.md) - Architecture decision record explaining the chain-agnostic fee sponsor design.
- [Why Rust for the Signing Engine?](https://github.com/Stellar-Fluid/fluid/blob/main/docs/adr/002-rust-signing-engine.md) - ADR covering the choice of Rust for the high-security key management core.
- [gRPC over REST for Node-Engine Communication](https://github.com/Stellar-Fluid/fluid/blob/main/docs/adr/003-grpc-node-rust-communication.md) - Rationale for gRPC between the Node.js API and Rust signing engine.
- [Prisma over Raw SQL](https://github.com/Stellar-Fluid/fluid/blob/main/docs/adr/004-prisma-over-raw-sql.md) - Database access strategy decision.
- [Sandwich Attack Mitigation](https://github.com/Stellar-Fluid/fluid/blob/main/docs/security/issue-137-sandwich-attack-mitigation.md) - Security research on preventing front-running of fee-bump transactions.

## Talks & Videos

> Know of a talk or video about Fluid? Open a PR to add it here!

## Community

- [GitHub Discussions](https://github.com/Stellar-Fluid/fluid/discussions) - Feature proposals, Q&A, and ecosystem conversations.
- [Discord](https://discord.gg/fluid) - Real-time help from maintainers and community members.
- [Monthly Transparency Reports](https://github.com/Stellar-Fluid/fluid/blob/main/docs/reports/index.md) - Open metrics on usage, uptime, and ecosystem growth.
- [Plugin Marketplace](https://github.com/Stellar-Fluid/fluid/tree/main/admin-dashboard/app/plugins) - Community-built plugins extending Fluid's capabilities.

---

## Contributing

Contributions are welcome! Please read the [Contribution Guidelines](https://github.com/Stellar-Fluid/fluid/blob/main/CONTRIBUTING.md) before submitting a pull request.

**Criteria for inclusion:**
- Directly related to the Fluid platform or Stellar fee sponsorship
- Publicly accessible (open source, or a freely readable article)
- Working — no broken links or stale/deprecated resources
- Add entries to the most relevant section alphabetically

Run `npx awesome-lint docs/awesome-fluid.md` locally before submitting to ensure the list passes CI.

---

*This list is maintained by the Fluid community. It is not an official endorsement of any third-party resource.*
