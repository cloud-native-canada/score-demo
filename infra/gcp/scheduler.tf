locals {
  cron_secret_value = var.cron_secret != "" ? var.cron_secret : random_password.cron_secret.result
}

resource "google_cloud_scheduler_job" "run_due_jobs" {
  project     = var.project_id
  region      = var.region
  name        = "community-run-due-jobs"
  description = "Triggers webhook-mode pg-boss email retries and due jobs every minute"
  schedule    = "* * * * *"
  time_zone   = "UTC"

  http_target {
    uri         = "https://${var.org_domain}/api/cron/run-due-jobs"
    http_method = "POST"
    body        = base64encode("{}")
    headers = {
      "Content-Type"  = "application/json"
      "Authorization" = "Bearer ${local.cron_secret_value}"
    }
  }

  depends_on = [google_project_service.apis, google_cloud_run_v2_service.web]
}
