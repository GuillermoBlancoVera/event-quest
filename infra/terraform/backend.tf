# The state lives in a private, versioned S3 bucket so that GitHub Actions and a laptop work on the
# same record of what exists. The bucket name is not fixed here; pass it when initialising:
#
#   terraform init -backend-config="bucket=<state bucket>"
#
# scripts/bootstrap-ci.sh creates the bucket and moves an existing local state into it.
terraform {
  backend "s3" {
    key          = "event-quest/production.tfstate"
    region       = "eu-west-1"
    encrypt      = true
    use_lockfile = true # two applies cannot run at once
  }
}
