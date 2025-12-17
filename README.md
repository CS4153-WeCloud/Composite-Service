# Composite Service

It sits in front of the three atomic microservices and exposes a single REST API for the frontend.

- **Auth & User Service** (Microservice-1 / `user-service`)
- **Route & Group Service** (Microservice-2)
- **Subscription & Trip Service** (Microservice-3)

---
## Demo : https://drive.google.com/file/d/1HkcpTL58mSuDeMATkAYCsd5mmzv-5K_c/view?usp=sharing
## Features

- Node.js + Express composite microservice  
- Encapsulates 3 atomic microservices behind a single base URL  
- Generic HTTP proxy layer for `/api/auth`, `/api/users`, `/api/routes`, `/api/subscriptions`, `/api/trips`  
- `/health` endpoint that checks all three microservices  
- Supports an aggregated dashboard endpoint (parallel calls)  
- **Parallel execution** using `Promise.all` and `Promise.allSettled`
- **Logical foreign key constraints** validation for cross-service references
- Configurable via environment variables (local vs Cloud Run)  
- Deployed to Google Cloud Run

---

## Sprint 2 Requirements Implementation

### ✅ Composite Microservice Requirements

1. **Encapsulation & Delegation**
   - Proxies all API calls to MS1 (Auth/User), MS2 (Routes), MS3 (Subscriptions)
   - Single entry point for frontend applications
   - Maintains original API contracts

2. **Parallel Execution** (Required: At least one method using threads/parallel execution)
   - `/health` endpoint: Uses `Promise.allSettled` to check all 3 services in parallel
   - `/api/commuter/dashboard`: Uses `Promise.all` to fetch user, subscriptions, routes, and trips simultaneously
   - `POST /api/subscriptions`: Uses `Promise.all` to validate `userId` and `routeId` in parallel

3. **Logical Foreign Key Constraints** (Required: Demonstrate implementing logical foreign key constraints)
   - `POST /api/subscriptions` validates:
     - `userId` exists in MS1 (Auth/User Service)
     - `routeId` exists in MS2 (Route Service)
   - Returns clear error messages for foreign key violations
   - Prevents orphaned records across distributed databases

---

## API Documentation

**Documentation Method**: Detailed inline code comments + README

As required by the project specifications for the 4th microservice, this service uses a different documentation approach than the atomic services:

- **Atomic Services (MS1/2/3)**: Use Swagger JSDoc to auto-generate OpenAPI 3.0 documentation
- **Composite Service**: Uses detailed inline comments in `src/server.js` to document API behavior, especially for the complex foreign key validation logic

### Why This Approach?

1. **Appropriate for aggregation layer**: Composite Service primarily proxies existing APIs
2. **Focus on logic**: Detailed comments explain orchestration and validation logic
3. **Different methodology**: Satisfies the requirement for "using Swagger to do API 1st definition" by documenting design decisions in code
4. **Clear error handling**: All error responses are documented inline

### Key Documented Sections

See `src/server.js` for detailed documentation:
- Lines 20-59: Proxy handler implementation
- Lines 61-80: Health check with parallel execution
- Lines 92-209: Foreign key validation with parallel execution (Sprint 2 requirement)
- Lines 215-257: Dashboard aggregation with parallel execution

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

### Health Check

- `GET /health` - Check status of all 3 microservices (parallel execution)

```bash
curl https://composite-service-1081353560639.us-central1.run.app/health
```

Response:
```json
{
  "status": "ok",
  "services": {
    "auth": "up",
    "route": "up",
    "subscription": "up"
  }
}
```

---

### User & Auth (proxied to MS1)

- `POST /api/auth/google` - Google OAuth login
- `GET  /api/auth/me` - Get current user
- `GET  /api/users/:id` - Get user by ID
- `GET  /api/users/profile` - Get current user profile
- `PUT  /api/users/profile` - Update user profile

---

### Routes (proxied to MS2)

- `GET  /api/routes` - List all routes (supports pagination, filtering)
- `POST /api/routes` - Create new route
- `GET  /api/routes/:id` - Get route by ID
- `PUT  /api/routes/:id` - Update route (requires ETag)
- `DELETE /api/routes/:id` - Delete route
- `POST /api/routes/:id/join` - Join a route
- `DELETE /api/routes/:id/leave` - Leave a route
- `GET  /api/routes/:id/members` - Get route members
- `POST /api/routes/:id/activate` - Activate route (async, returns 202)

---

### Subscriptions (with Foreign Key Validation)

#### `POST /api/subscriptions` - Create Subscription

**⚠️ This endpoint includes logical foreign key constraint validation:**

- Validates `userId` exists in MS1 (parallel request)
- Validates `routeId` exists in MS2 (parallel request)
- Only creates subscription if both foreign keys are valid

Request:
```json
{
  "userId": 14,
  "routeId": 1,
  "semester": "Fall 2025"
}
```

