locals {
  prefix = "${var.project}-${var.environment}"
  tags = {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
  services = toset(["register-user", "login", "get-profile", "get-question", "submit-answer", "scan-community", "por-la-cara", "get-ranking", "get-stats", "media", "admin"])
  media_session_services = toset(["register-user", "login", "media"])
}

resource "random_password" "media_session_secret" {
  length  = 64
  special = true
}

module "dynamodb" {
  source = "./modules/dynamodb"
  prefix = local.prefix
  tags   = local.tags
}

module "iam" {
  source            = "./modules/iam"
  prefix            = local.prefix
  table_arns        = module.dynamodb.table_arns
  assets_bucket_arn = aws_s3_bucket.assets.arn
  tags              = local.tags
}

module "lambda" {
  for_each        = local.services
  source          = "./modules/lambda"
  name            = "${local.prefix}-${each.value}"
  role_arn        = module.iam.lambda_role_arn
  artifact_bucket = var.lambda_artifact_bucket
  artifact_key    = "${each.value}.zip"
  environment = merge({
    USERS_TABLE        = module.dynamodb.users_table
    CHALLENGES_TABLE   = module.dynamodb.challenges_table
    SETTINGS_TABLE     = module.dynamodb.settings_table
    AUDIT_TABLE        = module.dynamodb.audit_table
    AFFILIATIONS_TABLE = module.dynamodb.affiliations_table
    }, contains(local.media_session_services, each.value) ? {
    MEDIA_SESSION_SECRET = random_password.media_session_secret.result
    } : {}, each.value == "media" ? {
    MEDIA_TABLE  = module.dynamodb.media_table
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
  tags            = local.tags
}

module "cloudwatch" {
  source     = "./modules/cloudwatch"
  prefix     = local.prefix
  log_groups = [for lambda in module.lambda : lambda.log_group]
  tags       = local.tags
}
