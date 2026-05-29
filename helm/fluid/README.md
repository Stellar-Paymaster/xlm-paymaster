# Fluid Helm Chart

Deploys the complete Fluid stack on Kubernetes: node-api, rust-engine, PostgreSQL, Redis, and the admin dashboard.

## Prerequisites

- Kubernetes 1.25+
- Helm 3.10+
- An nginx Ingress Controller (for ingress and RPS-based autoscaling)
- `cert-manager` (optional, for TLS)
- Prometheus Operator (optional, for `serviceMonitor.enabled=true`)

## Quick start (local kind/minikube)

```bash
# 1. Create a values override for secrets
cat > my-values.yaml <<EOF
secrets:
  fluidFeePayerSecret: "SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
  authSecret: "change-me-random-32-chars"
  adminEmail: "admin@example.com"
  adminPasswordHash: "\$2a\$12\$..."
postgres:
  auth:
    password: "changeme"
ingress:
  hosts:
    - host: fluid.localhost
      paths:
        - path: /
          pathType: Prefix
          service: node-api
EOF

# 2. Install
helm install fluid ./helm/fluid -f my-values.yaml

# 3. Watch pods come up
kubectl get pods -w
```

## Configuration

See [values.yaml](values.yaml) for the full list of configurable parameters. Key settings:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `nodeApi.replicaCount` | `2` | Initial node-api replica count |
| `nodeApi.statelessMode` | `"true"` | Disable in-memory fallbacks for horizontal scaling |
| `hpa.enabled` | `true` | Enable HPA for the node-api |
| `hpa.minReplicas` | `2` | Minimum node-api pods |
| `hpa.maxReplicas` | `20` | Maximum node-api pods |
| `hpa.cpuTargetUtilizationPercent` | `70` | CPU % that triggers scale-up |
| `hpa.rpsTargetPerPod` | `200` | RPS per pod that triggers scale-up |
| `hpa.scaleDownStabilizationWindowSeconds` | `300` | Seconds to wait before scaling down |
| `serviceMonitor.enabled` | `false` | Create a Prometheus Operator ServiceMonitor |
| `ingress.enabled` | `true` | Create an Ingress resource |
| `secrets.existingSecret` | `""` | Use an existing Secret instead of creating one |

## Autoscaling

The HPA scales the node-api between `hpa.minReplicas` and `hpa.maxReplicas` based on:

1. **CPU** — scales up when average CPU across all pods exceeds `cpuTargetUtilizationPercent` (default 70%).
2. **RPS** — scales up when average requests per second per pod exceeds `rpsTargetPerPod` (default 200).

The RPS metric requires the Prometheus Adapter. Install it once per cluster:

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm install prometheus-adapter prometheus-community/prometheus-adapter \
  --namespace monitoring --create-namespace \
  -f helm/fluid/prometheus-adapter-values.yaml
```

Then enable the ServiceMonitor in your values:

```yaml
serviceMonitor:
  enabled: true
  namespace: monitoring
```

## Secrets management

For production use the External Secrets Operator or Vault Agent Injector instead of chart-managed secrets. Set `secrets.existingSecret` to the name of a pre-existing Kubernetes Secret containing the keys listed in `templates/secrets.yaml`.

## Upgrading

```bash
helm upgrade fluid ./helm/fluid -f my-values.yaml
```
