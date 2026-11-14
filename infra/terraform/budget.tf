# An empty value (an unset repository variable in CI) means "no alerts", the same as null.
locals {
  alert_email = try(trimspace(var.alert_email), "") == "" ? null : var.alert_email
}

# A spending alert is the only thing that warns before the invoice does. It needs an address to write to.
resource "aws_budgets_budget" "monthly" {
  count        = local.alert_email == null ? 0 : 1
  name         = "${local.prefix}-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 50
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [local.alert_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [local.alert_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [local.alert_email]
  }
}
