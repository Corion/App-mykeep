this.workbox = this.workbox || {};
this.workbox.googleAnalytics = (function (exports,Queue_mjs,QueuePlugin_mjs,cacheNames_mjs,Route_mjs,Router_mjs,NetworkFirst_mjs,NetworkOnly_mjs) {
'use strict';

try {
  self.workbox.v['workbox:google-analytics:3.0.0-alpha.1'] = 1;
} catch (e) {} // eslint-disable-line

/*
 Copyright 2017 Google Inc. All Rights Reserved.
 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

     http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
*/

const QUEUE_NAME = 'workbox-google-analytics';
const MAX_RETENTION_TIME = 1000 * 60 * 60 * 48; // Two days
const GOOGLE_ANALYTICS_HOST = 'www.google-analytics.com';
const GTM_HOST = 'www.googletagmanager.com';
const ANALYTICS_JS_PATH = '/analytics.js';
const GTAG_JS_PATH = '/gtag/js';
const COLLECT_PATH = '/collect';

/*
 Copyright 2017 Google Inc. All Rights Reserved.
 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

     http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
*/

/**
 * Promisifies the FileReader API to await a text response from a Blob.
 *
 * @param {Blob} blob
 * @return {Promise<string>}
 *
 * @private
 */
const getTextFromBlob = blob => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
};

/**
 * Creates the requestWillDequeue callback to be used with the background
 * sync queue plugin. The callback takes the failed request and adds the
 * `qt` param based on the current time, as well as applies any other
 * user-defined hit modifications.
 *
 * @param {Object} config See workbox.googleAnalytics.initialize.
 * @return {Function} The requestWillDequeu callback function.
 *
 * @private
 */
const createRequestWillReplayCallback = config => {
  return (() => {
    var _ref = babelHelpers.asyncToGenerator(function* ({ url, timestamp, requestInit }) {
      // Measurement protocol requests can set their payload parameters in either
      // the URL query string (for GET requests) or the POST body.
      let params;
      if (requestInit.body) {
        const payload = yield getTextFromBlob(requestInit.body);
        params = new URLSearchParams(payload);
      } else {
        params = new URL(url).searchParams;
      }

      // Set the qt param prior to apply the hitFilter or parameterOverrides.
      const queueTime = Date.now() - timestamp;
      params.set('qt', queueTime);

      if (config.parameterOverrides) {
        for (const param of Object.keys(config.parameterOverrides)) {
          const value = config.parameterOverrides[param];
          params.set(param, value);
        }
      }

      if (typeof config.hitFilter === 'function') {
        config.hitFilter.call(null, params);
      }

      requestInit.body = params.toString();
      requestInit.method = 'POST';
      requestInit.mode = 'cors';
      requestInit.credentials = 'omit';
      requestInit.headers = '[["Content-Type", "text/plain"]]';
      requestInit.url = `https://${GOOGLE_ANALYTICS_HOST}/${COLLECT_PATH}`;
    });

    return function (_x) {
      return _ref.apply(this, arguments);
    };
  })();
};

/**
 * Creates GET and POST routes to catch failed Measurement Protocol hits.
 *
 * @param {Queue} queue
 * @return {Array<Route>} The created routes.
 *
 * @private
 */
const createCollectRoutes = queue => {
  const match = ({ url }) => url.hostname === GOOGLE_ANALYTICS_HOST && url.pathname === COLLECT_PATH;

  const handler = new NetworkOnly_mjs.NetworkOnly({
    plugins: [new QueuePlugin_mjs.QueuePlugin(queue)]
  });

  return [new Route_mjs.Route(match, handler, 'GET'), new Route_mjs.Route(match, handler, 'POST')];
};

/**
 * Creates a route with a network first strategy for the analytics.js script.
 *
 * @param {string} cacheName
 * @return {Route} The created route.
 *
 * @private
 */
const createAnalyticsJsRoute = cacheName => {
  const match = ({ url }) => url.hostname === GOOGLE_ANALYTICS_HOST && url.pathname === ANALYTICS_JS_PATH;
  const handler = new NetworkFirst_mjs.NetworkFirst({ cacheName });

  return new Route_mjs.Route(match, handler, 'GET');
};

/**
 * Creates a route with a network first strategy for the gtag.js script.
 *
 * @param {string} cacheName
 * @return {Route} The created route.
 *
 * @private
 */
const createGtagJsRoute = cacheName => {
  const match = ({ url }) => url.hostname === GTM_HOST && url.pathname === GTAG_JS_PATH;
  const handler = new NetworkFirst_mjs.NetworkFirst({ cacheName });

  return new Route_mjs.Route(match, handler, 'GET');
};

/**
 * @param {Object=} [options]
 * @param {Object} [options.cacheName] The cache name to store and retrieve
 *     analytics.js. Defaults to the cache names provided by `workbox-core`.
 * @param {Object} [options.parameterOverrides]
 *     [Measurement Protocol parameters](https://developers.google.com/analytics/devguides/collection/protocol/v1/parameters),
 *     expressed as key/value pairs, to be added to replayed Google Analytics
 *     requests. This can be used to, e.g., set a custom dimension indicating
 *     that the request was replayed.
 * @param {Function} [options.hitFilter] A function that allows you to modify
 *     the hit parameters prior to replaying
 *     the hit. The function is invoked with the original hit's URLSearchParams
 *     object as its only argument.
 *
 * @memberof workbox.googleAnalytics
 */
const initialize = (options = {}) => {
  const cacheName = cacheNames_mjs.cacheNames.getGoogleAnalyticsName(options.cacheName);

  const queue = new Queue_mjs.Queue(QUEUE_NAME, {
    maxRetentionTime: MAX_RETENTION_TIME,
    callbacks: {
      requestWillReplay: createRequestWillReplayCallback(options)
    }
  });

  const routes = [createAnalyticsJsRoute(cacheName), createGtagJsRoute(cacheName), ...createCollectRoutes(queue)];

  const router = new Router_mjs.Router();
  for (const route of routes) {
    router.registerRoute(route);
  }

  self.addEventListener('fetch', evt => {
    const responsePromise = router.handleRequest(evt);
    if (responsePromise) {
      evt.respondWith(responsePromise);
    }
  });
};

/*
 Copyright 2017 Google Inc. All Rights Reserved.
 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

     http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
*/

exports.initialize = initialize;

return exports;

}({},workbox.backgroundSync,workbox.backgroundSync,workbox.core._private,workbox.routing,workbox.routing,workbox.strategies,workbox.strategies));
//# sourceMappingURL=workbox-google-analytics.dev.js.map
