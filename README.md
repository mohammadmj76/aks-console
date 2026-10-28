# Arvan AKS Console — Kubernetes UI concept

A front-end design prototype for **Arvan Kubernetes Service (AKS)** — a managed
Kubernetes console built with the Ar design system (the same token system as
Arvan's UIKit), implemented with **Vue 3 + Vite + Vue Router**.

The prototype covers AKS **Phase 1 + Phase 2** scope only:

- Cluster list with quotas, filters, and bulk selection
- 3-step **Create cluster** wizard (cluster & control plane → network & node
  pool → review & create) with a live order-summary rail and cost estimate
- Cluster details with **Overview / Node pools / Networking / Operations** tabs
- Node pool lifecycle: add pool, scale ±, autoscaling (min/max), delete
- User-initiated Kubernetes version upgrades
- Phase-2 operations: Prometheus metrics endpoint, etcd control-plane backups,
  audit logs
- Kubeconfig download, provisioning/upgrade simulations, toasts, empty states

Out of scope (later phases, intentionally not designed here): addons
marketplace, private API endpoint (VPN gateway), multi-region, GPU flavors,
shared control planes, managed Velero, unified IAM.

## Getting started

```bash
npm install
npm run dev      # http://localhost:5175
```

### Private UIKit prerequisite

The main create-cluster page uses the real `@panel/uikit` package (tested with 11.1.0), not the prototype stand-ins. The private package is not included in this repository.

For local development, create an ignored `.env.local` file with `UIKIT_PATH` pointing to an existing authorized installation of `@panel/uikit`. The directory must contain `index.js` and `styles.css`, with its dependencies available from the installation. Alternatively, install the package through your organization's approved private registry setup.

Do not commit registry credentials, private library files, or a machine-specific path. A clean checkout or hosted build needs authorized package access before it can build; the previous Vercel instructions alone are not sufficient for this version.

## Production build

```bash
npm run build    # outputs dist/
npm run preview  # serve the build locally
```

## Deploy on Vercel

1. Push this repository to GitHub.
2. In Vercel: **Add New → Project** and import the repo.
3. Vercel auto-detects Vite (build `npm run build`, output `dist`). The
   included `vercel.json` rewrites all routes to `index.html` so the Vue
   Router history-mode deep links work.

## Design system

All colors, spacing, radii and typography live in
[`src/styles/tokens.css`](src/styles/tokens.css) using the Ar token naming
(`bg/fg/st × semantic × tier × state`). The primary palette is Arvan teal.
Component classes (`.ar-btn`, `.ar-card`, `.ar-table`, …) live in
`src/styles/components.css`; page layout and the console shell are in
`src/styles/shell.css`.

### UIKit mapping

The main create-cluster page imports real UIKit components through `src/uikit.js`. Other prototype screens and the experimental stepper still use local stand-ins. The following table documents the legacy mapping for those screens:

| Prototype | Ar UIKit component |
| --- | --- |
| All buttons (`.ar-btn`) | `ArButton` (primary/secondary/tertiary/ghost, sm) |
| Selectable type/region/flavor cards | `ArCard` (variant `secondary`, `v-model` selection) |
| Radio circles in cards | `ArRadio` / `ArRadioGroup` |
| Cluster type Card⇄Table toggle, flavor category tabs | `ArTab` (flat) |
| Flavor catalog table (filters, selection column, pagination, per-page) | `ArDataTableServer` + `ArPagination` (`sizeChanger`) |
| Summary rail cards, section cards | `ArCard` + `ArSection` (`title`, `description`, `actions`) |
| Subnet table | `ArTable` |
| Firewall multi-select, labels input | `ArSelect` (multiple) / `ArInput` + `ArTag` |
| Auto-scale-style switches | `ArToggle` |
| Row/zone checkboxes | `ArCheckbox` |
| Add-node-pool drawer, delete/upgrade drawers | `ArSidePanel` |
| Copy feedback | `ArToast` |
| Empty states | `ArStateEmpty` |

Token names are taken from the uikit MCP catalog. The catalog exposes names
only (no resolved hex values), so colors are Arvan-console approximations —
swap in real token values when integrating.

## Project structure

```
src/
├── App.vue                  # console shell (sidebar + top bar + router view)
├── router.js                # /clusters, /clusters/create, /clusters/:id
├── store.js                 # reactive mock store + simulations (provision/upgrade)
├── data.js                  # catalog: region, versions, flavors, VPCs, pricing
├── styles/                  # tokens, base, component classes, shell
├── components/              # shell + Ar UI primitives
└── views/
    ├── ClusterList.vue      # cluster inventory
    ├── ClusterCreate.vue    # 3-step wizard + summary rail
    └── ClusterDetails.vue   # overview / pools / networking / operations
```

> **Note:** all data is mocked client-side (no backend). Pricing numbers are
> placeholders for the demo only.
