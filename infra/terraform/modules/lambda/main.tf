variable "name" { type = string }
variable "policy_json" { type = string }
variable "artifact_bucket" { type = string }
variable "artifact_key" { type = string }
variable "environment" { type = map(string) }
variable "tags" { type = map(string) }

data "aws_iam_policy_document" "assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

# One role per function, holding only the permissions that function needs.
resource "aws_iam_role" "this" {
  name               = var.name
  assume_role_policy = data.aws_iam_policy_document.assume.json
  tags               = var.tags
}

resource "aws_iam_role_policy_attachment" "logs" {
  role       = aws_iam_role.this.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "this" {
  name   = "access"
  role   = aws_iam_role.this.name
  policy = var.policy_json
}

resource "aws_cloudwatch_log_group" "this" {
  name              = "/aws/lambda/${var.name}"
  retention_in_days = 30
  tags              = var.tags
}

resource "aws_lambda_function" "this" {
  function_name = var.name
  role          = aws_iam_role.this.arn
  handler       = "index.handler"
  runtime       = "nodejs22.x"
  s3_bucket     = var.artifact_bucket
  s3_key        = var.artifact_key
  timeout       = 10
  memory_size   = 256

  environment {
    variables = var.environment
  }

  # Terraform owns the function and its configuration; the code itself is shipped by scripts/deploy-lambdas.sh
  # (from CI or by hand), so applying infrastructure never rolls the code back to an old zip.
  lifecycle {
    ignore_changes = [s3_bucket, s3_key, s3_object_version, source_code_hash]
  }

  depends_on = [aws_cloudwatch_log_group.this, aws_iam_role_policy_attachment.logs, aws_iam_role_policy.this]
  tags       = var.tags
}

output "invoke_arn" { value = aws_lambda_function.this.invoke_arn }
output "function_name" { value = aws_lambda_function.this.function_name }
output "function_arn" { value = aws_lambda_function.this.arn }
output "log_group" { value = aws_cloudwatch_log_group.this.name }
