resource "google_iam_workload_identity_pool" "github" {
  count                     = var.github_repository != "" ? 1 : 0
  project                   = var.project_id
  workload_identity_pool_id = "github-actions"
  display_name              = "GitHub Actions Pool"
  depends_on                = [google_project_service.apis]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  count                              = var.github_repository != "" ? 1 : 0
  project                            = var.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github[0].workload_identity_pool_id
  workload_identity_pool_provider_id = "github-oidc"
  display_name                       = "GitHub OIDC"
  attribute_condition                = "assertion.repository == \"${var.github_repository}\""

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
  }

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account" "github_deploy" {
  count      = var.github_repository != "" ? 1 : 0
  project    = var.project_id
  account_id = "community-gh-deploy"
}

resource "google_project_iam_member" "github_deploy_roles" {
  for_each = var.github_repository != "" ? toset(["roles/run.admin", "roles/artifactregistry.writer", "roles/iam.serviceAccountUser"]) : toset([])
  project  = var.project_id
  role     = each.key
  member   = "serviceAccount:${google_service_account.github_deploy[0].email}"
}

resource "google_service_account_iam_member" "github_wif_binding" {
  count              = var.github_repository != "" ? 1 : 0
  service_account_id = google_service_account.github_deploy[0].name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github[0].name}/attribute.repository/${var.github_repository}"
}
