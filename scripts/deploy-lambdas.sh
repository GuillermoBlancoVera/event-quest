#!/usr/bin/env bash
# Builds every Lambda and ships its code.
#
#   scripts/deploy-lambdas.sh                 update the code of the deployed functions
#   scripts/deploy-lambdas.sh --upload <bkt>  only upload <service>.zip files to an S3 bucket
#                                             (needed once, before the first `terraform apply`)
#
# Uses whatever AWS credentials are active in the shell or the CI job.
set -euo pipefail

prefix="${LAMBDA_PREFIX:-event-quest-production}"
root="$(cd "$(dirname "$0")/.." && pwd)"
out="$root/.artifacts"
upload_bucket=""
if [ "${1:-}" = "--upload" ]; then
  upload_bucket="${2:?Usage: deploy-lambdas.sh --upload <bucket>}"
fi

cd "$root"
pnpm install --frozen-lockfile
# The trailing dots also build the workspace packages the services depend on.
pnpm --filter "./services/*..." build

mkdir -p "$out"
for bundle in services/*/dist/index.js; do
  name="$(basename "$(dirname "$(dirname "$bundle")")")"
  archive="$out/$name.zip"
  rm -f "$archive"
  zip --junk-paths --quiet "$archive" "$bundle"
  if [ -n "$upload_bucket" ]; then
    aws s3 cp --only-show-errors "$archive" "s3://$upload_bucket/$name.zip"
    echo "uploaded $name.zip"
  else
    aws lambda update-function-code --function-name "$prefix-$name" --zip-file "fileb://$archive" --query LastModified --output text
    aws lambda wait function-updated --function-name "$prefix-$name"
    echo "deployed $prefix-$name"
  fi
done
