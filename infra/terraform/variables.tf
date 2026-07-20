variable "aws_region" { type=string default="eu-west-1" }
variable "project" { type=string default="event-quest" }
variable "environment" { type=string default="production" }
variable "custom_domain" { type=string default=null }
variable "lambda_artifact_bucket" { type=string description="S3 bucket holding Lambda zip artifacts." }
