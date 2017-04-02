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
    return localforage.keys().then(function(keys){
        console.log(keys);
        var fullNotes = [];
        for( var k in keys ) {
            fullNotes.push( localforage.getItem(k) );
        };
        // Sort notes by last modified resp. newest created
        fullNotes.sort(function(a,b) { return    a["modifiedAt"]-b["modifiedAt"]
                                              || a["createdAt"] -b["createdAt"]});
        return Promise.all(fullNotes)
    });
}

// Consider storing as blobs, always, as we need to decode manually anyway

// Uuh - we shouldn't use the toolbox here but do our own cache lookup
// in localforage.
self.toolbox.router.get("/notes/list", function(request, values,options) {
    console.log("(sw) fetch notes list called");
    //var payload = JSON.stringify(cannedNotes);
    
    return localNotes().then(function(cannedNotes) {
        var payload = JSON.stringify(cannedNotes);
        console.log("(sw): local JSON notes" + payload );
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
        console.log(item.id);
        localforage.setItem(item.id, item).then(function( value ) {
            // stored, now trigger a sync event resp. mark for sync ...
        });
    });
    
    // Nothing to say here
    return new Response();
});


// Automatically store all notes we download in the cache
// Even incomplete items, so we know what to fetch later

self.toolbox.router.default = function(request, values,options) {
    console.log("(sw) Default fetch called");
    return fetch(request);
};

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