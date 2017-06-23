// https://bitsofco.de/bitsofcode-pwa-part-1-offline-first-with-service-worker/
// Import the Service Worker Toolbox file
'use strict';
importScripts(
    './javascripts/sw-toolbox.js',
    './javascripts/localforage.js'
);
self.toolbox.options.debug = true;

// In the long run, fill the cache ourselves and request/match up the
// digests between the local version and the live version
// Propably use SHA256 or whatever is available in Javascript natively
// Consider using window.crypto to get at the SHA-256 calculator
// https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto
// If we are online and at least 24 hours have passed, we should check
// the checksums to see if we need to upgrade

const precacheFiles = [
    './',
    './favicon.ico',
    './index.html',
    './search.html',
    './settings.html',
    './settings.json',
    './version.json',
    './javascripts/jquery-3.1.1.min.js',
    './javascripts/handlebars-v4.0.5.js',
    './javascripts/localforage.js',
    './javascripts/morphdom-v2.3.2.js',
    './javascripts/Math.uuid.js',
    './service-worker.js',
    './javascripts/sw-companion.js',
    './javascripts/app.js',
    './css/app.css',
    './css/error.css',
    './css/style.css'
];

// Precache the files
self.toolbox.precache(precacheFiles);

// Also try to request that our data shouldn't be purged on storage pressure
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().then(function(granted) {
    if (granted)
        //alert("Storage will not be cleared except by explicit user action");
    else
        //alert("Storage may be cleared by the UA under storage pressure.");
  });
}

// Start up immediately, replacing old instances
self.addEventListener('install', function(event) {
  event.waitUntil(self.skipWaiting());
});

// All pages can use us immediately
self.addEventListener('activate', function(event) {
  event.waitUntil(self.clients.claim());

  // Do schema migration here, if necessary?!

  // We installed a new version of the service worker, so
  // force an update of all the rest as well:
  // console.log("(sw) Updating because of activation");
  // update();

  console.log('(sw) Finally active. Ready to start serving content!');
});

// This is not an elegant way of upgrading. Ideally, we would download
// _all_ of the new URLs and then switch to them atomically. Oh well.
// Also, we would only update the changed parts and not everything. Oh well.
function update() {
    var url;
    precacheFiles.forEach( function( url, i ) {
        self.toolbox.uncache( url );
        self.toolbox.cache( url );
    });
}

localforage.config({
    "name": "mykeep",
    "storename": "notes",
    "description": "Local cache of App::mykeep notes"
});

function sendMessage(client, msg){
    return new Promise(function(resolve, reject){
        var msg_chan = new MessageChannel();

        msg_chan.port1.onmessage = function(event){
            if(event.data.error){
                reject(event.data.error);
            }else{
                resolve(event.data);
            }
        };

        client.postMessage(msg, [msg_chan.port2]);
    });
}

// Send the UI data from in memory. This could go out of sync with the DB
// but we usually have just written the data to local storage as a copy
function notifyUI(items) {
    console.log("Notifying clients of UI update", items);
    return clients.matchAll().then(function(clients) {
        clients.forEach(function(client) {
            sendMessage(client, items).then(function(resp) {
                console.log("SW Received Message: "+resp);
            });
        });
    });
};

// Merge two instances
// The current implementation says last one touched wins - not elegant,
// but one possible approach
function mergeItem( local, remote ) {
    var result = {
        "storeLocal"  : false,
        "storeRemote" : false,
        "item"        : local
    };

    // Check here whether one was deleted and the other one still contains
    // changes that were made after that. If the remote item is deleted
    // but the local one is older, wipe the local text and body to save space
    // and later some cleanup job should be able to purge the item totally

    if( remote.modifiedAt > local.modifiedAt ) {
        // The local syncSetting always takes precedence!
        remote.syncSetting = local.syncSetting;

        result.item = remote;
        result.storeLocal = true;
    };
    if( local.modifiedAt > remote.modifiedAt
        && local.syncSetting !== "deviceOnly" ) {
        result.item = local;
        result.storeRemote = true;
    };
    return result
}

