variable "project_id" {
  type        = string
  description = "Google Cloud Project ID"
}

variable "region" {
  type        = string
  description = "Primary GCP region (us-east4 for Tier 1 Cloud Run pricing and native domain mappings)"
  default     = "us-east4"
}

variable "org_domain" {
  type        = string
  description = "Organization root domain served by Cloud Run"
  default     = "community.kcdmontreal.org"
}

variable "launch_cities" {
  type        = list(string)
  description = "Launch City subdomains under org_domain"
  default     = ["montreal"]
}

variable "app_image" {
  type        = string
  description = "Container image URI in Artifact Registry"
}

variable "smtp_password" {
  type        = string
  description = "Resend SMTP API key stored in Secret Manager"
  sensitive   = true
  default     = ""
}

variable "better_auth_secret" {
  type        = string
  description = "Optional session signing secret override (auto-generated when empty)"
  sensitive   = true
  default     = ""
}

variable "cron_secret" {
  type        = string
  description = "Optional cron bearer secret override (auto-generated when empty)"
  sensitive   = true
  default     = ""
}

variable "bootstrap_hq_admin_email" {
  type        = string
  description = "Optional initial HQ Admin email for server/bootstrap.js"
  sensitive   = true
  default     = ""
}

variable "enable_domain_mapping" {
  type        = bool
  description = "Enable $0 native Cloud Run domain mappings"
  default     = true
}

variable "enable_wildcard_lb" {
  type        = bool
  description = "Enable Global External HTTPS Load Balancer and Wildcard Certificate Manager"
  default     = false
}

variable "enable_cdn" {
  type        = bool
  description = "Enable Cloud CDN when enable_wildcard_lb is true"
  default     = false
}

variable "github_repository" {
  type        = string
  description = "Optional GitHub owner/repo allowed to deploy via Workload Identity Federation"
  default     = ""
}

variable "billing_account_id" {
  type        = string
  description = "Optional GCP Billing Account ID for sandbox budget alerts"
  default     = ""
}

variable "monthly_budget_usd" {
  type        = number
  description = "Monthly sandbox billing alert threshold in the billing account currency"
  default     = 25
}

variable "budget_currency" {
  type        = string
  description = "3-letter currency code matching the GCP billing account (e.g. USD, CAD)"
  default     = "USD"
}
