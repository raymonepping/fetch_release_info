// config.js — HashiCorp product registry
// All URLs target Enterprise editions only

export const PRODUCTS = {
  vault: {
    label: "Vault",
    releasesUrl: "https://releases.hashicorp.com/vault/",
    releaseNotesUrl: "https://developer.hashicorp.com/vault/docs/updates/release-notes",
    changeTrackerUrl: "https://developer.hashicorp.com/vault/docs/updates/change-tracker",
    entSuffix: "+ent",
    versionPattern: /^(\d+\.\d+\.\d+)\+ent$/,
  },
  boundary: {
    label: "Boundary",
    releasesUrl: "https://releases.hashicorp.com/boundary/",
    releaseNotesUrl: "https://developer.hashicorp.com/boundary/docs/release-notes",
    changeTrackerUrl: "https://developer.hashicorp.com/boundary/docs/updates/change-tracker",
    entSuffix: "+ent",
    versionPattern: /^(\d+\.\d+\.\d+)\+ent$/,
  },
  nomad: {
    label: "Nomad",
    releasesUrl: "https://releases.hashicorp.com/nomad/",
    releaseNotesUrl: "https://developer.hashicorp.com/nomad/docs/release-notes",
    changeTrackerUrl: "https://developer.hashicorp.com/nomad/docs/updates/change-tracker",
    entSuffix: "+ent",
    versionPattern: /^(\d+\.\d+\.\d+)\+ent$/,
  },
  terraform: {
    label: "Terraform",
    releasesUrl: "https://releases.hashicorp.com/terraform/",
    releaseNotesUrl: "https://developer.hashicorp.com/terraform/language/upgrade-guides",
    changeTrackerUrl: "https://developer.hashicorp.com/terraform/docs/updates/change-tracker",
    // Terraform ENT uses a different suffix
    entSuffix: "+ent",
    versionPattern: /^(\d+\.\d+\.\d+)\+ent$/,
  },
  consul: {
    label: "Consul",
    releasesUrl: "https://releases.hashicorp.com/consul/",
    releaseNotesUrl: "https://developer.hashicorp.com/consul/docs/release-notes",
    changeTrackerUrl: "https://developer.hashicorp.com/consul/docs/updates/change-tracker",
    entSuffix: "+ent",
    versionPattern: /^(\d+\.\d+\.\d+)\+ent$/,
  },
  packer: {
    label: "Packer",
    releasesUrl: "https://releases.hashicorp.com/packer/",
    releaseNotesUrl: "https://developer.hashicorp.com/packer/docs/release-notes",
    changeTrackerUrl: "https://developer.hashicorp.com/packer/docs/updates/change-tracker",
    entSuffix: "+ent",
    versionPattern: /^(\d+\.\d+\.\d+)\+ent$/,
  },
};

// All valid product keys for --all flag
export const ALL_PRODUCTS = Object.keys(PRODUCTS);

// Output directory (relative to project root)
export const OUTPUT_DIR = "./output";
export const SNAPSHOT_DIR = "./snapshots";
