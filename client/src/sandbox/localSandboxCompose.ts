export interface LocalSandboxComposeConfig {
  postgresPort?: number;
  horizonPort?: number;
  paymasterPort?: number;
  postgresUser?: string;
  postgresPassword?: string;
  postgresDb?: string;
}

const DEFAULT_CONFIG: Required<LocalSandboxComposeConfig> = {
  postgresPort: 55432,
  horizonPort: 18080,
  paymasterPort: 18081,
  postgresUser: "paymaster",
  postgresPassword: "paymaster",
  postgresDb: "paymaster",
};

export function buildLocalSandboxCompose(input: LocalSandboxComposeConfig = {}): string {
  const config = { ...DEFAULT_CONFIG, ...input };
  const connectionString = `postgres://${config.postgresUser}:${config.postgresPassword}@postgres:5432/${config.postgresDb}`;

  return `services:
  postgres:
    image: postgres:16-alpine
    container_name: paymaster-sandbox-postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${config.postgresDb}
      POSTGRES_USER: ${config.postgresUser}
      POSTGRES_PASSWORD: ${config.postgresPassword}
    ports:
      - "${config.postgresPort}:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${config.postgresUser} -d ${config.postgresDb}"]
      interval: 5s
      timeout: 5s
      retries: 10

  mock-horizon:
    image: ealen/echo-server:0.9.2
    container_name: paymaster-sandbox-mock-horizon
    restart: unless-stopped
    ports:
      - "${config.horizonPort}:80"

  paymaster:
    build:
      context: ../../paymaster-server
      dockerfile: Dockerfile
    container_name: paymaster-sandbox-server
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
      mock-horizon:
        condition: service_started
    environment:
      PAYMASTER_SERVER_PORT: "8080"
      PAYMASTER_DATABASE_URL: "${connectionString}"
      PAYMASTER_HORIZON_URL: "http://mock-horizon"
      PAYMASTER_ADMIN_TOKEN: "local-dev-admin-token"
    ports:
      - "${config.paymasterPort}:8080"
`;
}

export function getSandboxComposePath(): string {
  return "src/sandbox/docker-compose.local.yml";
}

export function getSandboxSpinUpCommand(): string {
  const file = getSandboxComposePath();
  return `docker compose -f ${file} up -d --build`;
}
