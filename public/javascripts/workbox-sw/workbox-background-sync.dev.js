this.workbox = this.workbox || {};
this.workbox.backgroundSync = (function (WorkboxError_mjs,DBWrapper_mjs) {
'use strict';

try {
  self.workbox.v['workbox:background-sync:3.0.0-alpha.1'] = 1;
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

const serializableProperties = ['method', 'referrer', 'referrerPolicy', 'mode', 'credentials', 'cache', 'redirect', 'integrity', 'keepalive', 'signal'];

/**
 * A class to make it easier to serialize and de-serialize requests so they
 * can be stored in IndexedDB.
 *
 * @private
 */
class StorableRequest {
  /**
   * Converts a Request object to a plain object that can be structured
   * cloned or JSON-stringified.
   *
   * @param {Request} request
   * @return {Promise<StorableRequest>}
   */
  static fromRequest(request) {
    return babelHelpers.asyncToGenerator(function* () {
      const requestInit = { headers: {} };

      // Set the body if present.
      if (request.method !== 'GET') {
        // Use blob to support non-text request bodies,
        // and clone first in case the caller still needs the request.
        requestInit.body = yield request.clone().blob();
      }

      // Convert the headers from an iterable to an object.
      for (const [key, value] of request.headers.entries()) {
        requestInit.headers[key] = value;
      }

      // Add all other serializable request properties
      for (const prop of serializableProperties) {
        if (request[prop] !== undefined) {
          requestInit[prop] = request[prop];
        }
      }

      return new StorableRequest({ url: request.url, requestInit });
    })();
  }

  /**
   * Accepts a URL and RequestInit dictionary that can be used to create a
   * new Request object. A timestamp is also generated so consumers can
   * reference when the object was created.
   *
   * @param {Object} param1
   * @param {string} param1.url
   * @param {Object} param1.requestInit
   *     See: https://fetch.spec.whatwg.org/#requestinit
   * @param {number} param1.timestamp The time the request was created,
   *     defaulting to the current time if not specified.
   */
  constructor({ url, requestInit, timestamp = Date.now() }) {
    this.url = url;
    this.requestInit = requestInit;

    // "Private"
    this._timestamp = timestamp;
  }

  /**
   * Gets the private _timestamp property.
   *
   * @return {number}
   */
  get timestamp() {
    return this._timestamp;
  }

  /**
   * Coverts this instance to a plain Object.
   *
   * @return {Object}
   */
  toObject() {
    return {
      url: this.url,
      timestamp: this.timestamp,
      requestInit: this.requestInit
    };
  }

  /**
   * Converts this instance to a Request.
   *
   * @return {Request}
   */
  toRequest() {
    return new Request(this.url, this.requestInit);
  }
}

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

const DB_NAME = 'workbox-background-sync';
const OBJECT_STORE_NAME = 'requests';
const INDEXED_PROP = 'queueName';
const TAG_PREFIX = 'workbox-background-sync';
const MAX_RETENTION_TIME = 1000 * 60 * 60 * 24 * 7; // 7 days

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
 * A class to manage storing requests from a Queue in IndexedbDB,
 * indexed by their queue name for easier access.
 *
 * @private
 */
class QueueStore {
  /**
   * Associates this instance with a Queue instance, so entries added can be
   * identified by their queue name.
   *
   * @param {Queue} queue
   *
   * @private
   */
  constructor(queue) {
    this._queue = queue;
    this._db = new DBWrapper_mjs.DBWrapper(DB_NAME, 1, {
      onupgradeneeded: evt => evt.target.result.createObjectStore(OBJECT_STORE_NAME, { autoIncrement: true }).createIndex(INDEXED_PROP, INDEXED_PROP, { unique: false })
    });
  }

  /**
   * Takes a StorableRequest instance, converts it to an object and adds it
   * as an entry in the object store.
   *
   * @param {StorableRequest} storableRequest
   *
   * @private
   */
  addEntry(storableRequest) {
    var _this = this;

    return babelHelpers.asyncToGenerator(function* () {
      yield _this._db.add(OBJECT_STORE_NAME, {
        queueName: _this._queue.name,
        storableRequest: storableRequest.toObject()
      });
    })();
  }

  /**
   * Gets the oldest entry in the object store, removes it, and returns the
   * value as a StorableRequest instance. If no entry exists, it returns
   * undefined.
   *
   * @return {StorableRequest|undefined}
   *
   * @private
   */
  getAndRemoveOldestEntry() {
    var _this2 = this;

    return babelHelpers.asyncToGenerator(function* () {
      const [entry] = yield _this2._db.getAllMatching(OBJECT_STORE_NAME, {
        index: INDEXED_PROP,
        query: IDBKeyRange.only(_this2._queue.name),
        count: 1,
        includeKeys: true
      });

      if (entry) {
        yield _this2._db.delete(OBJECT_STORE_NAME, entry.primaryKey);
        return new StorableRequest(entry.value.storableRequest);
      }
    })();
  }
}

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

const queueNames = new Set();

/**
 * A class to manage storing failed requests in IndexedDB and retrying them
 * later. All parts of the storing and replaying process are observable via
 * callbacks.
 *
 * @memberof workbox.backgroundSync
 */
class Queue {
  /**
   * Creates an instance of Queue with the given options
   *
   * @param {string} name The unique name for this queue. This name must be
   *     unique as it's used to register sync events and store requests
   *     in IndexedDB specific to this instance. An error will be thrown if
   *     a duplicate name is detected.
   * @param {Object} [options]
   * @param {Object} [options.callbacks] Callbacks to observe the lifecycle of
   *     queued requests. Use these to respond to or modify the requests
   *     during the replay process.
   * @param {function(StorableRequest):undefined}
   *     [options.callbacks.requestWillEnqueue]
   *     Invoked immediately before the request is stored to IndexedDB. Use
   *     this callback to modify request data at store time.
   * @param {function(StorableRequest):undefined}
   *     [options.callbacks.requestWillReplay]
   *     Invoked immediately before the request is re-fetched. Use this
   *     callback to modify request data at fetch time.
   * @param {function(Array<StorableRequest>):undefined}
   *     [options.callbacks.queueDidReplay]
   *     Invoked after all requests in the queue have successfully replayed.
   * @param {number} [options.maxRetentionTime = 7 days] The amount of time (in
   *     ms) a request may be retried. After this amount of time has passed,
   *     the request will be deleted from the queue.
   */
  constructor(name, {
    callbacks = {},
    maxRetentionTime = MAX_RETENTION_TIME
  } = {}) {
    // Ensure the store name is not already being used
    if (queueNames.has(name)) {
      throw new WorkboxError_mjs.WorkboxError('duplicate-queue-name', { name });
    } else {
      queueNames.add(name);
    }

    this._name = name;
    this._callbacks = callbacks;
    this._maxRetentionTime = maxRetentionTime;
    this._queueStore = new QueueStore(this);

    this._addSyncListener();
  }

  /**
   * @return {string}
   */
  get name() {
    return this._name;
  }

  /**
   * Stores the passed request into IndexedDB. The database used is
   * `workbox-background-sync` and the object store name is the same as
   * the name this instance was created with (to guarantee it's unique).
   *
   * @param {Request} request The request object to store.
   */
  addRequest(request) {
    var _this = this;

    return babelHelpers.asyncToGenerator(function* () {
      const storableRequest = yield StorableRequest.fromRequest(request.clone());

      yield _this._runCallback('requestWillEnqueue', storableRequest);

      yield _this._queueStore.addEntry(storableRequest);
      yield _this._registerSync();
    })();
  }

  /**
   * Retrieves all stored requests in IndexedDB and retries them. If the
   * queue contained requests that were successfully replayed, the
   * `queueDidReplay` callback is invoked (which implies the queue is
   * now empty). If any of the requests fail, a new sync registration is
   * created to retry again later.
   */
  replayRequests() {
    var _this2 = this;

    return babelHelpers.asyncToGenerator(function* () {
      const now = Date.now();
      const replayedRequests = [];
      const failedRequests = [];

      let storableRequest;
      while (storableRequest = yield _this2._queueStore.getAndRemoveOldestEntry()) {
        // Ignore requests older than maxRetentionTime.
        if (now - storableRequest.timestamp > _this2._maxRetentionTime) {
          continue;
        }

        yield _this2._runCallback('requestWillReplay', storableRequest);

        const replay = { request: storableRequest.toRequest() };

        try {
          // Clone the request before fetching so callbacks get an unused one.
          replay.response = yield fetch(replay.request.clone());
        } catch (err) {
          replay.error = err;
          failedRequests.push(storableRequest);
        }

        replayedRequests.push(replay);
      }

      // If any requests failed, put the failed requests back in the queue
      // and register for another sync.
      if (failedRequests.length) {
        yield Promise.all(failedRequests.map(function (storableRequest) {
          return _this2._queueStore.addEntry(storableRequest);
        }));

        yield _this2._registerSync();
      }

      yield _this2._runCallback('queueDidReplay', replayedRequests);
    })();
  }

  /**
   * Runs the passed callback if it exists.
   *
   * @private
   * @param {string} name The name of the callback on this._callbacks.
   * @param {...*} args The arguments to invoke the callback with.
   */
  _runCallback(name, ...args) {
    var _this3 = this;

    return babelHelpers.asyncToGenerator(function* () {
      if (typeof _this3._callbacks[name] === 'function') {
        yield _this3._callbacks[name].apply(null, args);
      }
    })();
  }

  /**
   * In sync-supporting browsers, this adds a listener for the sync event.
   * In non-sync-supporting browsers, this will retry the queue on service
   * worker startup.
   *
   * @private
   */
  _addSyncListener() {
    if ('sync' in registration) {
      self.addEventListener('sync', event => {
        event.waitUntil(this.replayRequests());
      });
    } else {
      // If the browser doesn't support background sync, retry
      // every time the service worker starts up as a fallback.
      this.replayRequests();
    }
  }

  /**
   * Registers a sync event with a tag unique to this instance.
   *
   * @private
   */
  _registerSync() {
    var _this4 = this;

    return babelHelpers.asyncToGenerator(function* () {
      try {
        yield registration.sync.register(`${TAG_PREFIX}:${_this4._name}`);
      } catch (err) {
        // This means the registration failed for some reason, either because
        // the browser doesn't supported it or because the user has disabled it.
        // In either case, do nothing.
      }
    })();
  }

  /**
   * Returns the set of queue names. This is primarily used to reset the list
   * of queue names in tests.
   *
   * @return {Set}
   *
   * @private
   */
  static get _queueNames() {
    return queueNames;
  }
}

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
 * A class implementing the `fetchDidFail` lifecycle callback. This makes it
 * easier to add failed requests to a background sync Queue.
 *
 * @memberof workbox.backgroundSync
 */
class QueuePlugin {
  /**
   * @param {Queue} queue The Queue instance to add failed requests to.
   */
  constructor(queue) {
    this._queue = queue;
    this.fetchDidFail = this.fetchDidFail.bind(this);
  }

  /**
   * @param {Object} options
   * @param {Request} options.request
   * @private
   */
  fetchDidFail({ request }) {
    var _this = this;

    return babelHelpers.asyncToGenerator(function* () {
      yield _this._queue.addRequest(request);
    })();
  }
}

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



var publicAPI$1 = Object.freeze({
	Queue: Queue,
	QueuePlugin: QueuePlugin
});

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

return publicAPI$1;

}(workbox.core._private,workbox.core._private));
//# sourceMappingURL=workbox-background-sync.dev.js.map
