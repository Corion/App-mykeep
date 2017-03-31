// https://bitsofco.de/bitsofcode-pwa-part-1-offline-first-with-service-worker/
// Import the Service Worker Toolbox file
WorkerGlobalScope.importScripts('javascripts/sw-toolbox.js');

const precacheFiles = [  
    './',
    './index.html',
    './js/app.js',
    './css/reset.css',
    './css/style.css'
];

// Precache the files
toolbox.precache(precacheFiles);

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

if (navigator.serviceWorker) {
    console.log("ServiceWorkers are supported");

    navigator.serviceWorker.register('sw.js', {
            scope: './'
        })
        .then(function(reg) {
            console.log("ServiceWorker registered", reg);
        })
        .catch(function(error) {
            console.log("Failed to register ServiceWorker", error);
        });
} else {
    console.log("Whoops, ServiceWorkers are not supported");
};