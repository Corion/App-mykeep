// https://bitsofco.de/bitsofcode-pwa-part-1-offline-first-with-service-worker/
// Import the Service Worker Toolbox file
'use strict';
importScripts(
    './javascripts/sw-toolbox.js',
    './javascripts/localforage.js'
);
self.toolbox.options.debug = true;

const precacheFiles = [  
    //'./',
    //'./index.html',
    './javascripts/jquery-3.1.1.min.js',
    './javascripts/handlebars-v4.0.5.js',
    './javascripts/app.js'
];

// Start up immediately, replacing old instances
self.addEventListener('install', function(event) {
  event.waitUntil(self.skipWaiting());
});

// All pages can use us immediately
self.addEventListener('activate', function(event) {
  event.waitUntil(self.clients.claim());
  console.log('(sw) Finally active. Ready to start serving content!');  
});

// Precache the files
self.toolbox.precache(precacheFiles);

localforage.config({
    "name": "mykeep",
    "storename": "notes",
    "description": "Local cache of App::mykeep notes"
});

// Return full notes for the time being
function localNotes() {
    return localforage.keys().then(function(keys) {
        //console.log("(sw) listing keys from localStorage", keys);
        var fullNotes = [];
        for( var i = 0; i < keys.length; i++ ) {
            var k = keys[i];
            console.log(k);
            fullNotes.push( localforage.getItem(k).then(function(v) {
                //console.log(k,"=>",v);
                return v
            }));
        };
        console.log("Full of promises", fullNotes);
        // Sort notes by last modified resp. newest created
        return Promise.all(fullNotes).then(function(notes) {
            console.log("Retrieved notes",notes);
            return Promise.resolve(
                notes.sort(function(a,b) {
                    console.log("Sort",a,b);
                    return    b["modifiedAt"]-a["modifiedAt"]
                           || b["createdAt"] -a["createdAt"]
                })
            );
        }).catch(function(err) {
            console.log("all",err);
        });
    });
};

// Consider storing as blobs, always, as we need to decode manually anyway

// Uuh - we shouldn't use the toolbox here but do our own cache lookup
// in localforage.
self.toolbox.router.get("/notes/list", function(request, values,options) {
    console.log("(sw) fetch notes list called");
    
    // Also try to fetch the notes from the remote end
    
    // Return the local list first, and later update it
    return localNotes().then(function(cannedNotes) {
        var payload = JSON.stringify({ "items" : cannedNotes });
        return new Response(payload, {
            "status": 200,
            "headers": { 'Content-Type': 'application/json' }
        });
    });
});

// Uuh - we shouldn't use the toolbox here but do our own cache lookup
// in localforage.
self.toolbox.router.post("/notes/:id", function(request, values,options) {
    console.log("(sw) save note called");
    //var payload = JSON.stringify(cannedNotes);
    
    // Store locally as object
    // What about attachments like images?!
    // What about partial uploads?! Or do we only do these here, not
    // in the client?!
    request.json().then( function(item) {
        console.log("(sw) Storing " + item.id);
        localforage.setItem(item.id, item).then(function( item ) {
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
        urlTemplate("/notes/:id", item),
    {
        method: "POST",
        body: JSON.stringify(item),
        credentials: "include"
    }))
};

// Automatically store all notes we download in the cache
// Even incomplete items, so we know what to fetch later
self.toolbox.router.default = function(request, values,options) {
    console.log("(sw) Default fetch called");
    return fetch(request);
};

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
          // ...
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

/*
self.addEventListener('message', function(event) {
    console.log("sw command: " + event.data.command );
    if( event.data.command == 'notes' ) {
        return Promise.resolve(cannedNotes);
    }
});
*/

//console.log("sw loaded );

/*
self.addEventListener('fetch', function(event) {  
    // Respond to the document with what is returned from 
    event.respondWith(
        // 1. Check the cache if a file matching that request is available
        caches.match(event.request).then( function(response) {
            // 2. If it is, respond to the document with the file from the cache        
            if ( response ) {
                return response;
            };

            // 3. If it isn’t, fetch the file from the network and respond to the document with the fetched file
            return fetch(event.request);

        })
    );
});
*/
