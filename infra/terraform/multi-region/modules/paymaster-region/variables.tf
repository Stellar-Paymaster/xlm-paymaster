variable "region_name" {
  description = "AWS region (e.g. us-east-1)"
  type        = string
}

variable "environment" {
  description = "Deployment environment (staging, production)"
  type        = string
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
}

variable "availability_zones" {
  description = "List of availability zones to deploy into"
  type        = list(string)
}

variable "api_instance_type" {
  description = "ECS Fargate CPU/memory for the Node API (for reference)"
  type        = string
  default     = "t3.small"
}

variable "rust_instance_type" {
  description = "ECS Fargate CPU/memory for the Rust engine (for reference)"
  type        = string
  default     = "t3.small"
}

variable "api_desired_capacity" {
  description = "Desired number of Node API task replicas"
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

variable "ssl_certificate_arn" {
  description = "ACM certificate ARN for HTTPS on the ALB"
  type        = string
}

variable "domain_name" {
  description = "Base domain name"
  type        = string
}

variable "image_tag" {
  description = "Docker image tag"
  type        = string
  default     = "latest"
}

variable "db_password" {
  description = "Database superuser password"
  type        = string
  sensitive   = true
}

variable "encryption_key" {
  description = "32-byte base64 encryption key"
  type        = string
  sensitive   = true
}
