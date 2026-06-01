# Fluid Multi-Region Terraform

Provisions an active-active two-region Fluid deployment on AWS.

## Prerequisites

- Terraform >= 1.6
- AWS credentials with sufficient permissions (`ecs:*`, `ec2:*`, `route53:*`, `elasticache:*`, `secretsmanager:*`, `iam:*`)
- ACM certificates already issued in both regions

## Usage

```bash
cd infra/terraform/multi-region

# First-time setup
terraform init

# Preview changes
terraform plan \
  -var-file=staging.tfvars \
  -var="db_password=$DB_PASSWORD" \
  -var="encryption_key=$ENCRYPTION_KEY"

# Apply
terraform apply \
  -var-file=staging.tfvars \
  -var="db_password=$DB_PASSWORD" \
  -var="encryption_key=$ENCRYPTION_KEY"
```

## Outputs

| Output | Description |
|--------|-------------|
| `region_a_alb_dns` | ALB DNS for us-east-1 |
| `region_b_alb_dns` | ALB DNS for eu-west-1 |
| `api_endpoint` | Global Route 53 latency-routed endpoint |
| `route53_zone_id` | Hosted zone ID |

## Architecture

See [`docs/multi-region-architecture.md`](../../../docs/multi-region-architecture.md)
for the full architecture diagram and documentation.

## Module Structure

```
multi-region/
├── main.tf           # Root module — Route 53 + two region modules
├── variables.tf      # Input variables
├── outputs.tf        # Root outputs
├── staging.tfvars    # Staging variable values
└── modules/
    └── fluid-region/ # Reusable per-region module (VPC, ECS, Redis, ALB)
        ├── main.tf
        ├── variables.tf
        └── outputs.tf
```