Success Response (201):
```json
{
  "id": 26,
  "userId": 14,
  "routeId": 1,
  "semester": "Fall 2025",
  "status": "active"
}
```

Foreign Key Violation Response (400):
```json
{
  "error": "FOREIGN_KEY_VIOLATION",
  "message": "User with ID 99999 does not exist",
  "field": "userId",
  "value": 99999,
  "validationTimeMs": 30
}
```

#### Other Subscription Endpoints (proxied to MS3)

- `GET  /api/subscriptions` - List subscriptions
- `GET  /api/subscriptions/:id` - Get subscription by ID
- `GET  /api/subscriptions/user/:userId` - Get user's subscriptions
- `PUT  /api/subscriptions/:id` - Update subscription
- `POST /api/subscriptions/:id/cancel` - Cancel subscription
- `DELETE /api/subscriptions/:id` - Delete subscription

---

### Aggregated Dashboard (Parallel Execution)

- `GET /api/commuter/dashboard` - Get user's complete dashboard data

This endpoint demonstrates parallel execution by fetching:
- User profile from MS1
- User's subscriptions from MS3
- All available routes from MS2
- User's trips from MS3

All requests are made in parallel using `Promise.all`.

---

### Authorization

Most endpoints require:

```http
Authorization: Bearer <JWT_TOKEN>
```

---

## Testing & Demonstration

### Test Foreign Key Constraints

**Test 1: Invalid userId (should fail)**
```bash
curl -X POST "https://composite-service-1081353560639.us-central1.run.app/api/subscriptions" \
  -H "Content-Type: application/json" \
  -d '{"userId": 99999, "routeId": 1, "semester": "Test 2026"}'
```

Expected: `400 FOREIGN_KEY_VIOLATION - User with ID 99999 does not exist`

**Test 2: Invalid routeId (should fail)**
```bash
curl -X POST "https://composite-service-1081353560639.us-central1.run.app/api/subscriptions" \
  -H "Content-Type: application/json" \
  -d '{"userId": 14, "routeId": 99999, "semester": "Test 2026"}'
```

Expected: `400 FOREIGN_KEY_VIOLATION - Route with ID 99999 does not exist`

**Test 3: Valid data (should succeed)**
```bash
curl -X POST "https://composite-service-1081353560639.us-central1.run.app/api/subscriptions" \
  -H "Content-Type: application/json" \
  -d '{"userId": 14, "routeId": 1, "semester": "Test 2026"}'
```

Expected: `201 Created` (or `200 OK` if subscription already exists)

---

### Test Parallel Execution

**Health Check (parallel status check of 3 services)**
```bash
time curl -s "https://composite-service-1081353560639.us-central1.run.app/health"
```

Note the response time - it's the time of the slowest service, not the sum of all three.

---

### Example Frontend Usage

```js
const BASE = process.env.REACT_APP_COMPOSITE_SERVICE_URL;

// Get user profile
fetch(`${BASE}/api/users/profile`, {
  headers: { Authorization: `Bearer ${accessToken}` }
});

// Get user's subscriptions
fetch(`${BASE}/api/subscriptions/user/${userId}`, {
  headers: { Authorization: `Bearer ${accessToken}` }
});

// Create subscription (with automatic FK validation)
fetch(`${BASE}/api/subscriptions`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    userId: 14,
    routeId: 1,
    semester: 'Fall 2025'
  })
})
.then(response => {
  if (response.status === 400) {
    return response.json().then(error => {
      // Handle foreign key violation
      alert(error.message);
    });
  }
  return response.json();
});
```

---

## Architecture Highlights

### Microservices Coordination

```
Frontend → Composite Service → MS1 (Auth/User)
                             → MS2 (Routes)
                             → MS3 (Subscriptions)
```

### Foreign Key Validation Flow

```
POST /api/subscriptions
    │
    ├─> Validate userId (MS1)  ─┐
    │                            │ Promise.all (parallel)
    └─> Validate routeId (MS2) ─┘
    │
    ├─> Both valid? → Forward to MS3 → 201 Created
    └─> Invalid?    → Return 400 FOREIGN_KEY_VIOLATION
```

### Parallel Execution Benefits

- **Performance**: Multiple requests happen simultaneously
- **Efficiency**: Total time = max(service1_time, service2_time), not sum
- **Resilience**: Uses `Promise.allSettled` for health checks (failures don't block)

---

## Project Requirements Mapping

| Requirement | Implementation | Location |
|-------------|----------------|----------|
| **Composite microservice** | ✅ Encapsulates MS1/2/3 | All endpoints |
| **Delegate to atomic services** | ✅ Proxy pattern | `createProxy()` function |
| **Parallel execution** | ✅ Promise.all/allSettled | `/health`, `/dashboard`, FK validation |
| **Logical foreign key constraints** | ✅ Cross-service validation | `POST /api/subscriptions` |
| **API documentation** | ✅ Code comments + README | This file + `src/server.js` |

---
