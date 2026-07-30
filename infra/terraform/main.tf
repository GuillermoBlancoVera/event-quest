locals {
  prefix = "${var.project}-${var.environment}"
  tags = {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
  services = toset(["register-user", "login", "get-profile", "get-question", "submit-answer", "get-ranking", "get-stats", "admin"])
}

module "dynamodb" {
  source = "./modules/dynamodb"
  prefix = local.prefix
  tags   = local.tags
}

module "iam" {
  source     = "./modules/iam"
  prefix     = local.prefix
  table_arns = module.dynamodb.table_arns
  tags       = local.tags
}

module "lambda" {
  for_each        = local.services
  source          = "./modules/lambda"
  name            = "${local.prefix}-${each.value}"
  role_arn        = module.iam.lambda_role_arn
  artifact_bucket = var.lambda_artifact_bucket
  artifact_key    = "${each.value}.zip"
  environment = {
    USERS_TABLE      = module.dynamodb.users_table
    CHALLENGES_TABLE = module.dynamodb.challenges_table
    SETTINGS_TABLE   = module.dynamodb.settings_table
    AUDIT_TABLE      = module.dynamodb.audit_table
  }
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
  custom_domain = var.custom_domain
  tags          = local.tags
}

module "cloudwatch" {
  source     = "./modules/cloudwatch"
  prefix     = local.prefix
  log_groups = [for lambda in module.lambda : lambda.log_group]
  tags       = local.tags
}
