locals {
  prefix = "${var.project}-${var.environment}"
  tags = {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "Terraform"
  }

  # What each Lambda may do, table by table. Nothing is shared: a bug in one function cannot reach data it never uses.
  # Transactions are authorised through the PutItem/UpdateItem permissions of the items they touch.
  dynamodb_access = {
    "login"          = { users = ["Query", "UpdateItem"], settings = ["GetItem"] }
    "get-profile"    = { users = ["GetItem"], challenges = ["BatchGetItem"] }
    "get-question"   = { users = ["GetItem"], challenges = ["GetItem", "Scan"] }
    "submit-answer"  = { users = ["GetItem", "UpdateItem"], challenges = ["GetItem"], settings = ["GetItem"], audit = ["PutItem"] }
    "scan-community" = { users = ["GetItem", "UpdateItem"], affiliations = ["GetItem"], settings = ["GetItem"], audit = ["PutItem"] }
    "por-la-cara"    = { users = ["GetItem", "UpdateItem"], challenges = ["GetItem", "BatchGetItem"], settings = ["GetItem"], audit = ["PutItem"] }
    "get-ranking"    = { users = ["GetItem", "Scan"], affiliations = ["BatchGetItem"], settings = ["GetItem"] }
    "get-stats"      = { users = ["GetItem", "Scan"], challenges = ["Scan"] }
    "media"          = { media = ["PutItem", "Query", "UpdateItem", "DeleteItem"], users = ["GetItem"], settings = ["GetItem"], audit = ["PutItem"] }
    "admin" = {
      users        = ["GetItem", "PutItem", "DeleteItem", "Scan", "Query"]
      challenges   = ["GetItem", "PutItem", "DeleteItem", "Scan"]
      affiliations = ["GetItem", "PutItem", "DeleteItem", "Scan"]
      settings     = ["GetItem", "UpdateItem"]
      audit        = ["PutItem"]
    }
  }

  s3_access = {
    "media" = { actions = ["GetObject", "PutObject", "DeleteObject", "PutObjectTagging"], prefixes = ["media/*"] }
    "admin" = { actions = ["PutObject"], prefixes = ["avatars/*", "affiliations/*"] }
  }

  services = toset(keys(local.dynamodb_access))
}

resource "random_password" "media_session_secret" {
  length  = 64
  special = true
}

# The session signing secret is read by the Lambdas at start-up instead of sitting in their configuration.
resource "aws_ssm_parameter" "session_secret" {
  name        = "/${local.prefix}/session-secret"
  description = "HMAC key that signs player, guest and admin sessions and QR codes."
  type        = "SecureString"
  value       = random_password.media_session_secret.result
  tags        = local.tags
}

module "dynamodb" {
  source = "./modules/dynamodb"
  prefix = local.prefix
  tags   = local.tags
}

data "aws_iam_policy_document" "lambda" {
  for_each = local.services

  statement {
    sid       = "SessionSecret"
    actions   = ["ssm:GetParameter"]
    resources = [aws_ssm_parameter.session_secret.arn]
  }

  dynamic "statement" {
    for_each = local.dynamodb_access[each.value]
    content {
      sid       = "Table${title(statement.key)}"
      actions   = [for action in statement.value : "dynamodb:${action}"]
      resources = [module.dynamodb.table_arns[statement.key], "${module.dynamodb.table_arns[statement.key]}/index/*"]
    }
  }

  dynamic "statement" {
    for_each = contains(keys(local.s3_access), each.value) ? [local.s3_access[each.value]] : []
    content {
      sid       = "AssetsBucket"
      actions   = [for action in statement.value.actions : "s3:${action}"]
      resources = [for prefix in statement.value.prefixes : "${aws_s3_bucket.assets.arn}/${prefix}"]
    }
  }
}

module "lambda" {
  for_each        = local.services
  source          = "./modules/lambda"
  name            = "${local.prefix}-${each.value}"
  policy_json     = data.aws_iam_policy_document.lambda[each.value].json
  artifact_bucket = var.lambda_artifact_bucket
  artifact_key    = "${each.value}.zip"
  environment = merge({
    USERS_TABLE              = module.dynamodb.table_names["users"]
    CHALLENGES_TABLE         = module.dynamodb.table_names["challenges"]
    SETTINGS_TABLE           = module.dynamodb.table_names["settings"]
    AUDIT_TABLE              = module.dynamodb.table_names["audit"]
    AFFILIATIONS_TABLE       = module.dynamodb.table_names["affiliations"]
    SESSION_SECRET_PARAMETER = aws_ssm_parameter.session_secret.name
    }, each.value == "media" ? {
    MEDIA_TABLE        = module.dynamodb.table_names["media"]
    MEDIA_BUCKET       = aws_s3_bucket.assets.bucket
    MEDIA_MAX_IMAGE_MB = tostring(var.media_max_image_mb)
    MEDIA_MAX_VIDEO_MB = tostring(var.media_max_video_mb)
    } : {}, each.value == "admin" ? {
    MEDIA_BUCKET = aws_s3_bucket.assets.bucket
  } : {})
  tags = local.tags
}

module "api" {
  source = "./modules/api-gateway"
  name   = local.prefix
  lambdas = {
    for name, lambda in module.lambda : name => {
      invoke_arn    = lambda.invoke_arn
      function_name = lambda.function_name
    }
  }
  custom_domain   = var.custom_domain
  allowed_origins = var.web_origins
  rate_limit      = var.api_rate_limit
  tags            = local.tags
}

module "cloudwatch" {
  source         = "./modules/cloudwatch"
  prefix         = local.prefix
  function_names = [for lambda in module.lambda : lambda.function_name]
  api_id         = module.api.id
  alert_email    = local.alert_email
  tags           = local.tags
}