var merged;

function byLastChange(items) {
    items.sort(function(a,b) {
        return    b["pinPosition"]-a["pinPosition"]
               || b["modifiedAt"]-a["modifiedAt"]
               || b["createdAt"] -a["createdAt"]
    });
    return items
};

// Return full notes for the time being
function fetchNotes(options) {
    // Kick off a HTTP query to the mothership
    var remote;
    if( options.remote ) {
        console.log("(sw) Requesting notes from upstream");
        remote = fetch("./notes/list").then( function(response) {
            return response.json().then(function( json ) {
                console.log("(sw) Mothership status received", json);
                return json.items;
            });
        }).catch(function(response) {
            console.log("(sw) Seems we are offline");
        });
    } else {
        // Remote is empty
        remote = Promise.resolve([]);
    };

    var local = localforage.keys().then(function(keys) {
        //console.log("(sw) listing keys from localStorage", keys);
        var fullNotes = [];
        for( var i = 0; i < keys.length; i++ ) {
            var k = keys[i];
            //console.log(k);
            fullNotes.push( localforage.getItem(k).then(function(v) {
                //console.log(k,"=>",v);
                return v
            }));
        };
        //console.log("Full of promises", fullNotes);
        // Sort notes by last modified resp. newest created
        return Promise.all(fullNotes).then(function(notes) {
            //console.log("Retrieved notes",notes);
            return Promise.resolve(
                byLastChange(notes)
            );
        }).catch(function(err) {
            console.log("all",err);
        });
    });
    console.log("Local stuff",local);

    // Stuff we will do once we have both, the HTTP response and the local
    // data
    var lastSync = new Date().getTime();
    merged = Promise.all([local,remote]).then(function(items){
        var local = items[0];
        var remote = items[1];

        if( remote !== undefined ) {
            console.log("(sw) Local and remote data available, merging", items);

            // Merge the two
            var merged = {};
            var unsynchronized = {}; // Things we created while offline
            for( var i = 0; i < local.length; i++ ) {
                var item = local[i];
                merged[item.id] = item;
                unsynchronized[item.id] = item;
            };
            var local_changes = [];
            for( var i = 0; i < remote.length; i++ ) {
                var item = remote[i];
                var local_item;
                if( local_item = merged[ item.id ]) {
                    delete unsynchronized[item.id]; // the remote side knows this ID
                    var info = mergeItem( local_item, item );

                    // Update the last synchronized timestamp of all items
                    info.lastSyncedAt = lastSync;

                    if( info.storeRemote ) {
                        // Push the change to the mothership
                        markForSync( info.item );
                    };

                    if( info.storeLocal ) {
                        // Update our local storage if anything besides lastSyncedAt changed
                        // Maybe we should always store...
                        // console.log("Storing updated item locally", info.item );
                        local_changes.push( storeItem( info.item ));
                    };

                    item = info.item;
                } else {
                    // Update our local storage
                    console.log("Storing new item locally", item);

                    local_changes.push( storeItem( item ));
                };
                merged[item.id] = item;
            };

            // Tell the mothership of our new things:
            var newCreated = byLastChange( Object.values(unsynchronized));
            newCreated.forEach(function(item){
                markForSync(item);
            });
            // If we have written our local copy of the world, tell the UI
            // to refresh its view
            Promise.all(local_changes).then(function(changes) {
                // Notify the UI of the newly available list
                var values = byLastChange( Object.values(merged));
                console.log("(sw) Local and remote data merged, notifying UI for repaint", values);
                return notifyUI({ "notes" : values, "action" : "synchronized" });
            });
        };

    });

    return local
};

// Consider storing as blobs, always, as we need to decode manually anyway

// Uuh - we shouldn't use the toolbox here but do our own cache lookup
// in localforage.
self.toolbox.router.get("notes/list", function(request, values,options) {
    console.log("(sw) fetch notes list called");

    // XXX determine this from the headers or the query part of the URL
    //     or whatever
    var options = {remote: true};

    // Return the local list first, and later update it
    return fetchNotes(options).then(function(cannedNotes) {
        var payload = JSON.stringify({ "items" : cannedNotes });
        return new Response(payload, {
            "status": 200,
            "headers": { 'Content-Type': 'application/json' }
        });
    });
});

