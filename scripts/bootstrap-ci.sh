#!/usr/bin/env bash
# One-time setup so that GitHub Actions can run Terraform and deploy on every push to `develop`.
# Run it once from a terminal with administrator AWS credentials:
#
#   scripts/bootstrap-ci.sh            create what is missing and move the local Terraform state to S3
#   scripts/bootstrap-ci.sh --fresh    same, for an AWS account where Terraform has never been applied
#
# It is safe to run again: everything that already exists is left as it is.
#
# What it does
#   1. Creates a private, versioned S3 bucket for the Terraform state and the Lambda zips.
#   2. Moves infra/terraform/terraform.tfstate into that bucket (skipped if it is already there).
#   3. Registers GitHub as an identity provider in the account (OIDC) and creates a role that only
#      the `develop` branch of this repository can assume. No AWS keys are stored in GitHub.
#   4. Saves the repository variables the Deploy workflow reads (with `gh` if it is installed;
#      otherwise it prints them).
set -euo pipefail

repository="${GITHUB_REPOSITORY:-GuillermoBlancoVera/event-quest}"
branch="${DEPLOY_BRANCH:-develop}"
region="${AWS_REGION:-eu-west-1}"
role_name="${DEPLOY_ROLE_NAME:-event-quest-github-deploy}"
state_key="event-quest/production.tfstate"
fresh=false
[ "${1:-}" = "--fresh" ] && fresh=true

root="$(cd "$(dirname "$0")/.." && pwd)"
tf_dir="$root/infra/terraform"
account="$(aws sts get-caller-identity --query Account --output text)"
bucket="${TF_STATE_BUCKET:-event-quest-deploy-$account}"
echo "AWS account $account, region $region, repository $repository ($branch)"

# Stop before touching anything if there is no state to carry over: applying from an empty state
# against an account that already has the tables and the bucket would try to create them again.
remote_state=false
if aws s3api head-object --bucket "$bucket" --key "$state_key" >/dev/null 2>&1; then remote_state=true; fi
if [ "$remote_state" = false ] && [ ! -s "$tf_dir/terraform.tfstate" ] && [ "$fresh" = false ]; then
  cat >&2 <<EOF
No Terraform state found in $tf_dir/terraform.tfstate nor in s3://$bucket/$state_key.

If Terraform was applied from another machine or folder, copy its terraform.tfstate into
infra/terraform/ and run this script again. If this AWS account has never had this project
deployed, run: scripts/bootstrap-ci.sh --fresh
EOF
  exit 1
fi

echo "1/4 State and artifact bucket: $bucket"
if ! aws s3api head-bucket --bucket "$bucket" >/dev/null 2>&1; then
  if [ "$region" = "us-east-1" ]; then
    aws s3api create-bucket --bucket "$bucket" --region "$region" >/dev/null
  else
    aws s3api create-bucket --bucket "$bucket" --region "$region" --create-bucket-configuration "LocationConstraint=$region" >/dev/null
  fi
fi
aws s3api put-bucket-versioning --bucket "$bucket" --versioning-configuration Status=Enabled
aws s3api put-public-access-block --bucket "$bucket" --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

echo "2/4 Terraform state"
if [ "$remote_state" = true ]; then
  echo "    already in s3://$bucket/$state_key"
elif [ -s "$tf_dir/terraform.tfstate" ]; then
  cp "$tf_dir/terraform.tfstate" "$tf_dir/terraform.tfstate.before-migration"
  terraform -chdir="$tf_dir" init -input=false -migrate-state -force-copy \
    -backend-config="bucket=$bucket" -backend-config="region=$region"
  echo "    moved to s3://$bucket/$state_key (a copy stays in terraform.tfstate.before-migration; delete it once the first deploy works, it contains the session secret)"
else
  echo "    none yet; the first deploy creates it"
fi

echo "3/4 GitHub identity provider and deploy role"
provider_arn="arn:aws:iam::$account:oidc-provider/token.actions.githubusercontent.com"
if ! aws iam get-open-id-connect-provider --open-id-connect-provider-arn "$provider_arn" >/dev/null 2>&1; then
  aws iam create-open-id-connect-provider --url https://token.actions.githubusercontent.com \
    --client-id-list sts.amazonaws.com >/dev/null
fi
trust="$(mktemp)"
trap 'rm -f "$trust"' EXIT
cat >"$trust" <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "$provider_arn" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
      "StringLike": { "token.actions.githubusercontent.com:sub": "repo:$repository:ref:refs/heads/$branch" }
    }
  }]
}
EOF
if aws iam get-role --role-name "$role_name" >/dev/null 2>&1; then
  aws iam update-assume-role-policy --role-name "$role_name" --policy-document "file://$trust"
else
  aws iam create-role --role-name "$role_name" --assume-role-policy-document "file://$trust" \
    --description "Terraform and deploys from GitHub Actions ($repository, $branch)" >/dev/null
fi
# Terraform manages IAM roles, Lambda, DynamoDB, S3, CloudFront, API Gateway, SSM, SNS, CloudWatch and
# Budgets, so the role needs administrator rights. What protects it is the trust policy above: only
# workflows running on the deploy branch of this repository can use it.
aws iam attach-role-policy --role-name "$role_name" --policy-arn arn:aws:iam::aws:policy/AdministratorAccess
role_arn="$(aws iam get-role --role-name "$role_name" --query Role.Arn --output text)"

echo "4/4 Repository variables"
if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  gh variable set AWS_DEPLOY_ROLE_ARN --repo "$repository" --body "$role_arn"
  gh variable set TF_STATE_BUCKET --repo "$repository" --body "$bucket"
  gh variable set AWS_REGION --repo "$repository" --body "$region"
  echo "    saved in $repository"
else
  cat <<EOF
    Add these in GitHub: Settings > Secrets and variables > Actions > Variables
      AWS_DEPLOY_ROLE_ARN = $role_arn
      TF_STATE_BUCKET     = $bucket
      AWS_REGION          = $region
EOF
fi
cat <<EOF

Done. Optional: add the variable ALERT_EMAIL to receive cost and error alerts.
Now run the "Deploy" workflow (Actions > Deploy > Run workflow) or push to $branch.
EOF
