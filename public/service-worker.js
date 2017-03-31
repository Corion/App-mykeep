// https://bitsofco.de/bitsofcode-pwa-part-1-offline-first-with-service-worker/
// Import the Service Worker Toolbox file
'use strict';
importScripts('javascripts/sw-toolbox.js');

const precacheFiles = [  
    './',
    './index.html',
    './javascripts/jquery-3.1.1.min.js',
    './javascripts/handlebars-v4.0.5.js',
    './javascripts/app.js'
];

// Precache the files
toolbox.precache(precacheFiles);

var cannedNotes = {notes:[
{"id":1,"title":"Test title","bgcolor":"#FFE040","modifiedAt":0,"text":"Test text (sw)"},
{"id":2,"title":"Test title 2","bgcolor":"#FFE040","modifiedAt":0,"text":"Test text 3 (sw)"}
]};

toolbox.router.get("/notes/list", function(request, values,options) {
    //return Promise.resolve(cannedNotes);
    return new Response(JSON.encode(cannedNoted), {
        headers: { 'Content-Type': 'application/json' }
    });
}, {});

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