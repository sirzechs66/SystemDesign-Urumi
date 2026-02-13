# Urumi Store Orchestrator

## Overview

Urumi Store Orchestrator is a Kubernetes-native platform that provisions isolated ecommerce stores on demand using Helm. It supports multiple store engines (WooCommerce and Medusa) and is designed to run **unchanged** across local and production environments, with differences handled purely via configuration.

This project was built as part of the **Urumi AI SDE Internship – Round 1 (System Design)** assessment.

---

<img width="1551" height="1021" alt="Screenshot 2026-02-13 143342" src="https://github.com/user-attachments/assets/a8c77302-2708-48cb-b152-dab52d77b636" />

---

## 🎯 Key Capabilities

- 🚀 One-click provisioning of ecommerce stores
    
- 🧱 Namespace-per-store isolation
    
- 🔁 Concurrent store provisioning using async orchestration
    
- 🌐 Automatic per-store ingress routing
    
- 💾 Persistent storage for databases
    
- 🧹 Clean teardown (namespace + resources)
    
- 🔄 Same Helm charts for local and production
    
- 🤖 Multi-engine support (WooCommerce + Medusa stub)
    
- 🛡️ Control-plane guardrails (rate limiting, quotas-ready)
    

---

## 🧩 Architecture

<img width="2308" height="1034" alt="System_Design_urumi_img" src="https://github.com/user-attachments/assets/cb507f19-a277-4945-b902-eaabc10b885d" />

### Control Plane

- **Backend API**: Node.js (Express)
    
- **Async Orchestration**: BullMQ + Redis
    
- **Metadata Store**: SQLite
    
- **Provisioning**: Helm (Kubernetes-native)
    
- **Guardrails**: API rate limiting + provisioning timeouts
    

### Data Plane (per store)

- Dedicated Kubernetes namespace
    
- Helm-managed workloads
    
- Persistent volumes for databases
    
- Ingress with stable URLs
    

### Frontend

- React + Vite dashboard
    
- Engine selection (WooCommerce / Medusa)
    
- Live status polling
    
- Static production build
    

---

## 🏗️ Repository Structure

`. ├── backend/                 # Orchestrator API + provisioning worker │   ├── index.js             # Express API + BullMQ worker │   ├── package.json │   └── database.sqlite      # Store metadata (status, timestamps, URLs) │ ├── frontend/                # React dashboard (Vite) │   ├── src/ │   ├── dist/ │   └── package.json │ ├── charts/ │   ├── wc-store/            # WooCommerce Helm chart (fully implemented) │   │   ├── Chart.yaml │   │   ├── values-local.yaml │   │   └── values-prod.yaml │   │ │   └── medusa-stub/         # MedusaJS stub Helm chart (extensible) │       ├── Chart.yaml │       └── values-local.yaml │ ├── kind-config.yaml         # Local Kubernetes (Kind) cluster config └── README.md`

---

## 🧪 Supported Store Engines

### 1. WooCommerce (Fully Implemented)

- WordPress + WooCommerce
    
- Product catalog
    
- Cart & checkout
    
- Order confirmation via admin UI
    
- Persistent MariaDB storage
    

### 2. Medusa (Stub – Round-1 Scope)

- Lightweight Node.js service
    
- Simple product + checkout flow
    
- Demonstrates multi-engine orchestration
    
- Designed to be replaced with full Medusa stack in Round-2
    

---

## 🛡️ Guardrails & Abuse Prevention (Control Plane)

### API Rate Limiting (Implemented)

The backend enforces **IP-based rate limiting** on store provisioning:

- **Max 5 store creation requests per IP per 15 minutes**
    
- Implemented using `express-rate-limit`
    
- Protects cluster resources from abuse or accidental overload
    

This guardrail applies equally in **local and production** environments.

---

### Provisioning Timeouts (Implemented)

Store provisioning uses **Helm timeouts** to prevent runaway installs:

- Helm operations fail cleanly if resources do not become ready within a bounded time
    
- Failed stores are marked as `Failed` in metadata
    
- No partial or orphaned state remains
    

This ensures:

- Predictable provisioning behavior
    
- No stuck jobs in the async queue
    

---

### IP-Based Controls (Extensible)

- Current implementation tracks requests **per client IP**
    
