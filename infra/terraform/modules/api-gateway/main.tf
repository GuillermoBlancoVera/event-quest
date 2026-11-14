variable "name" { type = string }
variable "lambdas" { type = map(object({ invoke_arn = string, function_name = string })) }
variable "custom_domain" {
  type    = string
  default = null
}
variable "allowed_origins" { type = list(string) }
variable "rate_limit" { type = number }
variable "tags" { type = map(string) }

locals {
  # Every route is authenticated inside its Lambda (signed session token), except the two that issue sessions.
  routes = {
    "POST /login"               = "login"
    "POST /event-session"       = "login"
    "GET /profile/{id}"         = "get-profile"
    "GET /challenges"           = "get-question"
    "GET /question/{id}"        = "get-question"
    "POST /submit-answer/{id}"  = "submit-answer"
    "POST /community-scan/{id}" = "scan-community"
    "GET /por-la-cara"          = "por-la-cara"
    "GET /por-la-cara/{id}"     = "por-la-cara"
    "POST /por-la-cara/{id}"    = "por-la-cara"
    "GET /ranking"              = "get-ranking"
    "GET /stats"                = "get-stats"
    "ANY /admin/{proxy+}"       = "admin"
    "POST /media/uploads"       = "media"
    "POST /media/cancel"        = "media"
    "POST /media/{id}/complete" = "media"
    "PATCH /media/{id}"         = "media"
    "DELETE /media/{id}"        = "media"
    "GET /media"                = "media"
  }

  # Tighter limits where guessing or flooding would hurt: credentials, the wedding code and new uploads.
  strict_routes = {
    "POST /login"         = { rate = 5, burst = 10 }
    "POST /event-session" = { rate = 5, burst = 10 }
    "POST /media/uploads" = { rate = 10, burst = 20 }
  }
}

resource "aws_apigatewayv2_api" "this" {
  name          = var.name
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = var.allowed_origins
    allow_methods = ["DELETE", "GET", "PATCH", "POST", "PUT", "OPTIONS"]
    allow_headers = ["content-type", "authorization"]
    max_age       = 3600
  }

  tags = var.tags
}

resource "aws_apigatewayv2_integration" "this" {
  for_each               = var.lambdas
  api_id                 = aws_apigatewayv2_api.this.id
  integration_type       = "AWS_PROXY"
  integration_uri        = each.value.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "this" {
  for_each  = local.routes
  api_id    = aws_apigatewayv2_api.this.id
  route_key = each.key
  target    = "integrations/${aws_apigatewayv2_integration.this[each.value].id}"
}

resource "aws_lambda_permission" "api_gateway" {
  for_each = toset(values(local.routes))

  statement_id  = "AllowApiGatewayInvoke-${each.value}"
  action        = "lambda:InvokeFunction"
  function_name = var.lambdas[each.value].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.this.execution_arn}/*/*"
}

resource "aws_apigatewayv2_stage" "this" {
  api_id      = aws_apigatewayv2_api.this.id
  name        = "$default"
  auto_deploy = true

  # A ceiling on traffic keeps a script from running up the bill or exhausting Lambda concurrency.
  default_route_settings {
    throttling_rate_limit  = var.rate_limit
    throttling_burst_limit = var.rate_limit * 2
  }

  dynamic "route_settings" {
    for_each = local.strict_routes
    content {
      route_key              = route_settings.key
      throttling_rate_limit  = route_settings.value.rate
      throttling_burst_limit = route_settings.value.burst
    }
  }

  depends_on = [aws_apigatewayv2_route.this]
  tags       = var.tags
}

output "url" { value = aws_apigatewayv2_stage.this.invoke_url }
output "id" { value = aws_apigatewayv2_api.this.id }
