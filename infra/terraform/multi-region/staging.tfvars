environment = "staging"
domain_name = "fluid-staging.example.com"
image_tag   = "latest"

# Region A — us-east-1
region_a_vpc_cidr             = "10.0.0.0/16"
region_a_availability_zones   = ["us-east-1a", "us-east-1b"]
region_a_ssl_certificate_arn  = "arn:aws:acm:us-east-1:ACCOUNT_ID:certificate/CERT_ID"

# Region B — eu-west-1
region_b_vpc_cidr             = "10.1.0.0/16"
region_b_availability_zones   = ["eu-west-1a", "eu-west-1b"]
region_b_ssl_certificate_arn  = "arn:aws:acm:eu-west-1:ACCOUNT_ID:certificate/CERT_ID"

# Compute sizing for staging (smaller than production)
api_instance_type    = "t3.small"
rust_instance_type   = "t3.small"
api_desired_capacity = 1
db_instance_class    = "db.t3.small"
redis_node_type      = "cache.t3.micro"

# Secrets — set via TF_VAR_db_password and TF_VAR_encryption_key environment variables
# db_password    = "..."
# encryption_key = "..."