- IP banning / allowlists can be enabled at:
    
    - API layer (middleware)
        
    - Ingress layer (NGINX annotations)
        
- Explicitly documented and easy to enable without architectural changes
    

---

### Future Guardrails (Planned, Not Enabled by Default)

- Per-user store quotas
    
- Namespace-level `ResourceQuota` and `LimitRange`
    
- NetworkPolicies (deny-by-default per namespace)
    

These are intentionally deferred to keep Round-1 scope focused and auditable.

---

## 🖥️ Local Setup (Kind)

### Prerequisites

- Docker
    
- kubectl
    
- Helm
    
- Node.js (18+)
    
- Redis (local or Docker)
    

---

### 1️⃣ Create Kind Cluster

`kind create cluster --config kind-config.yaml`

Install NGINX Ingress Controller:

`kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml`

---

### 2️⃣ Backend Configuration (Local)

Create `backend/.env`:

`ENVIRONMENT=local LOCAL_BASE_DOMAIN=localtest.me PORT=3005  REDIS_HOST=127.0.0.1 REDIS_PORT=6379  CHARTS_BASE_PATH=/absolute/path/to/charts`

Start backend:

`cd backend npm install node index.js`

---

### 3️⃣ Frontend Configuration

Create `frontend/.env`:

`VITE_API_BASE=http://localhost:3005/api`

Run frontend:

`cd frontend npm install npm run dev`

Open: [http://localhost:5173](http://localhost:5173)

---

### 4️⃣ Create a Store (Local)

From the dashboard:

1. Enter store name
    
2. Select engine (WooCommerce / Medusa)
    
3. Click **Launch**
    

Store URL format:

`http://<store-id>.localtest.me`

---

## ☁️ Production Setup (AWS EC2 + k3s)

### Environment

- AWS EC2 (Ubuntu)
    
- k3s Kubernetes
    
- NGINX Ingress
    
- Public wildcard routing via `sslip.io`
    

---

### Backend `.env` (Prod)

`ENVIRONMENT=prod PUBLIC_IP=<EC2_PUBLIC_IP> PORT=3005  REDIS_HOST=127.0.0.1 REDIS_PORT=6379  CHARTS_BASE_PATH=/home/ubuntu/.../charts`

Ensure EC2 Security Group allows:

- TCP 80
    
- TCP 3005
    

---

### Frontend Build (Prod)

Create `frontend/.env.production`:

`VITE_API_BASE=http://<EC2_PUBLIC_IP>:3005/api`

Build and serve:

`npm run build npx serve -s dist -l tcp://0.0.0.0:4000`

---

## 🛒 Definition of Done (Verified)

### WooCommerce

- Storefront loads
    
- Product added to cart
    
- Checkout completed
    
- Order visible in admin
    

### Medusa

- Store endpoint reachable
    
- Product + checkout flow demonstrated
    
- Order creation validated via API / UI
    

---

## 🔐 Security & Isolation

- Namespace-per-store isolation
    
- Separate PVCs per store
    
- No hardcoded secrets
    
- Environment-based configuration
    
- Control-plane rate limiting
    
- Guardrails designed for safe multi-tenancy
    

---

## 🔄 Local ↔ Prod Parity

|Aspect|Local|Prod|
|---|---|---|
|Helm charts|Same|Same|
|Backend code|Same|Same|
|Frontend code|Same|Same|
|Values file|`values-local.yaml`|`values-prod.yaml`|
|Domains|`localtest.me`|`sslip.io`|
|Change required|`.env` only|`.env` only|

---

## 🧠 Design Notes

- Helm provides idempotent, declarative provisioning
    
- BullMQ enables safe async workflows
    
- SQLite is sufficient for metadata (swap-ready for Postgres)
    
- Guardrails focus on **control-plane safety**, not user traffic
    
- Architecture is ready for **Gen-AI orchestration (Round-2)**
    

---

## 🚀 Future Work (Post Round-1)

- Full Medusa stack deployment
    
- Namespace-level resource quotas
    
- RBAC with least privilege
    
- Audit logging
    
- CI/CD for image builds
    
- TLS via cert-manager
    
- Domain mapping via dashboard
    

---

## 👤 Author

**Kartik Gupta**  
Urumi AI — SDE Internship Candidate
