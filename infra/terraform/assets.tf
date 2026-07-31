data "aws_caller_identity" "current" {}

resource "aws_s3_bucket" "assets" {
  bucket        = "${local.prefix}-assets-${data.aws_caller_identity.current.account_id}"
  force_destroy = false
  tags          = local.tags
}

resource "aws_s3_bucket_ownership_controls" "assets" {
  bucket = aws_s3_bucket.assets.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_public_access_block" "assets" {
  bucket = aws_s3_bucket.assets.id

  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket_policy" "assets_public_images" {
  bucket     = aws_s3_bucket.assets.id
  depends_on = [aws_s3_bucket_public_access_block.assets]

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "PublicReadGameImages"
      Effect    = "Allow"
      Principal = "*"
      Action    = "s3:GetObject"
      Resource  = [
        "${aws_s3_bucket.assets.arn}/avatars/*",
        "${aws_s3_bucket.assets.arn}/affiliations/*",
      ]
    }]
  })
}

output "assets_bucket" {
  value = aws_s3_bucket.assets.bucket
}

output "assets_avatar_base_url" {
  value = "https://${aws_s3_bucket.assets.bucket}.s3.${var.aws_region}.amazonaws.com/avatars"
}

output "assets_affiliation_base_url" {
  value = "https://${aws_s3_bucket.assets.bucket}.s3.${var.aws_region}.amazonaws.com/affiliations"
}
