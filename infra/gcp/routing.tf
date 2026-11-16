resource "google_cloud_run_domain_mapping" "org" {
  count    = var.enable_domain_mapping ? 1 : 0
  project  = var.project_id
  location = var.region
  name     = var.org_domain

  metadata {
    namespace = var.project_id
  }

  spec {
    route_name = google_cloud_run_v2_service.web.name
  }
}

resource "google_cloud_run_domain_mapping" "cities" {
  for_each = var.enable_domain_mapping ? toset(var.launch_cities) : toset([])
  project  = var.project_id
  location = var.region
  name     = "${each.key}.${var.org_domain}"

  metadata {
    namespace = var.project_id
  }

  spec {
    route_name = google_cloud_run_v2_service.web.name
  }
}

resource "google_compute_global_address" "lb" {
  count      = var.enable_wildcard_lb ? 1 : 0
  project    = var.project_id
  name       = "community-lb-ip"
  depends_on = [google_project_service.apis]
}

resource "google_certificate_manager_dns_authorization" "wildcard" {
  count      = var.enable_wildcard_lb ? 1 : 0
  project    = var.project_id
  name       = "community-wildcard-dns-auth"
  domain     = var.org_domain
  depends_on = [google_project_service.apis]
}

resource "google_certificate_manager_certificate" "wildcard" {
  count   = var.enable_wildcard_lb ? 1 : 0
  project = var.project_id
  name    = "community-wildcard-cert"

  managed {
    domains            = [var.org_domain, "*.${var.org_domain}"]
    dns_authorizations = [google_certificate_manager_dns_authorization.wildcard[0].id]
  }
}

resource "google_certificate_manager_certificate_map" "wildcard" {
  count   = var.enable_wildcard_lb ? 1 : 0
  project = var.project_id
  name    = "community-wildcard-map"
}

resource "google_certificate_manager_certificate_map_entry" "root" {
  count        = var.enable_wildcard_lb ? 1 : 0
  project      = var.project_id
  name         = "root-domain"
  map          = google_certificate_manager_certificate_map.wildcard[0].name
  certificates = [google_certificate_manager_certificate.wildcard[0].id]
  hostname     = var.org_domain
}

resource "google_certificate_manager_certificate_map_entry" "wildcard" {
  count        = var.enable_wildcard_lb ? 1 : 0
  project      = var.project_id
  name         = "wildcard-domain"
  map          = google_certificate_manager_certificate_map.wildcard[0].name
  certificates = [google_certificate_manager_certificate.wildcard[0].id]
  hostname     = "*.${var.org_domain}"
}

resource "google_compute_region_network_endpoint_group" "web_neg" {
  count                 = var.enable_wildcard_lb ? 1 : 0
  project               = var.project_id
  name                  = "community-web-neg"
  network_endpoint_type = "SERVERLESS"
  region                = var.region

  cloud_run {
    service = google_cloud_run_v2_service.web.name
  }
}

resource "google_compute_backend_service" "web" {
  count                 = var.enable_wildcard_lb ? 1 : 0
  project               = var.project_id
  name                  = "community-web-backend"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  enable_cdn            = var.enable_cdn

  backend {
    group = google_compute_region_network_endpoint_group.web_neg[0].id
  }
}

resource "google_compute_url_map" "web" {
  count           = var.enable_wildcard_lb ? 1 : 0
  project         = var.project_id
  name            = "community-web-urlmap"
  default_service = google_compute_backend_service.web[0].id
}

resource "google_compute_target_https_proxy" "web" {
  count           = var.enable_wildcard_lb ? 1 : 0
  project         = var.project_id
  name            = "community-web-https-proxy"
  url_map         = google_compute_url_map.web[0].id
  certificate_map = "//certificatemanager.googleapis.com/${google_certificate_manager_certificate_map.wildcard[0].id}"
}

resource "google_compute_global_forwarding_rule" "web_https" {
  count                 = var.enable_wildcard_lb ? 1 : 0
  project               = var.project_id
  name                  = "community-web-https"
  target                = google_compute_target_https_proxy.web[0].id
  ip_address            = google_compute_global_address.lb[0].address
  load_balancing_scheme = "EXTERNAL_MANAGED"
  port_range            = "443"
}
