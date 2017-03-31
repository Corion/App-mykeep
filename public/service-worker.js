// Import the Service Worker Toolbox file
importScripts('javascripts/sw-toolbox.js');

const precacheFiles = [  
    './',
    './index.html',
    './js/app.js',
    './css/reset.css',
    './css/style.css'
];

// Precache the files
toolbox.precache(precacheFiles)  