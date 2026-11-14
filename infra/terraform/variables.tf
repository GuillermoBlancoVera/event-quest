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
  description = "Browser origins allowed to call the API and upload to S3. Add http://localhost:5173 in a tfvars file only while developing."
  default     = ["https://guillermoblancovera.github.io"]
}

variable "lambda_artifact_bucket" {
  type        = string
  description = "S3 bucket holding the Lambda zip artifacts used when a function is first created."
}

variable "media_max_image_mb" {
  type        = number
  description = "Largest photo a guest can upload, in MB. Enforced by S3 itself."
  default     = 40
}

variable "media_max_video_mb" {
  type        = number
  description = "Largest video a guest can upload, in MB. Enforced by S3 itself."
  default     = 500
}

variable "alert_email" {
  type        = string
  description = "Address that receives budget and error alerts. Leave null to create the alarms without notifications and skip the budget."
  default     = null
}

variable "monthly_budget_usd" {
  type        = number
  description = "Monthly AWS spend that triggers the budget alerts (50 % and 100 %)."
  default     = 10
}

variable "api_rate_limit" {
  type        = number
  description = "Requests per second allowed across the whole API. The live ranking polls every 10 s per open phone, so keep headroom."
  default     = 100
}
