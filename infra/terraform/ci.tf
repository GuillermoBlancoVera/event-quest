# Lets GitHub Actions ship Lambda code without any stored AWS keys: the workflow proves which
# repository and branch it runs from (OIDC) and receives short-lived credentials for this one role.

locals {
  github_deploy_enabled    = var.github_repository != null
  github_oidc_provider_arn = !local.github_deploy_enabled ? null : coalesce(var.github_oidc_provider_arn, try(aws_iam_openid_connect_provider.github[0].arn, null))
}

resource "aws_iam_openid_connect_provider" "github" {
  count          = local.github_deploy_enabled && var.github_oidc_provider_arn == null ? 1 : 0
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
  tags           = local.tags
}

data "aws_iam_policy_document" "github_assume" {
  count = local.github_deploy_enabled ? 1 : 0

  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [local.github_oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    # Only the deploy branch of this repository; pull requests and forks cannot assume the role.
    condition {
      test     = "StringEqualsIgnoreCase"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repository}:ref:refs/heads/${var.github_deploy_branch}"]
    }
  }
}

data "aws_iam_policy_document" "github_deploy" {
  count = local.github_deploy_enabled ? 1 : 0

  statement {
    sid       = "UpdateLambdaCode"
    actions   = ["lambda:UpdateFunctionCode", "lambda:GetFunction", "lambda:GetFunctionConfiguration"]
    resources = [for lambda in module.lambda : lambda.function_arn]
  }
}

resource "aws_iam_role" "github_deploy" {
  count              = local.github_deploy_enabled ? 1 : 0
  name               = "${local.prefix}-github-deploy"
  assume_role_policy = data.aws_iam_policy_document.github_assume[0].json
  tags               = local.tags
}

resource "aws_iam_role_policy" "github_deploy" {
  count  = local.github_deploy_enabled ? 1 : 0
  name   = "deploy-lambda-code"
  role   = aws_iam_role.github_deploy[0].name
  policy = data.aws_iam_policy_document.github_deploy[0].json
}
