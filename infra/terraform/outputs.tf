output "api_url" {
  description = "Set this as the VITE_API_URL repository variable."
  value       = module.api.url
}

output "assets_base_url" {
  description = "Set this as the VITE_ASSETS_URL repository variable. Avatars and community icons are served from here."
  value       = "https://${aws_cloudfront_distribution.assets.domain_name}"
}

output "github_deploy_role_arn" {
  description = "Set this as the AWS_DEPLOY_ROLE_ARN repository variable so GitHub Actions can deploy Lambda code."
  value       = try(aws_iam_role.github_deploy[0].arn, null)
}

output "assets_bucket" {
  value = aws_s3_bucket.assets.bucket
}

output "users_table" {
  value = module.dynamodb.table_names["users"]
}
