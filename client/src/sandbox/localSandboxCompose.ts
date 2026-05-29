export interface LocalSandboxComposeConfig {
  postgresPort?: number;
  horizonPort?: number;
  fluidPort?: number;
  postgresUser?: string;
  postgresPassword?: string;
  postgresDb?: string;
}

const DEFAULT_CONFIG: Required<LocalSandboxComposeConfig> = {
  postgresPort: 55432,
  horizonPort: 18080,
  fluidPort: 18081,
  postgresUser: "fluid",
  postgresPassword: "fluid",
  postgresDb: "fluid",
};

export function buildLocalSandboxCompose(input: LocalSandboxComposeConfig = {}): string {
  const config = { ...DEFAULT_CONFIG, ...input };
  const connectionString = `postgres://${config.postgresUser}:${config.postgresPassword}@postgres:5432/${config.postgresDb}`;

  return `services:
  postgres:
    image: postgres:16-alpine
    container_name: fluid-sandbox-postgres
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
    container_name: fluid-sandbox-mock-horizon
    restart: unless-stopped
    ports:
      - "${config.horizonPort}:80"

  fluid:
    build:
      context: ../../fluid-server
      dockerfile: Dockerfile
    container_name: fluid-sandbox-server
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
      mock-horizon:
        condition: service_started
    environment:
      FLUID_SERVER_PORT: "8080"
      FLUID_DATABASE_URL: "${connectionString}"
      FLUID_HORIZON_URL: "http://mock-horizon"
      FLUID_ADMIN_TOKEN: "local-dev-admin-token"
    ports:
      - "${config.fluidPort}:8080"
`;
}

export function getSandboxComposePath(): string {
  return "src/sandbox/docker-compose.local.yml";
}

export function getSandboxSpinUpCommand(): string {
  const file = getSandboxComposePath();
  return `docker compose -f ${file} up -d --build`;
}
