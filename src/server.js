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

      const headers = { ...req.headers };
      delete headers.host;

      const resp = await axios({
        method: req.method,
        url: targetUrl,
        data: req.body,
        headers,
        validateStatus: () => true
      });

      res.status(resp.status);

      const passHeaders = ['etag', 'location', 'link', 'content-type'];
      for (const [k, v] of Object.entries(resp.headers)) {
        if (passHeaders.includes(k.toLowerCase())) {
          res.setHeader(k, v);
        }
      }

      res.send(resp.data);
    } catch (err) {
      console.error('Proxy error:', err.message);
      res.status(502).json({
        error: 'DOWNSTREAM_ERROR',
        message: 'Composite failed to reach downstream microservice'
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

