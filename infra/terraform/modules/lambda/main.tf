variable "name" { type = string }
variable "role_arn" { type = string }
variable "artifact_bucket" { type = string }
variable "artifact_key" { type = string }
variable "environment" { type = map(string) }
variable "tags" { type = map(string) }

resource "aws_cloudwatch_log_group" "this" {
  name              = "/aws/lambda/${var.name}"
  retention_in_days = 30
  tags              = var.tags
}

resource "aws_lambda_function" "this" {
  function_name    = var.name
  role             = var.role_arn
  handler          = "index.handler"
  runtime          = "nodejs22.x"
  s3_bucket        = var.artifact_bucket
  s3_key           = var.artifact_key
  source_code_hash = filebase64sha256("${path.root}/../../${var.artifact_key}")
  timeout          = 10
  memory_size      = 256

  environment {
    variables = var.environment
  }

  depends_on = [aws_cloudwatch_log_group.this]
  tags       = var.tags
}

output "invoke_arn" { value = aws_lambda_function.this.invoke_arn }
output "function_name" { value = aws_lambda_function.this.function_name }
output "log_group" { value = aws_cloudwatch_log_group.this.name }
