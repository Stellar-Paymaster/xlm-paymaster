output "region_a_alb_dns" {
  description = "ALB DNS name for Region A (us-east-1)"
  value       = module.region_a.alb_dns_name
}

output "region_b_alb_dns" {
  description = "ALB DNS name for Region B (eu-west-1)"
  value       = module.region_b.alb_dns_name
}

output "api_endpoint" {
  description = "Global API endpoint (Route 53 latency-routed)"
  value       = "https://api.${var.domain_name}"
}

output "route53_zone_id" {
  description = "Route 53 hosted zone ID"
  value       = aws_route53_zone.fluid.zone_id
}

output "region_a_health_check_id" {
  description = "Route 53 health check ID for Region A"
  value       = aws_route53_health_check.region_a.id
}

output "region_b_health_check_id" {
  description = "Route 53 health check ID for Region B"
  value       = aws_route53_health_check.region_b.id
}
