variable "aws_region" {
  type    = string
  default = "eu-west-1"
}

variable "project" {
  type    = string
  default = "event-quest"
}

variable "environment" {
  type    = string
  default = "production"
}

variable "custom_domain" {
  type    = string
  default = null
}

variable "web_origins" {
  type        = list(string)
  description = "Allowed browser origins for the API and direct S3 media uploads."
  default     = ["https://guillermoblancovera.github.io", "http://localhost:5173", "http://192.168.1.52:5173"]
}

variable "lambda_artifact_bucket" {
  type        = string
  description = "S3 bucket holding Lambda zip artifacts."
}
