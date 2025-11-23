# Composite Service

It sits in front of the three atomic microservices and exposes a single REST API for the frontend.

- **Auth & User Service** (Microservice-1 / `user-service`)
- **Route & Group Service** (Microservice-2)
- **Subscription & Trip Service** (Microservice-3)

---

## Features

- Node.js + Express composite microservice  
- Encapsulates 3 atomic microservices behind a single base URL  
- Generic HTTP proxy layer for `/api/auth`, `/api/users`, `/api/routes`, `/api/subscriptions`, `/api/trips`  
- `/health` endpoint that checks all three microservices  
- Supports an aggregated dashboard endpoint (parallel calls)  
- Configurable via environment variables (local vs Cloud Run)  
- Deployed to Google Cloud Run

---

## Environment

The composite uses these environment variables to locate the atomic services:

| Variable                | Description                          |
|-------------------------|--------------------------------------|
| `AUTH_BASE_URL`         | Auth & User Service base URL         |
| `ROUTE_BASE_URL`        | Route & Group Service base URL       |
| `SUBSCRIPTION_BASE_URL` | Subscription & Trip Service base URL |
| `PORT`                  | Port for local development           |

Example for **local dev**:

```env
AUTH_BASE_URL=http://localhost:3001
ROUTE_BASE_URL=http://localhost:3002
SUBSCRIPTION_BASE_URL=http://localhost:3003
PORT=8080
```

Example for **Cloud Run**:

```env
AUTH_BASE_URL=https://user-service-1081353560639.us-central1.run.app
ROUTE_BASE_URL=http://<route-vm-external-ip>:3002
SUBSCRIPTION_BASE_URL=http://<subscription-vm-external-ip>:3003
```

---

## Run Locally

Prerequisites:

- Node.js ≥ 18
- npm
- All three atomic services running on `localhost:3001/3002/3003`

Commands:

```bash
npm install
cp .env.example .env   # edit if needed
npm run dev            # or: npm start
```

The composite listens on:

```text
http://localhost:8080
```

Health check:

```bash
curl http://localhost:8080/health
```

---

## Cloud Run

The composite is deployed as a Cloud Run service:

```text
Service name: composite-service
Project: wecloud-475402
Region: us-central1
URL: https://composite-service-1081353560639.us-central1.run.app
```


> Require an identity token to invoke the Cloud Run URL.

---

## API (Frontend View)

Base URL:

- Local: `http://localhost:8080`
- Cloud Run: `https://composite-service-1081353560639.us-central1.run.app`

### User & Auth (proxied)

- `POST /api/auth/login`
- `POST /api/auth/register`
- `GET  /api/users/profile`
- `PUT  /api/users/profile`

### Subscriptions (proxied)

- `GET  /api/subscriptions/user/:userId`
- `POST /api/subscriptions`
- `PUT  /api/subscriptions/:id`
- `DELETE /api/subscriptions/:id`

All require:

```http
Authorization: Bearer <accessToken>
```

### Example frontend usage

```js
const BASE = process.env.REACT_APP_COMPOSITE_SERVICE_URL;

fetch(`${BASE}/api/users/profile`, {
  headers: { Authorization: `Bearer ${accessToken}` }
});

fetch(`${BASE}/api/subscriptions/user/${userId}`, {
  headers: { Authorization: `Bearer ${accessToken}` }
});
```
