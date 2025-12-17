const express = require('express');
const cors = require('cors');
const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors({ origin: true, credentials: true }));

const AUTH_BASE_URL = (process.env.AUTH_BASE_URL || '').replace(/\/$/, '');
const ROUTE_BASE_URL = (process.env.ROUTE_BASE_URL || '').replace(/\/$/, '');
const SUB_BASE_URL = (process.env.SUBSCRIPTION_BASE_URL || '').replace(/\/$/, '');

console.log('AUTH_BASE_URL:', AUTH_BASE_URL);
console.log('ROUTE_BASE_URL:', ROUTE_BASE_URL);
console.log('SUBSCRIPTION_BASE_URL:', SUB_BASE_URL);

function createProxy(baseUrl) {
  return async function proxyHandler(req, res) {
    try {
      const targetUrl = baseUrl + req.originalUrl;
      
      console.log(`[PROXY] ${req.method} ${req.originalUrl} -> ${targetUrl}`);

      const headers = { ...req.headers };
      delete headers.host;

      const resp = await axios({
        method: req.method,
        url: targetUrl,
        data: req.body,
        headers,
        validateStatus: () => true,
        timeout: 30000
      });

      console.log(`[PROXY] Response: ${resp.status} from ${targetUrl}`);

      res.status(resp.status);

      const passHeaders = ['etag', 'location', 'link', 'content-type'];
      for (const [k, v] of Object.entries(resp.headers)) {
        if (passHeaders.includes(k.toLowerCase())) {
          res.setHeader(k, v);
        }
      }

      res.send(resp.data);
    } catch (err) {
      console.error(`[PROXY ERROR] ${req.method} ${req.originalUrl}:`, err.message);
      res.status(502).json({
        error: 'DOWNSTREAM_ERROR',
        message: `Composite failed to reach downstream: ${err.message}`
      });
    }
  };
}

app.get('/health', async (req, res) => {
  try {
    const [auth, route, sub] = await Promise.allSettled([
      axios.get(AUTH_BASE_URL + '/health').catch(() => null),
      axios.get(ROUTE_BASE_URL + '/health').catch(() => null),
      axios.get(SUB_BASE_URL + '/health').catch(() => null),
    ]);

    res.json({
      status: 'ok',
      services: {
        auth:  auth.status === 'fulfilled' ? 'up' : 'down',
        route: route.status === 'fulfilled' ? 'up' : 'down',
        subscription: sub.status === 'fulfilled' ? 'up' : 'down'
      }
    });
  } catch (e) {
    res.status(500).json({ status: 'degraded' });
  }
});

const authProxy = createProxy(AUTH_BASE_URL);
app.use('/api/auth', authProxy);
app.use('/api/users', authProxy);

const routeProxy = createProxy(ROUTE_BASE_URL);
app.use('/api/routes', routeProxy);

const subProxy = createProxy(SUB_BASE_URL);

// =====================================================
// FOREIGN KEY CONSTRAINT VALIDATION FOR SUBSCRIPTIONS
// Sprint 2 Requirement: Logical foreign key constraints
// =====================================================

