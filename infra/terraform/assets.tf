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

# Nothing in the bucket is public. Photos are read through short-lived signed URLs and
# avatars through CloudFront (cdn.tf), so no policy change can ever expose the gallery.
resource "aws_s3_bucket_public_access_block" "assets" {
  bucket = aws_s3_bucket.assets.id

  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = true
  restrict_public_buckets = true
}

# A deleted or overwritten file stays recoverable for a week before S3 removes it for good.
resource "aws_s3_bucket_versioning" "assets" {
  bucket = aws_s3_bucket.assets.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "assets" {
  bucket     = aws_s3_bucket.assets.id
  depends_on = [aws_s3_bucket_versioning.assets]

  # Uploads are tagged state=pending by the upload form and re-tagged when published.
  # Anything still pending after two days was abandoned or rejected.
  rule {
    id     = "expire-unpublished-uploads"
    status = "Enabled"

    filter {
      and {
        prefix = "media/"
        tags   = { state = "pending" }
      }
    }

    expiration {
      days = 2
    }
  }

  rule {
    id     = "purge-deleted-files"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 7
    }

    expiration {
      expired_object_delete_marker = true
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 2
    }
  }

  # Originals are rarely opened after the first weeks; let S3 move them to cheaper storage on its own.
  rule {
    id     = "tier-media"
    status = "Enabled"

    filter {
      prefix = "media/"
    }

    transition {
      days          = 30
      storage_class = "INTELLIGENT_TIERING"
    }
  }
}

resource "aws_s3_bucket_cors_configuration" "assets" {
  bucket = aws_s3_bucket.assets.id

  cors_rule {
    allowed_methods = ["GET", "HEAD", "POST"]
    allowed_origins = var.web_origins
    allowed_headers = ["*"]
    expose_headers  = ["etag"]
    max_age_seconds = 3600
  }
}

moved {
  from = aws_s3_bucket_policy.assets_public_images
  to   = aws_s3_bucket_policy.assets
}

resource "aws_s3_bucket_policy" "assets" {
  bucket     = aws_s3_bucket.assets.id
  depends_on = [aws_s3_bucket_public_access_block.assets]

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "CloudFrontReadsGameImages"
        Effect    = "Allow"
        Principal = { Service = "cloudfront.amazonaws.com" }
        Action    = "s3:GetObject"
        Resource = [
          "${aws_s3_bucket.assets.arn}/avatars/*",
          "${aws_s3_bucket.assets.arn}/affiliations/*",
        ]
        Condition = { StringEquals = { "AWS:SourceArn" = aws_cloudfront_distribution.assets.arn } }
      },
      {
        Sid       = "HttpsOnly"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = [aws_s3_bucket.assets.arn, "${aws_s3_bucket.assets.arn}/*"]
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      },
    ]
  })
}
