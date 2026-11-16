output "cloud_run_service_url" {
  value = google_cloud_run_v2_service.web.uri
}

output "artifact_registry_repository" {
  value = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.app.repository_id}"
}

output "lb_ip_address" {
  value = var.enable_wildcard_lb ? google_compute_global_address.lb[0].address : null
}

output "wildcard_dns_authorization_record" {
  value = var.enable_wildcard_lb ? google_certificate_manager_dns_authorization.wildcard[0].dns_resource_record : null
}

output "github_wif_provider" {
  value = var.github_repository != "" ? google_iam_workload_identity_pool_provider.github[0].name : null
}

output "github_deploy_service_account" {
  value = var.github_repository != "" ? google_service_account.github_deploy[0].email : null
}