// Custom handler for POST /api/subscriptions with foreign key validation
app.post('/api/subscriptions', async (req, res) => {
  try {
    const { userId, routeId, semester } = req.body;
    const authHeader = req.headers['authorization'];

    console.log('[FK VALIDATION] Validating foreign keys for subscription:', { userId, routeId, semester });

    // Validate required fields
    if (!userId || !routeId || !semester) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'userId, routeId, and semester are required'
      });
    }

    // =========================================================
    // PARALLEL EXECUTION: Validate both foreign keys using Promise.all
    // This demonstrates BOTH parallel execution AND foreign key constraints
    // =========================================================
    console.log('[FK VALIDATION] Starting parallel validation of userId and routeId...');
    const startTime = Date.now();

    const [userResult, routeResult] = await Promise.all([
      // Validate userId exists in MS1 (Auth/User Service)
      axios.get(`${AUTH_BASE_URL}/api/users/${userId}`, {
        headers: authHeader ? { Authorization: authHeader } : {},
        validateStatus: () => true,
        timeout: 10000
      }).catch(err => ({ status: 503, data: { error: 'Service unavailable', message: err.message } })),
      
      // Validate routeId exists in MS2 (Route Service)  
      axios.get(`${ROUTE_BASE_URL}/api/routes/${routeId}`, {
        headers: authHeader ? { Authorization: authHeader } : {},
        validateStatus: () => true,
        timeout: 10000
      }).catch(err => ({ status: 503, data: { error: 'Service unavailable', message: err.message } }))
    ]);

    const validationTime = Date.now() - startTime;
    console.log(`[FK VALIDATION] Parallel validation completed in ${validationTime}ms`);
    console.log(`[FK VALIDATION] User check status: ${userResult.status}, Route check status: ${routeResult.status}`);

    // Check if user exists (foreign key constraint on userId)
    if (userResult.status === 404) {
      console.log(`[FK VALIDATION] REJECTED: User ${userId} does not exist`);
      return res.status(400).json({
        error: 'FOREIGN_KEY_VIOLATION',
        message: `User with ID ${userId} does not exist`,
        field: 'userId',
        value: userId,
        validationTimeMs: validationTime
      });
    }

    if (userResult.status >= 500) {
      return res.status(503).json({
        error: 'SERVICE_UNAVAILABLE',
        message: 'User service is unavailable for validation',
        service: 'auth-user-service'
      });
    }

    // Check if route exists (foreign key constraint on routeId)
    if (routeResult.status === 404) {
      console.log(`[FK VALIDATION] REJECTED: Route ${routeId} does not exist`);
      return res.status(400).json({
        error: 'FOREIGN_KEY_VIOLATION',
        message: `Route with ID ${routeId} does not exist`,
        field: 'routeId',
        value: routeId,
        validationTimeMs: validationTime
      });
    }

    if (routeResult.status >= 500) {
      return res.status(503).json({
        error: 'SERVICE_UNAVAILABLE',
        message: 'Route service is unavailable for validation',
        service: 'route-service'
      });
    }

    console.log(`[FK VALIDATION] PASSED: Both user ${userId} and route ${routeId} exist`);

    // Foreign keys validated - now forward to MS3 to create subscription
    const headers = { ...req.headers };
    delete headers.host;

    const subscriptionResp = await axios({
      method: 'POST',
      url: `${SUB_BASE_URL}/api/subscriptions`,
      data: req.body,
      headers,
      validateStatus: () => true,
      timeout: 30000
    });

    // Forward response from MS3
    res.status(subscriptionResp.status);
    const passHeaders = ['etag', 'location', 'link', 'content-type'];
    for (const [k, v] of Object.entries(subscriptionResp.headers)) {
      if (passHeaders.includes(k.toLowerCase())) {
        res.setHeader(k, v);
      }
    }
    res.send(subscriptionResp.data);

  } catch (err) {
    console.error('[FK VALIDATION] Error:', err.message);
    res.status(502).json({
      error: 'COMPOSITE_ERROR',
      message: `Failed to process subscription: ${err.message}`
    });
  }
});

// Proxy for other subscription methods (GET, PUT, DELETE, etc.)
app.use('/api/subscriptions', subProxy);
app.use('/api/trips', subProxy);

app.get('/api/commuter/dashboard', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Missing Authorization header'
      });
    }

    const userResp = await axios.get(
      AUTH_BASE_URL + '/api/users/profile',
      { headers: { Authorization: authHeader } }
    );
    const user = userResp.data;
    const userId = user.id || user.userId;

    const [subsResp, routesResp, tripsResp] = await Promise.all([
      axios.get(SUB_BASE_URL + `/api/subscriptions/user/${userId}`, {
        headers: { Authorization: authHeader }
      }),
      axios.get(ROUTE_BASE_URL + '/api/routes', {
        headers: { Authorization: authHeader }
      }),
      axios.get(SUB_BASE_URL + '/api/trips', {
        headers: { Authorization: authHeader, params: { userId } }
      })
    ]);

    res.json({
      user,
      subscriptions: subsResp.data,
      routes: routesResp.data,
      trips: tripsResp.data
    });
  } catch (err) {
    console.error('Dashboard error:', err.message);
    res.status(500).json({
      error: 'DASHBOARD_FAILED',
      message: 'Failed to build commuter dashboard'
    });
  }
});

const port = process.env.PORT || 8080;
app.listen(port, '0.0.0.0', () => {
  console.log(`Composite service listening on port ${port}`);
});

