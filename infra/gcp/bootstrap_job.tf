resource "google_secret_manager_secret" "bootstrap_hq_admin_email" {
  count     = var.bootstrap_hq_admin_email != "" ? 1 : 0
  project   = var.project_id
  secret_id = "community-bootstrap-hq-admin-email"
  replication {
    auto {}
  }
  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "bootstrap_hq_admin_email" {
  count       = var.bootstrap_hq_admin_email != "" ? 1 : 0
  secret      = google_secret_manager_secret.bootstrap_hq_admin_email[0].id
  secret_data = var.bootstrap_hq_admin_email
}

resource "google_secret_manager_secret_iam_member" "bootstrap_hq_admin_email" {
  count      = var.bootstrap_hq_admin_email != "" ? 1 : 0
  project    = var.project_id
  secret_id  = google_secret_manager_secret.bootstrap_hq_admin_email[0].secret_id
  role       = "roles/secretmanager.secretAccessor"
  member     = "serviceAccount:${google_service_account.web.email}"
  depends_on = [google_secret_manager_secret_version.bootstrap_hq_admin_email]
}

resource "google_cloud_run_v2_job" "db_bootstrap" {
  project             = var.project_id
  location            = var.region
  name                = "community-db-bootstrap"
  deletion_protection = false

  template {
    template {
      service_account = google_service_account.web.email
      timeout         = "300s"

      vpc_access {
        network_interfaces {
          network    = google_compute_network.vpc.name
          subnetwork = google_compute_subnetwork.subnet.name
        }
        egress = "PRIVATE_RANGES_ONLY"
      }

      containers {
        image   = var.app_image
        command = ["node", "server/bootstrap.js"]

        env {
          name = "DATABASE_URL"
          value_source {
            secret_key_ref {
              secret  = basename(google_secret_manager_secret_iam_member.web_database_url.secret_id)
              version = google_secret_manager_secret_version.web_database_url.version
            }
          }
        }

        env {
          name  = "ORG_DOMAIN"
          value = var.org_domain
        }

        dynamic "env" {
          for_each = var.bootstrap_hq_admin_email != "" ? [1] : []
          content {
            name = "BOOTSTRAP_HQ_ADMIN_EMAIL"
            value_source {
              secret_key_ref {
                secret  = basename(google_secret_manager_secret_iam_member.bootstrap_hq_admin_email[0].secret_id)
                version = google_secret_manager_secret_version.bootstrap_hq_admin_email[0].version
              }
            }
          }
        }
      }
    }
  }

  depends_on = [google_project_service.apis]
}
