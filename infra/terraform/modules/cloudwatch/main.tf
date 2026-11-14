variable "prefix" { type = string }
variable "function_names" { type = list(string) }
variable "api_id" { type = string }
variable "alert_email" {
  type    = string
  default = null
}
variable "tags" { type = map(string) }

resource "aws_sns_topic" "alerts" {
  name = "${var.prefix}-alerts"
  tags = var.tags
}

# AWS sends a confirmation email; alerts only start arriving after the link in it is clicked.
resource "aws_sns_topic_subscription" "email" {
  count     = var.alert_email == null ? 0 : 1
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# One alarm for all functions: any unhandled error in any Lambda within five minutes.
resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  alarm_name          = "${var.prefix}-lambda-errors"
  alarm_description   = "At least one Lambda invocation failed with an unhandled error."
  comparison_operator = "GreaterThanThreshold"
  threshold           = 0
  evaluation_periods  = 1
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  metric_query {
    id          = "total"
    expression  = "SUM(METRICS())"
    label       = "Lambda errors"
    return_data = true
  }

  dynamic "metric_query" {
    for_each = { for index, name in var.function_names : "m${index}" => name }
    content {
      id = metric_query.key
      metric {
        namespace   = "AWS/Lambda"
        metric_name = "Errors"
        period      = 300
        stat        = "Sum"
        dimensions  = { FunctionName = metric_query.value }
      }
    }
  }

  tags = var.tags
}

resource "aws_cloudwatch_metric_alarm" "api_server_errors" {
  alarm_name          = "${var.prefix}-api-5xx"
  alarm_description   = "The API answered with server errors."
  namespace           = "AWS/ApiGateway"
  metric_name         = "5xx"
  dimensions          = { ApiId = var.api_id }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  comparison_operator = "GreaterThanThreshold"
  threshold           = 5
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  tags                = var.tags
}

# A burst of rejected requests usually means someone is guessing passwords, codes or QR links.
resource "aws_cloudwatch_metric_alarm" "api_client_errors" {
  alarm_name          = "${var.prefix}-api-4xx-spike"
  alarm_description   = "Unusually many rejected requests (possible guessing or abuse)."
  namespace           = "AWS/ApiGateway"
  metric_name         = "4xx"
  dimensions          = { ApiId = var.api_id }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  comparison_operator = "GreaterThanThreshold"
  threshold           = 500
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  tags                = var.tags
}

output "alerts_topic_arn" { value = aws_sns_topic.alerts.arn }
