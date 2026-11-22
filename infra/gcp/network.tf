locals {
  base_apis = [
    "run.googleapis.com",
    "sqladmin.googleapis.com",
    "servicenetworking.googleapis.com",
    "secretmanager.googleapis.com",
    "cloudscheduler.googleapis.com",
    "artifactregistry.googleapis.com",
    "compute.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com"
  ]
  extra_apis = concat(
    var.enable_wildcard_lb ? ["certificatemanager.googleapis.com"] : [],
    var.billing_account_id != "" ? ["billingbudgets.googleapis.com"] : []
  )
}

resource "google_project_service" "apis" {
  for_each           = toset(concat(local.base_apis, local.extra_apis))
  project            = var.project_id
  service            = each.key
  disable_on_destroy = false
}

resource "google_artifact_registry_repository" "app" {
  project       = var.project_id
  location      = var.region
  repository_id = "community"
  format        = "DOCKER"
  depends_on    = [google_project_service.apis]
}

resource "google_compute_network" "vpc" {
  project                 = var.project_id
  name                    = "community-vpc"
  auto_create_subnetworks = false
  depends_on              = [google_project_service.apis]
}

resource "google_compute_subnetwork" "subnet" {
  project                  = var.project_id
  name                     = "community-subnet"
  ip_cidr_range            = "10.8.0.0/24"
  region                   = var.region
  network                  = google_compute_network.vpc.id
  private_ip_google_access = true
}

resource "google_compute_global_address" "psa_range" {
  project       = var.project_id
  name          = "community-sql-psa-range"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.vpc.id
}

resource "google_service_networking_connection" "private_vpc_connection" {
  network                 = google_compute_network.vpc.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.psa_range.name]
  depends_on              = [google_project_service.apis]
}