function storeItem(item) {
    console.log("(sw) Storing " + item.id);
    return localforage.setItem(item.id, item)
}

// Uuh - we shouldn't use the toolbox here but do our own cache lookup
// in localforage.
self.toolbox.router.post("./notes/:id", function(request, values,options) {
    console.log("(sw) save note called");
    //var payload = JSON.stringify(cannedNotes);

    // Store locally as object
    // What about attachments like images?!
    // What about partial uploads?! Or do we only do these here, not
    // in the client?!
    request.json().then( function(item) {
        storeItem(item).then(function( item ) {
            // stored, now trigger a sync event resp. mark for sync so the
            // mothership also learns of our changes
            markForSync(item);
        });
    });

    // Nothing to say here
    return new Response();
});

self.toolbox.router.post("./notes/:id/delete", function(request, values,options) {
    console.log("(sw) delete note called");

    // Store locally as object
    // What about attachments like images?!
    // What about partial uploads?! Or do we only do these here, not
    // in the client?!
    request.json().then( function(item) {
        storeItem(item).then(function( item ) {
            // stored, now trigger a sync event resp. mark for sync so the
            // mothership also learns of our changes
            markForSync(item);
        });
    });

    // Nothing to say here
    return new Response();
});

// Hacky url template implementation
// Lacks for example %-escaping
function urlTemplate( tmpl, vars ) {
  return tmpl.replace(/:(\w+)/, function(m,name){ return vars[name] || ":"+name }, 'y')
};

// Function to (re)perform a HTTP POST to our mothership
function httpPost(item) {
    return fetch(new Request(
        urlTemplate("./notes/:id", item),
    {
        method: "POST",
        body: JSON.stringify(item),
        credentials: "include"
    }))
};

// Maybe later reduce this so that the network request gets made only once
// per 24 hours or something configurable
self.toolbox.router.get("./version.json", toolbox.fastest, { debug: true});

// Automatically store all notes we download in the cache
// Even incomplete items, so we know what to fetch later
/*
self.toolbox.router.default = function(request, values,options) {
    console.log("(sw) Default fetch called");
    return fetch(request);
};
*/
toolbox.router.default = toolbox.cacheFirst;

// Mark an item as to-be-synced
// The item must have been stored completely in localforage because we don't
// know when we will in memory next for synchronizsation
function markForSync(item) {
    // Schedule the background sync instead of performing the HTTP stuff
    // https://developers.google.com/web/updates/2015/12/background-sync
    // This seems to be intended for the page, not for the service worker
    // but I don't want to split the communication logic in two parts, again
    /*
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      navigator.serviceWorker.ready.then(function(reg) {
          console.log("Background-sync event launched", item.id);
          return reg.sync.register("mykeep-sync-"+item.id);

      }).catch(function() {
        // system was unable to register for a sync,
        // this could be an OS-level restriction
        return httpPost(item);
      });

    } else {
      console.log("No service worker sync events available, using direct comm");
      // serviceworker/sync not supported
      // postDataFromThePage();
    */
      return httpPost(item).then(function(r){
          // item.lastSyncedAt = Math.floor((new Date).getTime() / 1000);
          // And update our local copy as well
          // storeItem( item );
          console.log("Data posted to mothership",item.id);
      });
    //}
}

// onsync handler
// compare the two items and revert to the newer
self.addEventListener('sync', function(event) {
    var match = event.tag.match(/^mykeep-sync-(.*)/);
    if (match) {
      event.waitUntil(
          localforage.getItem(match.group(1)).then( function(item) {
              console.log("(sw) Synchronizing item to server",item);
              return httpPost(item)

              // Actually, we should compare the response we get and update
              // our local copy if necessary, and update the UI if necessary
          })
      );
  }
});
