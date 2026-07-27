variable "prefix" { type=string } variable "tags" { type=map(string) }
resource "aws_dynamodb_table" "users" { name="${var.prefix}-users" billing_mode="PAY_PER_REQUEST" hash_key="PK" range_key="SK" attribute{name="PK" type="S"} attribute{name="SK" type="S"} tags=var.tags }
resource "aws_dynamodb_table" "challenges" { name="${var.prefix}-challenges" billing_mode="PAY_PER_REQUEST" hash_key="PK" range_key="SK" attribute{name="PK" type="S"} attribute{name="SK" type="S"} tags=var.tags }
resource "aws_dynamodb_table" "settings" { name="${var.prefix}-settings" billing_mode="PAY_PER_REQUEST" hash_key="PK" range_key="SK" attribute{name="PK" type="S"} attribute{name="SK" type="S"} tags=var.tags }
resource "aws_dynamodb_table" "audit" { name="${var.prefix}-audit" billing_mode="PAY_PER_REQUEST" hash_key="PK" range_key="SK" attribute{name="PK" type="S"} attribute{name="SK" type="S"} tags=var.tags }
output "users_table" {value=aws_dynamodb_table.users.name} output "challenges_table" {value=aws_dynamodb_table.challenges.name} output "settings_table" {value=aws_dynamodb_table.settings.name} output "audit_table" {value=aws_dynamodb_table.audit.name}
output "table_arns" {value=[aws_dynamodb_table.users.arn,aws_dynamodb_table.challenges.arn,aws_dynamodb_table.settings.arn,aws_dynamodb_table.audit.arn]}
