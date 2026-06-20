output "alb_dns_name" {
  description = "ALB DNS name for this region"
  value       = aws_lb.api.dns_name
}

output "alb_zone_id" {
  description = "ALB hosted zone ID (for Route 53 alias records)"
  value       = aws_lb.api.zone_id
}

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.main.name
}

output "redis_endpoint" {
  description = "Redis endpoint for this region"
  value       = "${aws_elasticache_cluster.redis.cache_nodes[0].address}:6379"
}

output "vpc_id" {
  description = "VPC ID"
  value       = aws_vpc.main.id
}
