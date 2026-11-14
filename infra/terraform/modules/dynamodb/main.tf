variable "prefix" { type = string }
variable "tags" { type = map(string) }

locals {
  # Every table uses the same PK/SK layout. `index` adds a lookup by one attribute; `ttl` names an expiry attribute.
  tables = {
    users        = { index = "name", ttl = null }
    challenges   = { index = null, ttl = null }
    settings     = { index = null, ttl = null }
    audit        = { index = null, ttl = null }
    affiliations = { index = null, ttl = null }
    media        = { index = "mediaId", ttl = "expiresAt" }
  }
}

resource "aws_dynamodb_table" "this" {
  for_each     = local.tables
  name         = "${var.prefix}-${each.key}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK"
  range_key    = "SK"

  # The data cannot be recreated (answers, photo records), so guard against mistakes and keep 35 days of history.
  deletion_protection_enabled = true

  point_in_time_recovery {
    enabled = true
  }

  attribute {
    name = "PK"
    type = "S"
  }
  attribute {
    name = "SK"
    type = "S"
  }

  dynamic "attribute" {
    for_each = each.value.index == null ? [] : [each.value.index]
    content {
      name = attribute.value
      type = "S"
    }
  }

  # Direct lookups (login by name, a photo by its id) instead of reading the whole table and filtering.
  dynamic "global_secondary_index" {
    for_each = each.value.index == null ? [] : [each.value.index]
    content {
      name            = "${global_secondary_index.value}-index"
      projection_type = "ALL"

      key_schema {
        attribute_name = global_secondary_index.value
        key_type       = "HASH"
      }
    }
  }

  dynamic "ttl" {
    for_each = each.value.ttl == null ? [] : [each.value.ttl]
    content {
      attribute_name = ttl.value
      enabled        = true
    }
  }

  tags = var.tags
}

# The tables used to be six separate resources; these keep Terraform from recreating them.
moved {
  from = aws_dynamodb_table.users
  to   = aws_dynamodb_table.this["users"]
}
moved {
  from = aws_dynamodb_table.challenges
  to   = aws_dynamodb_table.this["challenges"]
}
moved {
  from = aws_dynamodb_table.settings
  to   = aws_dynamodb_table.this["settings"]
}
moved {
  from = aws_dynamodb_table.audit
  to   = aws_dynamodb_table.this["audit"]
}
moved {
  from = aws_dynamodb_table.affiliations
  to   = aws_dynamodb_table.this["affiliations"]
}
moved {
  from = aws_dynamodb_table.media
  to   = aws_dynamodb_table.this["media"]
}

output "table_names" { value = { for key, table in aws_dynamodb_table.this : key => table.name } }
output "table_arns" { value = { for key, table in aws_dynamodb_table.this : key => table.arn } }
