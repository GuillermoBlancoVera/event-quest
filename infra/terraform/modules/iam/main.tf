variable "prefix" { type = string }
variable "table_arns" { type = list(string) }
variable "assets_bucket_arn" { type = string }
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

data "aws_iam_policy_document" "dynamo" {
  statement {
    actions = [
      "dynamodb:GetItem",
      "dynamodb:BatchGetItem",
      "dynamodb:PutItem",
      "dynamodb:Query",
      "dynamodb:Scan",
      "dynamodb:TransactWriteItems",
      "dynamodb:UpdateItem",
    ]
    resources = var.table_arns
  }
}

resource "aws_iam_role" "lambda" {
  name               = "${var.prefix}-lambda"
  assume_role_policy = data.aws_iam_policy_document.assume.json
  tags               = var.tags
}

resource "aws_iam_role_policy_attachment" "logs" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "dynamo" {
  name   = "${var.prefix}-dynamodb"
  role   = aws_iam_role.lambda.name
  policy = data.aws_iam_policy_document.dynamo.json
}

data "aws_iam_policy_document" "media" {
  statement {
    actions   = ["s3:GetObject", "s3:PutObject"]
    resources = ["${var.assets_bucket_arn}/media/*"]
  }
}

resource "aws_iam_role_policy" "media" {
  name   = "${var.prefix}-media"
  role   = aws_iam_role.lambda.name
  policy = data.aws_iam_policy_document.media.json
}

output "lambda_role_arn" { value = aws_iam_role.lambda.arn }
