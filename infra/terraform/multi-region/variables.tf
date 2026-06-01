variable "environment" {
  description = "Deployment environment (staging, production)"
  type        = string
  default     = "staging"
}

variable "domain_name" {
  description = "Base domain name (e.g. fluid.example.com)"
  type        = string
}

variable "image_tag" {
  description = "Docker image tag for the API and Rust engine containers"
  type        = string
  default     = "latest"
}

# ── Region A ─────────────────────────────────────────────────────────────────

variable "region_a_vpc_cidr" {
  description = "VPC CIDR for us-east-1"
  type        = string
  default     = "10.0.0.0/16"
}

variable "region_a_availability_zones" {
  description = "AZs to use in us-east-1"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b"]
}

variable "region_a_ssl_certificate_arn" {
  description = "ACM certificate ARN for us-east-1"
  type        = string
}

# ── Region B ────────────────────────────────────────────────────��────────────

variable "region_b_vpc_cidr" {
  description = "VPC CIDR for eu-west-1"
  type        = string
  default     = "10.1.0.0/16"
}

variable "region_b_availability_zones" {
  description = "AZs to use in eu-west-1"
  type        = list(string)
  default     = ["eu-west-1a", "eu-west-1b"]
}

variable "region_b_ssl_certificate_arn" {
  description = "ACM certificate ARN for eu-west-1"
  type        = string
}

# ── Shared compute ───────────────────────────────────────────────────────────

variable "api_instance_type" {
  description = "EC2 instance type for Node API"
  type        = string
  default     = "t3.small"
}

variable "rust_instance_type" {
  description = "EC2 instance type for Rust engine"
  type        = string
  default     = "t3.small"
}

variable "api_desired_capacity" {
  description = "Desired number of Node API instances per region"
  type        = number
  default     = 2
}

variable "db_instance_class" {
  description = "RDS / CockroachDB node instance class"
  type        = string
  default     = "db.t3.medium"
}

variable "redis_node_type" {
  description = "ElastiCache Redis node type"
  type        = string
  default     = "cache.t3.micro"
}

# ── Secrets (mark sensitive) ─────────────────────────────────────────────────

variable "db_password" {
  description = "Database superuser password"
  type        = string
  sensitive   = true
}

variable "encryption_key" {
  description = "32-byte base64 encryption key for DATABASE_ENCRYPTION_KEY"
  type        = string
  sensitive   = true
}
