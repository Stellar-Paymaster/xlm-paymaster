terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    # Override via -backend-config or environment variables
    bucket = "fluid-terraform-state"
    key    = "multi-region/terraform.tfstate"
    region = "us-east-1"
  }
}

# ── Provider aliases for each region ──────────────────��──────────────────────

provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}

provider "aws" {
  alias  = "eu_west_1"
  region = "eu-west-1"
}

# ── Region A (us-east-1) ────────────────────────��────────────────────────────

module "region_a" {
  source = "./modules/fluid-region"

  providers = {
    aws = aws.us_east_1
  }

  region_name          = "us-east-1"
  environment          = var.environment
  vpc_cidr             = var.region_a_vpc_cidr
  availability_zones   = var.region_a_availability_zones
  api_instance_type    = var.api_instance_type
  rust_instance_type   = var.rust_instance_type
  api_desired_capacity = var.api_desired_capacity
  db_instance_class    = var.db_instance_class
  redis_node_type      = var.redis_node_type
  ssl_certificate_arn  = var.region_a_ssl_certificate_arn
  domain_name          = var.domain_name
  image_tag            = var.image_tag
  db_password          = var.db_password
  encryption_key       = var.encryption_key
}

# ── Region B (eu-west-1) ──────────────────────────��──────────────────────────

module "region_b" {
  source = "./modules/fluid-region"

  providers = {
    aws = aws.eu_west_1
  }

  region_name          = "eu-west-1"
  environment          = var.environment
  vpc_cidr             = var.region_b_vpc_cidr
  availability_zones   = var.region_b_availability_zones
  api_instance_type    = var.api_instance_type
  rust_instance_type   = var.rust_instance_type
  api_desired_capacity = var.api_desired_capacity
  db_instance_class    = var.db_instance_class
  redis_node_type      = var.redis_node_type
  ssl_certificate_arn  = var.region_b_ssl_certificate_arn
  domain_name          = var.domain_name
  image_tag            = var.image_tag
  db_password          = var.db_password
  encryption_key       = var.encryption_key
}

# ── Route 53 latency-based routing ───────────────────────────────────────────

resource "aws_route53_zone" "fluid" {
  name = var.domain_name
}

resource "aws_route53_health_check" "region_a" {
  fqdn              = module.region_a.alb_dns_name
  port              = 443
  type              = "HTTPS"
  resource_path     = "/health"
  failure_threshold = 3
  request_interval  = 10

  tags = {
    Name = "fluid-${var.environment}-us-east-1"
  }
}

resource "aws_route53_health_check" "region_b" {
  fqdn              = module.region_b.alb_dns_name
  port              = 443
  type              = "HTTPS"
  resource_path     = "/health"
  failure_threshold = 3
  request_interval  = 10

  tags = {
    Name = "fluid-${var.environment}-eu-west-1"
  }
}

resource "aws_route53_record" "api_us_east_1" {
  zone_id        = aws_route53_zone.fluid.zone_id
  name           = "api.${var.domain_name}"
  type           = "A"
  set_identifier = "us-east-1"

  latency_routing_policy {
    region = "us-east-1"
  }

  health_check_id = aws_route53_health_check.region_a.id

  alias {
    name                   = module.region_a.alb_dns_name
    zone_id                = module.region_a.alb_zone_id
    evaluate_target_health = true
  }
}

resource "aws_route53_record" "api_eu_west_1" {
  zone_id        = aws_route53_zone.fluid.zone_id
  name           = "api.${var.domain_name}"
  type           = "A"
  set_identifier = "eu-west-1"

  latency_routing_policy {
    region = "eu-west-1"
  }

  health_check_id = aws_route53_health_check.region_b.id

  alias {
    name                   = module.region_b.alb_dns_name
    zone_id                = module.region_b.alb_zone_id
    evaluate_target_health = true
  }
}
