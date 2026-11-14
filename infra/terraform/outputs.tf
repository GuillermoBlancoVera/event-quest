output "api_url" {
  description = "Base URL of the HTTP API. The Deploy workflow passes it to the web build as VITE_API_URL."
  value       = module.api.url
}

output "assets_base_url" {
  description = "Avatars and community icons are served from here. The Deploy workflow passes it to the web build as VITE_ASSETS_URL."
  value       = "https://${aws_cloudfront_distribution.assets.domain_name}"
}

output "assets_bucket" {
  value = aws_s3_bucket.assets.bucket
}

output "users_table" {
  value = module.dynamodb.table_names["users"]
}
