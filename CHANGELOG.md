# [1.21.0](https://github.com/Stellar-Fluid/fluid/compare/v1.20.0...v1.21.0) (2026-03-30)


### Bug Fixes

* remove duplicate base64 dependency in fluid-server Cargo.toml ([816e856](https://github.com/Stellar-Fluid/fluid/commit/816e8565831cb9a695b87ecfa47a307cceb9be89))


### Features

* add multi-chain treasury overview ([e160098](https://github.com/Stellar-Fluid/fluid/commit/e1600985bec3e25f78b8d7f3e9c1f463c6e8ca43))
* data residency configuration for multi-region deployments ([870cfc2](https://github.com/Stellar-Fluid/fluid/commit/870cfc2f1c036051d69940d480258310d00fb499)), closes [#211](https://github.com/Stellar-Fluid/fluid/issues/211)
* implement bridge monitoring and stall alerting ([1931c9b](https://github.com/Stellar-Fluid/fluid/commit/1931c9bc04c332e86323d25300726e1e7ad30449))

# [1.20.0](https://github.com/Stellar-Fluid/fluid/compare/v1.19.0...v1.20.0) (2026-03-29)


### Features

* implement transaction data export to csv and pdf ([0ceb553](https://github.com/Stellar-Fluid/fluid/commit/0ceb5535ec99931650fb621bc46e43afa959154b))

# [1.19.0](https://github.com/Stellar-Fluid/fluid/compare/v1.18.0...v1.19.0) (2026-03-29)


### Features

* per-chain api key scoping ([a540424](https://github.com/Stellar-Fluid/fluid/commit/a540424e3cd7d3223f79dd37c914ea63e7e2512d)), closes [#198](https://github.com/Stellar-Fluid/fluid/issues/198)

# [1.18.0](https://github.com/Stellar-Fluid/fluid/compare/v1.17.0...v1.18.0) (2026-03-29)


### Features

* unified multi-chain dashboard tab ([1ee90a0](https://github.com/Stellar-Fluid/fluid/commit/1ee90a02485e70ee721bfb94320e3d885958c171)), closes [#197](https://github.com/Stellar-Fluid/fluid/issues/197)

# [1.17.0](https://github.com/Stellar-Fluid/fluid/compare/v1.16.0...v1.17.0) (2026-03-29)


### Features

* natural language query interface for transaction history ([3eb0894](https://github.com/Stellar-Fluid/fluid/commit/3eb0894412291f862c6518fca8a50cf8eadc5f71))

# [1.16.0](https://github.com/Stellar-Fluid/fluid/compare/v1.15.0...v1.16.0) (2026-03-29)


### Features

* cosmos ibc feegrant module adapter ([d828038](https://github.com/Stellar-Fluid/fluid/commit/d82803839a55ba6abeca5705ba733d2b9031a36b)), closes [#195](https://github.com/Stellar-Fluid/fluid/issues/195)

# [1.15.0](https://github.com/Stellar-Fluid/fluid/compare/v1.14.0...v1.15.0) (2026-03-29)


### Features

* ai-generated audit log summaries ([8dde1f6](https://github.com/Stellar-Fluid/fluid/commit/8dde1f66fec42d1166d8f20a698fe09fc8622570))

# [1.14.0](https://github.com/Stellar-Fluid/fluid/compare/v1.13.0...v1.14.0) (2026-03-29)


### Features

* soroban - evm contract state sync proof ([e752023](https://github.com/Stellar-Fluid/fluid/commit/e752023fe0977a6501b743ed1fe29f1c21dcaf51))

# [1.13.0](https://github.com/Stellar-Fluid/fluid/compare/v1.12.0...v1.13.0) (2026-03-29)


### Features

* wormhole integration ([1b7b86b](https://github.com/Stellar-Fluid/fluid/commit/1b7b86b1c39e157019c22ef7b0934d8f451072a6))

# [1.12.0](https://github.com/Stellar-Fluid/fluid/compare/v1.11.0...v1.12.0) (2026-03-29)


### Features

* embedded ai support chatbot for dashboard operators ([d2d10a4](https://github.com/Stellar-Fluid/fluid/commit/d2d10a4d50a4c34453aea7d3d6eebf19498e5f5a))

# [1.11.0](https://github.com/Stellar-Fluid/fluid/compare/v1.10.0...v1.11.0) (2026-03-29)


### Features

* ai-powered suspicious account auto-blocklist ([b774af4](https://github.com/Stellar-Fluid/fluid/commit/b774af4dd62f1a595dc3fa5979730c1e3d81acc4))

# [1.10.0](https://github.com/Stellar-Fluid/fluid/compare/v1.9.0...v1.10.0) (2026-03-29)


### Features

* unified per-chain fee oracle with usd conversion ([fd7cdd7](https://github.com/Stellar-Fluid/fluid/commit/fd7cdd798a0a1efef586fcf62d86ac688d71923f))

# [1.9.0](https://github.com/Stellar-Fluid/fluid/compare/v1.8.0...v1.9.0) (2026-03-29)


### Features

* implement chain-agnostic fee sponsorship for Stellar, EVM, and Solana ([32dad8c](https://github.com/Stellar-Fluid/fluid/commit/32dad8cc04cae8ffff2ee2fe3a4777c530af02c6))

# [1.8.0](https://github.com/Stellar-Fluid/fluid/compare/v1.7.0...v1.8.0) (2026-03-29)


### Features

* **docs:** automated documentation generator and publishing pipeline ([2d8db9e](https://github.com/Stellar-Fluid/fluid/commit/2d8db9e8c9e70ed60a171c96dde0590bd828586e))

# [1.7.0](https://github.com/Stellar-Fluid/fluid/compare/v1.6.0...v1.7.0) (2026-03-29)


### Features

* public status page with uptime and incident history ([84e8d37](https://github.com/Stellar-Fluid/fluid/commit/84e8d378698fb303c5b393035add03bf7497288e)), closes [#171](https://github.com/Stellar-Fluid/fluid/issues/171)

# [1.6.0](https://github.com/Stellar-Fluid/fluid/compare/v1.5.0...v1.6.0) (2026-03-29)


### Bug Fixes

* **ci:** add fluid-server to workspace and fix gitleaks ([9db8e76](https://github.com/Stellar-Fluid/fluid/commit/9db8e760eccce59a11fad26d2b1b05e92f959751))


### Features

* daily email digest for operator activity summary ([1ce4e2e](https://github.com/Stellar-Fluid/fluid/commit/1ce4e2e7223ac72696570abfd3301ee55788ac19))

# [1.5.0](https://github.com/Stellar-Fluid/fluid/compare/v1.4.0...v1.5.0) (2026-03-29)


### Features

* Add webhook delivery log UI in dashboard ([6d05b78](https://github.com/Stellar-Fluid/fluid/commit/6d05b78aa40f1422eecac8b4bd88708edca5b309))

# [1.4.0](https://github.com/Stellar-Fluid/fluid/compare/v1.3.0...v1.4.0) (2026-03-29)


### Features

* add admin analytics and fee estimation flows ([3e1937e](https://github.com/Stellar-Fluid/fluid/commit/3e1937e24987024f29dc2b921b654e2ca5de840f))

# [1.3.0](https://github.com/Stellar-Fluid/fluid/compare/v1.2.0...v1.3.0) (2026-03-28)


### Features

* add admin price endpoint for oracle price inspection ([0889f39](https://github.com/Stellar-Fluid/fluid/commit/0889f391e275d1243d7c69103bc68a5ed834314f))
* add PriceService with CoinGecko integration and caching ([a054bd5](https://github.com/Stellar-Fluid/fluid/commit/a054bd590595c8e3a49b6a6fb54105cb6eca0cd8))
* integrate real-time price oracle into fee-bump handler ([4c316c3](https://github.com/Stellar-Fluid/fluid/commit/4c316c39d0106e7feebf1b6ac3a7e92193c2cf63))
* interactive api playground in developer portal ([da0989c](https://github.com/Stellar-Fluid/fluid/commit/da0989ca759171c259774d14f729a85618bd9a51)), closes [#168](https://github.com/Stellar-Fluid/fluid/issues/168)

# [1.2.0](https://github.com/Stellar-Fluid/fluid/compare/v1.1.0...v1.2.0) (2026-03-28)


### Features

* add real-time notification centre in dashboard header ([b506146](https://github.com/Stellar-Fluid/fluid/commit/b5061465d1f7903e7310532e5e2a5154f803929e)), closes [#161](https://github.com/Stellar-Fluid/fluid/issues/161)

# [1.1.0](https://github.com/Stellar-Fluid/fluid/compare/v1.0.0...v1.1.0) (2026-03-28)


### Features

* add treasury refill worker with periodic balance checks ([b3fc09c](https://github.com/Stellar-Fluid/fluid/commit/b3fc09c62733c6a4f3ad65a5ca9e49ae2ed45418))
* add TreasurySwapService for Soroban AMM integration ([44ad631](https://github.com/Stellar-Fluid/fluid/commit/44ad6313ba8c5ef7820c8d1d26c3524d26072d73))
* wire treasury refill worker into server startup ([79e7f43](https://github.com/Stellar-Fluid/fluid/commit/79e7f43afd047a177cd976eafd22bfdd394de796))

# 1.0.0 (2026-03-28)


### Bug Fixes

* add type guard for phone numbers in TwilioNotifier ([bc8ff14](https://github.com/Stellar-Fluid/fluid/commit/bc8ff1431fae97bd67337a3780a6fd181cac4cd6))
* correct docker-compose.yml syntax and add version key ([b74eb72](https://github.com/Stellar-Fluid/fluid/commit/b74eb72cbc9911221a4ccc32cda462c7c83fb6db))
* ensure sdk compatibility across multiple stellar-sdk versions ([a26cc7e](https://github.com/Stellar-Fluid/fluid/commit/a26cc7e0a1db9325de20c96c28023055d73a3bcf))
* harden native signing benchmark path ([ce13804](https://github.com/Stellar-Fluid/fluid/commit/ce13804fd83c33e1d0ed2517c723ee1a526d36de))
* normalize searchParams type in transactions page ([4144325](https://github.com/Stellar-Fluid/fluid/commit/4144325a286943d816af6ce6f98563eb0747debc))
* Pin next eslint config import to .js modules ([b66ebef](https://github.com/Stellar-Fluid/fluid/commit/b66ebefa39fb2e3b051539e3570cf7b11f04fc2c))
* remove unused import ([5f2cce0](https://github.com/Stellar-Fluid/fluid/commit/5f2cce041c722168541eb81116e8c238565545a2))
* reorder import statements for clarity ([a57d094](https://github.com/Stellar-Fluid/fluid/commit/a57d0944c9947ec64c34694d758c6db2d7017b12))
* resolve env.example merge conflict, keep partner cert + roadmap + sandbox vars ([b152c05](https://github.com/Stellar-Fluid/fluid/commit/b152c056c951283e04f87380e8f6fe40a644423f))
* resolve merge conflict in server/.env.example ([ae7ca6d](https://github.com/Stellar-Fluid/fluid/commit/ae7ca6d025fc921a5620f878fbaab0316b39d5d4))
* resolve merge conflicts with upstream ([c10058b](https://github.com/Stellar-Fluid/fluid/commit/c10058b66fb5224b7657505d20cae2d104ab241e))
* resolve Navbar merge conflict, keep partners + roadmap + changelog links ([9532492](https://github.com/Stellar-Fluid/fluid/commit/95324923c48cef85bba79823aba4080b77571ff7))
* resolve TypeScript errors in twilioNotifier test file ([b31410c](https://github.com/Stellar-Fluid/fluid/commit/b31410c2e6f99ff67976903d450b1773986f5f3e))
* restore rust ci compatibility ([313bce2](https://github.com/Stellar-Fluid/fluid/commit/313bce2311a67242504c486cd57f3410e8a0e884))
* restore server build after upstream merge ([74c87fd](https://github.com/Stellar-Fluid/fluid/commit/74c87fd27879bd13e2c8194ead25f74ec5a6f714))
* **rust:** synchronize environment-dependent tests to prevent flakiness ([45e5d18](https://github.com/Stellar-Fluid/fluid/commit/45e5d18454ea67a7d17d97b60814735608fad766))
* sign Stellar transaction hashes in rust path ([d3e1002](https://github.com/Stellar-Fluid/fluid/commit/d3e1002c958079eed128c6904948cd392196fcd7))
* transaction sample data type shape ([2a14ace](https://github.com/Stellar-Fluid/fluid/commit/2a14ace78a0ba2020d3465c3fa4c639a8467a9f9))
* update workflow before rebase ([1031169](https://github.com/Stellar-Fluid/fluid/commit/10311691a97d510f52e88853b985775419a9e908))


### Features

* add automated low-balance alerting for fee payers ([fccea06](https://github.com/Stellar-Fluid/fluid/commit/fccea063929bc2cf8d0f925c6cb83c57d9b4e017))
* add background worker for ledger persistence tracking ([77366ce](https://github.com/Stellar-Fluid/fluid/commit/77366cea761baf460be34c2062be262221125a49)), closes [#29](https://github.com/Stellar-Fluid/fluid/issues/29)
* add badge generator feature with SVG support and embed codes ([56c99ef](https://github.com/Stellar-Fluid/fluid/commit/56c99efc8b0b5a4ef2f975e19870c96945afd99d))
* add daily spend analytics chart using recharts ([e4ea76e](https://github.com/Stellar-Fluid/fluid/commit/e4ea76ebf8885bc0ed17dd1e99cbb3c9e9ec6317))
* add dark/light mode theme support and toggle ([977d314](https://github.com/Stellar-Fluid/fluid/commit/977d314230eceedaf6b93d44e63513c07fe353c5))
* add dashboard DLQ API route, types, and data loader ([a09bc59](https://github.com/Stellar-Fluid/fluid/commit/a09bc596d330e74da27df17fc4a37f43c0c271d8))
* add discord milestone notifications for community engagement ([93fe9ba](https://github.com/Stellar-Fluid/fluid/commit/93fe9ba694c85290b50f7c1baa65c629310890fa))
* add DLQ dashboard page with bulk replay and delete ([500c96d](https://github.com/Stellar-Fluid/fluid/commit/500c96d31e1c05a1a13c4b93348c34b0959336b6))
* add email alerting for low fee-payer balance ([1ffb138](https://github.com/Stellar-Fluid/fluid/commit/1ffb13828fd188bbbf19308adceffc8dd7737e6b))
* add github api service for fetching releases ([53d6b92](https://github.com/Stellar-Fluid/fluid/commit/53d6b92054d6b2d53067d408095c4c1d17e6b2c7))
* add global command palette for hash and tenant search ([ae825d3](https://github.com/Stellar-Fluid/fluid/commit/ae825d39b107522febaa2146b1619b5e5573ef58))
* add horizon rpc fallback redundancy ([f84faea](https://github.com/Stellar-Fluid/fluid/commit/f84faeac3ff1439a74e245e1d3a9f810bf0dd54f))
* add horizon rpc fallback redundancy ([6b44e57](https://github.com/Stellar-Fluid/fluid/commit/6b44e573471f7d837e6a7e04c0fda579c1c4a6f3))
* add KPI stat card component ([ecbd2d5](https://github.com/Stellar-Fluid/fluid/commit/ecbd2d5f11f2758fbd0c0b8873fc90b10fb580d6))
* add offline mode and transaction queueing to client sdk ([4648b04](https://github.com/Stellar-Fluid/fluid/commit/4648b049e1e9486539493805c7108457e59c0e97))
* add overview KPI cards to dashboard ([a0a8cbe](https://github.com/Stellar-Fluid/fluid/commit/a0a8cbe287f7113ff8b200208aac60390f0bf1f5))
* add per-tenant webhook event type filtering ([f10f4ba](https://github.com/Stellar-Fluid/fluid/commit/f10f4ba78eba5c7050aea1622599c3bcd84a79eb))
* add prometheus metrics for server observability ([0aaaec4](https://github.com/Stellar-Fluid/fluid/commit/0aaaec40a1e437bff1d7936b0bfb7c61a9d2e690))
* add Quickstart Wizard component and related API for onboarding ([6d9a5c9](https://github.com/Stellar-Fluid/fluid/commit/6d9a5c92c428dd52ef19793aa38bfbd81de8a493))
* add responsive dashboard layout with glassmorphism sidebar ([88dcb5f](https://github.com/Stellar-Fluid/fluid/commit/88dcb5f45621950b554b8ce01dfac9fc9fc14950))
* add round-robin server fallback to client sdk ([34dcf01](https://github.com/Stellar-Fluid/fluid/commit/34dcf0198726e51047a1effe2ea3899e4eac2da7))
* add rss feed and update navigation ([d3191d4](https://github.com/Stellar-Fluid/fluid/commit/d3191d48f2d6a6a295adf89c95777d108494a211))
* add server-side DLQ API endpoints ([3193e28](https://github.com/Stellar-Fluid/fluid/commit/3193e28f57520a980aed5b8e46fccb6d2a862e1b))
* add signer pool management and status ui ([4ab91b6](https://github.com/Stellar-Fluid/fluid/commit/4ab91b61acee11b6af179fe2cbf5152da893aa2e))
* add slack webhook alerting for critical events ([fe6ae26](https://github.com/Stellar-Fluid/fluid/commit/fe6ae262b51ce3e7956aa6f44daf7b1c2e4ce695))
* add soroban preflight simulation for precise resource fees ([55a009a](https://github.com/Stellar-Fluid/fluid/commit/55a009afe57b82cfe149341c2ea53fb1dd61834b))
* add standalone UMD bundle and CDN usage instructions ([157b9bd](https://github.com/Stellar-Fluid/fluid/commit/157b9bddf30dc57a8575786a9917be85128a4dc7))
* add stripe webhook handler to automatically unlock quotas ([1ef16f2](https://github.com/Stellar-Fluid/fluid/commit/1ef16f2afe58026b8139d46dd803c933c583ab5b)), closes [#140](https://github.com/Stellar-Fluid/fluid/issues/140)
* add tenant and api key database models ([3cb1881](https://github.com/Stellar-Fluid/fluid/commit/3cb18810c3ffae53291152f7fad55cfda6b0b1b5))
* add tenant webhooks support ([f2a9836](https://github.com/Stellar-Fluid/fluid/commit/f2a983675b45f03f2096ffac35b0de3d52c1ffcf))
* add tiered API key rate limiting ([0788ee3](https://github.com/Stellar-Fluid/fluid/commit/0788ee3196c17cc7e93d17c8b8471c6115b5bb3a))
* add tx confirmation polling ([5af9122](https://github.com/Stellar-Fluid/fluid/commit/5af9122da4080161e985c9608827ccbe69b954b8))
* add tx confirmation polling ([7f2502f](https://github.com/Stellar-Fluid/fluid/commit/7f2502f094b4781deb73c81485cec2c04ad8a065))
* add useFeeBump react hook for seamless frontend integration ([ecb511a](https://github.com/Stellar-Fluid/fluid/commit/ecb511ad83846e86bcc6756c24fa65538484bf8d))
* add vue 3 composables for fluid sdk ([27534cd](https://github.com/Stellar-Fluid/fluid/commit/27534cd46c43f592c75e333ff34673b94b0a588a))
* add webhook_dlq table to Prisma schema ([cbcf1e9](https://github.com/Stellar-Fluid/fluid/commit/cbcf1e93d032c28d6abe1fda165c7da291cfe960))
* add zod validation for fee-bump endpoint ([0a7cb2d](https://github.com/Stellar-Fluid/fluid/commit/0a7cb2d9092a56c0181c9e52bc254cebd032c83d))
* added cargo config for release build ([fbbdeb6](https://github.com/Stellar-Fluid/fluid/commit/fbbdeb6d5da7b0dfd322a79fac82b9ab4e56103a))
* added cargo config for wasm build ([5713c26](https://github.com/Stellar-Fluid/fluid/commit/5713c264826097ab99bb5eac039a5fd03bc24033))
* **admin:** add API key management interface ([d364af1](https://github.com/Stellar-Fluid/fluid/commit/d364af1c82801c471fd484073b18a1b43efe66c5))
* affiliate referral program for quota rewards ([99099be](https://github.com/Stellar-Fluid/fluid/commit/99099bebb2de5354f2944da72c3fa32f1151bfa2))
* build public developer portal landing page ([e2d5a26](https://github.com/Stellar-Fluid/fluid/commit/e2d5a26f3dbf3967a97a502a67125abe6fa73e1c))
* **client:** add high-level sac contract abstraction to sdk ([424fd88](https://github.com/Stellar-Fluid/fluid/commit/424fd8818f40d9ab051106d4a573cfc9f520dc4a)), closes [hi#level](https://github.com/hi/issues/level)
* community forum integration (Discourse embed) ([410c768](https://github.com/Stellar-Fluid/fluid/commit/410c76804bc6cace2db2fe78cecdda1c02e43418))
* complete parity - rust server ready to replace node.js ([cce7cc2](https://github.com/Stellar-Fluid/fluid/commit/cce7cc2ef6b005124c1b5b992ac4cd7988c19d5a))
* **dashboard:** add tenant usage leaderboard component ([920c2cb](https://github.com/Stellar-Fluid/fluid/commit/920c2cbcee3c814160bbae2e18b1badf6b9273e1))
* enforce XDR size and operation count limits ([8dbc57d](https://github.com/Stellar-Fluid/fluid/commit/8dbc57d8bea1c285ca5b6fd560384c8acfef1d49))
* firebase cloud messaging push notifications for admins ([754c7d2](https://github.com/Stellar-Fluid/fluid/commit/754c7d2c26ed3255a12beb8f56b129e31b377fd0))
* implement basic anonymous telemetry for sdk maintenance ([ce357c1](https://github.com/Stellar-Fluid/fluid/commit/ce357c19e46fe72c13c76e179ff7284106287097))
* implement changelog page and UI components ([b954915](https://github.com/Stellar-Fluid/fluid/commit/b95491536e5d66684e14434249a7365b2e35a7ec))
* implement daily XLM quotas per tenant ([05539fc](https://github.com/Stellar-Fluid/fluid/commit/05539fc60b511df3fbec2fa1d74869f64197a068))
* implement dynamic fee calculation for fee-bump transactions ([17aa0cd](https://github.com/Stellar-Fluid/fluid/commit/17aa0cd98180884852e22b066d12931fcf580d9e))
* implement dynamic load balancing for signing accounts ([777be2d](https://github.com/Stellar-Fluid/fluid/commit/777be2d5f38dc467952262f3c83bb5a2af054c39))
* implement fee payer rotation with multiple accounts ([cdef586](https://github.com/Stellar-Fluid/fluid/commit/cdef5865eff53e82f51432a3fc5f61f65fdf508f))
* implement fluid-cli skeleton, add USAGE.md and screenshots ([f313751](https://github.com/Stellar-Fluid/fluid/commit/f31375165b48ba37eddeb8e38db836f13ad926dd))
* implement friendly error mapping for soroban simulations ([53382b3](https://github.com/Stellar-Fluid/fluid/commit/53382b3f8f057751f0747d7f5bcc184f7c26bdc9))
* implement generic auth middleware for bearer and x-api-key verification ([8b74948](https://github.com/Stellar-Fluid/fluid/commit/8b7494866bfd42114128ae6813a8703616f025f7))
* implement high-performance xdr parsing in rust ([173a3ef](https://github.com/Stellar-Fluid/fluid/commit/173a3ef9833587ab55f06418a477ddeae8848ef0)), closes [hi#performance](https://github.com/hi/issues/performance)
* implement multi-account signer pool for high throughpu ([9fb0319](https://github.com/Stellar-Fluid/fluid/commit/9fb031912fcd4a474a5c1d492482fe9b7bfab24e))
* implement network isolation for transactions ([53e35e3](https://github.com/Stellar-Fluid/fluid/commit/53e35e37f3701cd29b4d4bf22a51819ff6183746))
* implement paginated transaction history table ([27c13fe](https://github.com/Stellar-Fluid/fluid/commit/27c13fe292dae57c799abffadb4b64891c4e12c6))
* implement secure admin authentication with nextauth.js ([#63](https://github.com/Stellar-Fluid/fluid/issues/63)) ([1d51af2](https://github.com/Stellar-Fluid/fluid/commit/1d51af2c43265c8602f9c7a6d820dfe6fe3dd70a))
* implement settlement verification for non-xlm fee payments ([385d8b2](https://github.com/Stellar-Fluid/fluid/commit/385d8b23212b7c4e4ff64672b570e59f1a312dcc)), closes [#133](https://github.com/Stellar-Fluid/fluid/issues/133)
* implement slippage protection for token-based fee payments ([3efe494](https://github.com/Stellar-Fluid/fluid/commit/3efe494e3bddb036fc4602d28b1a35d077f1ad81)), closes [#136](https://github.com/Stellar-Fluid/fluid/issues/136)
* implement tiered saas subscription modules for tenants ([fd1d8aa](https://github.com/Stellar-Fluid/fluid/commit/fd1d8aae008921df67eab9558092a2608ae1b8ef))
* implement tiered saas subscription modules for tenants ([9119ce3](https://github.com/Stellar-Fluid/fluid/commit/9119ce30f4d918568d517c1327279b6fe3764679))
* implement tiered saas subscription modules for tenants ([be27ad3](https://github.com/Stellar-Fluid/fluid/commit/be27ad388a695b5b5029cc5568803340e96d99bb))
* implement token whitelisting and configurable fee assets ([4456efb](https://github.com/Stellar-Fluid/fluid/commit/4456efbdc93ad50c99397da0df651e401e9b778b))
* implement user registration and email verification flow ([0738e12](https://github.com/Stellar-Fluid/fluid/commit/0738e12de9872099b8ff5734af9242a17517eb80))
* implement webhook retry and sequence number manager ([4f52c77](https://github.com/Stellar-Fluid/fluid/commit/4f52c77bd53eb54b18954858d1c8573bc5351465))
* initialize fluid go sdk (fluid-go) ([c695282](https://github.com/Stellar-Fluid/fluid/commit/c6952825a09a6fd462097354ee118aab15f2d387))
* initialize rust axum server for high-performance backend ([0920384](https://github.com/Stellar-Fluid/fluid/commit/092038452f226f0bb47f28c7bfa695508da2afff)), closes [hi#performance](https://github.com/hi/issues/performance) [#40](https://github.com/Stellar-Fluid/fluid/issues/40)
* integrate freighter wallet for easy treasury funding ([1e7b2a5](https://github.com/Stellar-Fluid/fluid/commit/1e7b2a5a8cf6159d9fc590ea47314dc04d50556b))
* integrate stripe for fiat-to-quota pre-payments ([8d3bac4](https://github.com/Stellar-Fluid/fluid/commit/8d3bac448c19bd2e09f409c6cc07beeee5062eb9)), closes [#139](https://github.com/Stellar-Fluid/fluid/issues/139)
* integrated rust server with postgres using sqlx ([caa813b](https://github.com/Stellar-Fluid/fluid/commit/caa813b314731e723e03f6af27298c510d03c700))
* migrate to structured logging with pino ([f6d5048](https://github.com/Stellar-Fluid/fluid/commit/f6d50481cf34c655c63754126bef0d60fb227e21))
* Migration Strategy ([ce17b87](https://github.com/Stellar-Fluid/fluid/commit/ce17b872e30e25cb401aee61d626b183d1bff165))
* move permanently failed webhooks to dead-letter queue ([2a07534](https://github.com/Stellar-Fluid/fluid/commit/2a07534ede8ffe79c39cb0fda4ba7d0bf65676cf))
* pagerduty integration for p1 incident alerting ([ff3bf09](https://github.com/Stellar-Fluid/fluid/commit/ff3bf0934c01458486bf729cb904d2040d22c113))
* partner certification badge and directory ([05a5e6b](https://github.com/Stellar-Fluid/fluid/commit/05a5e6bbed215825fb113ffefe401becaf3ce922))
* plugin marketplace for third-party fluid adapters ([ad95865](https://github.com/Stellar-Fluid/fluid/commit/ad95865acdc661560b315ea01c81f9a7487e5d94))
* Prisma ORM Setup and PostgreSQL Connection ([8bd73c5](https://github.com/Stellar-Fluid/fluid/commit/8bd73c5f171c954b54868cd518548c7e096ecda8))
* public roadmap voting board for community input ([4cce726](https://github.com/Stellar-Fluid/fluid/commit/4cce726c7755f6f48cad623c0b577a8cc25b79e2))
* publish fluid-core crate for library reuse ([e5c0d2b](https://github.com/Stellar-Fluid/fluid/commit/e5c0d2b6dafeb8dfb7fb6d98cc06467018ed2844))
* redis caching for api key validation ([233d4fc](https://github.com/Stellar-Fluid/fluid/commit/233d4fca34b3fd3fdc470465ec0948fe6e137d46))
* refactor health check into modular service with Horizon and fee payer validation ([a947273](https://github.com/Stellar-Fluid/fluid/commit/a94727331db123d9a2bc5defc7b64037386d5ae1))
* replace in-memory stores with Prisma/PostgreSQL across all layers ([241587e](https://github.com/Stellar-Fluid/fluid/commit/241587e99eb622b256f66035631387a5c7256c17))
* resettable api sandbox for developer testing ([9365f21](https://github.com/Stellar-Fluid/fluid/commit/9365f21f3c5912d6fadaf2d20b9b250b5443b167))
* SAST Integration (CodeQL/SonarQube) ([9970ca0](https://github.com/Stellar-Fluid/fluid/commit/9970ca0d59642f6c2d9aa8ce57a7eb0ddbf18b33))
* sdk download and version registry page ([5c2f4b8](https://github.com/Stellar-Fluid/fluid/commit/5c2f4b842eed92b5108afc2444f086c5890b07f6))
* support Soroban resource fees in fee-bump ([de5f15b](https://github.com/Stellar-Fluid/fluid/commit/de5f15bdb6debbadf5fb85d98753f425073fa98d))
* support Soroban resource fees in fee-bump ([97ac046](https://github.com/Stellar-Fluid/fluid/commit/97ac0464c190368def0db5de23c9487d47e14a18))
* telegram bot alerts for operator notifications [[#155](https://github.com/Stellar-Fluid/fluid/issues/155)] ([6b2f60a](https://github.com/Stellar-Fluid/fluid/commit/6b2f60a1e08741e54baeeee368444cdef1c74c49))
* twilio sms alerting for critical balance events ([01a2fed](https://github.com/Stellar-Fluid/fluid/commit/01a2fed53064ae19ae6262b6ccc096e15bb2f5f6))


### Performance Improvements

* optimize ed25519 signature generation in rust ([71ba830](https://github.com/Stellar-Fluid/fluid/commit/71ba8305568ae9ec18f3d8172c417dbcd4c9e257))
* optimize sdk for effective tree-shaking and bundle size ([60c291e](https://github.com/Stellar-Fluid/fluid/commit/60c291ef53f32d9b363216c5df40c28c78cd143c))
* optimized tokio runtime for multi-core environments ([ac02977](https://github.com/Stellar-Fluid/fluid/commit/ac02977e818d792c3f3d3ab75a8a36a7d584bdba)), closes [#60](https://github.com/Stellar-Fluid/fluid/issues/60)
* use rust wasm in a web worker for off-thread signing ([9e01247](https://github.com/Stellar-Fluid/fluid/commit/9e0124762905a87d8345657d1d0c02b24812dc30)), closes [#130](https://github.com/Stellar-Fluid/fluid/issues/130)
