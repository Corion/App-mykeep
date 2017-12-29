"use strict";

/*

Consider moving to SW Workbox

https://developers.google.com/web/tools/workbox/

It's the new hot shit, but needs Node.js and a lot of manual configuration
before you can even start. Also, it is 3x the size of sw-toolbox.

*/

/*

API:

  GET /notes/list
      [{ id, modifiedAt }, ...  ]

  POST /notes/:user/{uuid}
  Store/merge note {uuid}, redirect to GET

  GET /notes/:user/{uuid}
  Return current (server)state of {uuid}
  Should have+respect If-Newer-Than headers!

  That's all

  In the future, keep a websocket open for Desktops and poll every five minutes
  (or whenever) for changes on mobile.

*/

var schemaVersion = '001.000.000';

// Load our service worker
if (navigator.serviceWorker) {
    console.log("ServiceWorkers are supported");

    navigator.serviceWorker.register('./service-worker.js', {
            scope: '.'
        })
        .then(function(reg) {
            console.log("ServiceWorker registered", reg);
            //sendMessage('notes').then(function(e){repaintItems(e)});
        })
        .catch(function(error) {
            console.log("Failed to register ServiceWorker", error);
        });

    // Refresh the list of items whenever our service worker tells us to:
    navigator.serviceWorker.addEventListener('message', function(event){
        console.log("UI Client received message: ", event.data);
        notes = event.data.notes;
        repaintItems(event.data);
        event.ports[0].postMessage("Thank you!");
    });

    navigator.serviceWorker.ready.then(function() {
        // Fetch whatever data we have
        UIlistItems();
    });

} else {
    console.log("Whoops, ServiceWorkers are not supported");
    // "manually" fetch whatever data we have
    UIlistItems();
};

// Should we keep notes[] or have it all in localforage instead?!
// XXX: Also resolve repaintItems({"notes":notes}) vs. notes=[]
var notes = [];
var currentFilter = {};

// We want to use logic operators, sometimes...
Handlebars.registerHelper('ifCond', function (v1, operator, v2, options) {
 switch (operator) {
        case '==':
            return (v1 == v2) ? options.fn(this) : options.inverse(this);
        case '===':
            return (v1 === v2) ? options.fn(this) : options.inverse(this);
        case '!=':
            return (v1 != v2) ? options.fn(this) : options.inverse(this);
        case '!==':
            return (v1 !== v2) ? options.fn(this) : options.inverse(this);
        case '<':
            return (v1 < v2) ? options.fn(this) : options.inverse(this);
        case '<=':
            return (v1 <= v2) ? options.fn(this) : options.inverse(this);
        case '>':
            return (v1 > v2) ? options.fn(this) : options.inverse(this);
        case '>=':
            return (v1 >= v2) ? options.fn(this) : options.inverse(this);
        case '&&':
            return (v1 && v2) ? options.fn(this) : options.inverse(this);
        case '||':
            return (v1 || v2) ? options.fn(this) : options.inverse(this);
        default:
            return options.inverse(this);
    }
});

function defaultOrder(items) {
    items.sort(function(a,b) {
        return    b["pinPosition"]-a["pinPosition"]
               || b["modifiedAt"]-a["modifiedAt"]
               || b["createdAt"] -a["createdAt"]
    });
    return items
};

var settings = { "credentials" : { "user": "public" }};
var serverVersion;

// Returns a Promise which resolves to the persistence state of storage
function storagePersists() {
    if (navigator.storage && navigator.storage.persist) {
        navigator.storage.persisted().then( function( persistent ) {
            return persistent
        });
    } else {
        // Assume the worst
        return Promise.resolve(false)
    }
}

function loadSettings() {
    return Promise.resolve($.ajax({
            "type":"GET"
          , "url":"./settings.json"
          , "contentType": "application/json"
          , "processData":false
    })).catch(function(e){
        console.log("Uhoh",e);
    });
}

function loadServerVersion() {
    return Promise.resolve($.ajax({
            "type":"GET"
          , "url":"./version.json"
          , "contentType": "application/json"
          , "processData":false
    })).catch(function(err) {
        console.log("loadServerVersion:",err)
    });
}

function saveSettings(newSettings) {
    // Save the settings locally
    return Promise.resolve($.ajax({
            "type":"POST"
          , "url":"./settings.json"
          , "data":JSON.stringify(newSettings)
          , "contentType": "application/json"
          , "processData":false
    })).catch(function(err) {
        console.log("saveSettings:",err)
    });
}

// Settings.html
function UIsaveSettingsAndReturn() {
    // Only save them if they changed?!
    saveSettings(settings).then(function() {
        UIdisplayItems();
    }).catch(function(e) {
        console.log(e);
    });
}

/*
loadSettings().then(function(s) {
    if( ! typeof( settings ) === 'object' ) {
        console.log("Weird settings problem");
        console.log(settings);
        settings = { user: "public" }
    } else {
        settings = s;
    }
}).catch(function(e) {
    console.log(e);
});
*/

function UIcontainer(element) {
    return $(element).closest(".note");
}

function UIdeleteItem(element,event) {
    var item = htmlToModel(UIcontainer(element));
    if( event ) {
        event.stopPropagation();
    };
    console.log("deleting",item);
    deleteItem(item);
    repaintItems({"notes":notes});
}

function UItogglePinItem(element,event) {
    var item = htmlToModel(UIcontainer(element));
    if( event ) {
        event.stopPropagation();
    };

    if( item.pinPosition > 0 ) {
        item.pinPosition = 0;
    } else {
        var maxPin = 1;
        for( var i = 0; i < notes.length; i++ ) {
            maxPin = notes[i].pinPosition > maxPin ? notes[i].pinPosition : maxPin;
        };
        item.pinPosition = maxPin;
    };
    notes = defaultOrder(items);
    saveItem(item);
    repaintItems({"notes":notes});
}

function morph(DOM,html,options) {
    // Clean up the HTML so that morphdom understands what we want it to do
    html = html.replace(/^\s+/,'');
    html = html.replace(/^<!--.*?-->\s*/m,'');
    // console.log(html);
    morphdom(DOM, html, options);
}

function UIeditItem(element) {
    var container = UIcontainer(element);
    var item = htmlToModel(container);
    item.displayStyle = "edit";
    item.edit = true;
    var editNode = container.clone();

    var tmplEditItem = templates['tmplEditItem'];
    editNode.attr('id', 'edit-container');
    //var editNode = $('#edit-container');
    // Place our edit-copy directly over of the original element so the morph
    // looks as if our elements floats to the middle
    editNode.css({
        "position" : "absolute",
        "left" : container.position().left,
        "top"  : container.position().top,
        "width" : container.position().width,
        "height"  : container.position().height,
    });
    editNode.appendTo(container.parent()); // just to give it a place

    // Hide the original, so we don't rearrange all the notes
    container.css('opacity', 0);

    // Display the edit note
    $(document).keyup(function(e) {
      //if (e.keyCode === 13) $('.done', newContainer).click();     // enter
      if (e.keyCode === 27) $('#edit-container .btn-cancel').click();   // esc
    });
    $("#modal-overlay").removeClass("closed");
    $("#modal-overlay").click(function() {
        UIeditDone(container[0], undefined, true);
    });
    var newContainer = morph(editNode[0], tmplEditItem(item), {childrenOnly: false});
}

function UItoggleCamera(element) {
    settings.useFrontCamera = !settings.useFrontCamera;
}

// https://gist.github.com/anantn/1852070
function UIcaptureImageDialog(element) {
    // Display the "capture" dialog:
    var container = UIcontainer(element);
    var tmplCaptureImage = templates['tmplCaptureImage'];
    var dialog = tmplCaptureImage();
    $(dialog).appendTo($(".note-text",container)); // Well, that one better exist

    var front = settings.useFrontCamera;

    var constraints = { video: { facingMode: (front? "user" : "environment") } }

   // use MediaDevices API
    // docs: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
    // https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Taking_still_photos
    // XXX Implement the above instead of hardcoding
    if (navigator.mediaDevices) {
        // access the web cam
        navigator.mediaDevices.getUserMedia({"video": true})
        // permission granted:
        .then(function(stream) {
            var video = $("#cameraCapture");
            var v = video[0];
            v.srcObject = stream;
            $(v).click(UIcaptureImage);
        })
        // permission denied:
        .catch(function(error) {
            alert('Could not access the camera. Error: ' + error.name + ' ' + error.message);
        });
    }
};

function UIcaptureImage(event) {
    var context;
    var videoElement = event.target;

    /*
    var width = videoElement.offsetWidth
      , height = videoElement.offsetHeight;
      */
    var width = videoElement.videoWidth
      , height = videoElement.videoHeight;

    var img = $('<img>');
    $("#edit-container .note-text").append(img);
    var canvas = $('<canvas>');
    canvas.width(width);
    canvas.height(height);

    context = canvas[0].getContext('2d');
    context.drawImage(videoElement, 0, 0, width, height);
    img.attr('src', canvas[0].toDataURL('image/png'));
    //img.width(width);
    //img.height(height);
    $(videoElement).remove();

    if( event ) {
        event.stopPropagation();
    };
}

function UIeditDone(element,event,doSave) {
    var container = UIcontainer(element);
    var item = htmlToModel(container);
    item.displayStyle = "display";
    delete item.edit;
    if( doSave ) {
        // Save new version
        saveItem(item);
    } else {
        // Restore old version
        item = itemById( item.id );
        item.displayStyle = "display";
        delete item.edit;
    };

    // This is likely a little bit far-reaching, as we nuke all custom
    // keyboard shortcuts
    $(document).unbind('keyup');

    // Remove the edit container again
    var editNode = $('#edit-container');
    editNode.remove();
    // var newContainer = morph(editNode[0], '<div id="edit-container"></div>', {childrenOnly: false});

    // And recreate the display version
    var tmplItem = templates['tmplItem'];
    morph($('#note-'+item.id)[0], tmplItem(item), {childrenOnly: false});

    if( event ) {
        event.stopPropagation();
    };

    $("#modal-overlay").addClass("closed");
    console.log("edit done");
    return false;
}


function htmlToModel(element) {
    // fetch all items from the HTML and return as object
    var container = UIcontainer(element);
    var new_item = {
        "id" : $('*[name="id"]', container).val(),
        "title" : $('h2', container).text(),
        "text" : $('div.note-text', container).html(),
        "labels" : [],
        // bgColor
        // pinned
        // ...
        "schemaVersion" : schemaVersion // we'll force-upgrade it here
    };
    console.log("Update from HTML", new_item);
    return new_item;
};

function itemById(id) {
    var res = notes.filter(function(el) { return el.id == id });
    return res[0]
}

function updateModel(element) {
    var newItem = htmlToModel(element);
    var oldItem = itemById(newItem.id);
    if( oldItem ) {
        var dirty;
        for( var k in newItem ) {
            if( oldItem[k] != newItem[k] ) {
                oldItem[k] = newItem[k];
                dirty = 1;
            };
        };
        if( dirty ) {
            repaintItems({"notes":notes});
            saveItem(oldItem).then(function(){
                // ...
            });
        };
    } else {
        UIaddItem(newItem);
    };
}

// Hacky url template implementation
// Lacks for example %-escaping
function urlTemplate( tmpl, vars ) {
  return tmpl.replace(/:(\w+)/g, function(m,name) {
    return vars[name]
        || settings["credentials"][name]
        || ":"+name
  }, 'y')
};

function elementFromItem(item) {
    return $("#note-"+item.id)
}

function repaintItems(items) {
    // console.log(items);

    // Filter the items:
    items.notes = items.notes.filter(function(i) {
        // Also modify by upgrading the schema...
        if( ! i.displayStyle ) {
            i.displayStyle = "display";
        };
        return i.status == 'active'
    });

    // $('#items').html(tmplItems(items));
    var DOM = $('#items')[0];

    morph(DOM, tmplItems(items), {childrenOnly:true});
    //morphdom(DOM, '<div id="items"><div class="note">a</div><div class="note">b</div></div>', {childrenOnly:true});
    DOM = $('#items')[0];
};

function listItems() {
    var url = urlTemplate("./notes/:user/list", {});
    console.log("Fetching '"+url+"' via jQuery");
    return Promise.resolve($.get(url,null)).then(function(json) {
            console.log("Fetched from " + url, json);
            try {
                if( typeof( json ) === 'string' ) {
                    if( !notes ) {
                            notes = [];
                    }
                } else {
                    json['notes'] = json['items'];
                    notes = defaultOrder( json['notes']);
                };
            } catch(err) {
                console.log("Caught",err);
            }
    }).catch(function(r1,r2) {
        console.log("jQuery error",[r1,r2]);
    });
};

var p;
function UIlistItems() {
    p = listItems().then(function(json) {
        repaintItems({ "notes": notes });
    }, function(err) { console.log("Caught UIlistItems",err)})
}

var s;
function addItem(item) {
    // XXX Should we save this promise here somewhere?!
    s = saveItem(item).then(function(item) {
        // ...
        // console.log("Item saved");
    });
    // New items go to top, immediately
    notes.unshift(item);
}

function UIaddItem() {
    var entry = $('#newNoteBody');
    var id = Math.uuid().toUpperCase();
    var item = {
        text: entry.val()
      , title: ""
      , labels: []
      , pinPosition: 0
      , done:false
      , modifiedAt: undefined
      , lastSyncedAt: undefined
      , archivedAt: undefined
      , status: "active"
      , "id": id
      , "displayStyle" : "display"
    };
    addItem(item);
    entry.val('');
    repaintItems({"notes": notes});
};

function saveItem(item) {
    // We should only set the timestamp if we actually changed somethig...
    item.modifiedAt= Math.floor((new Date).getTime() / 1000);
    var target = urlTemplate( "./notes/:user/:id", item );

    // We unconditionally overwrite here and hope that the server will resolve
    // any conflicts, later
    console.log("saving to " + target, item);
    return Promise.resolve($.ajax({
            "type":"POST"
          , "url":target
          , "data":JSON.stringify(item)
          , "contentType": "application/json"
          , "processData":false
    })).catch(function(err) {
        // console.log("Caught error while saving, offline?", err);
    });
};

function deleteItem(item) {
    notes = notes.filter(function(el) {
        return el.id != item.id
    });

    var target = urlTemplate( "./notes/:user/:id/delete", item );
    // We unconditionally overwrite here and hope that the server will resolve
    // any conflicts, later
    delete item['text'];
    delete item['title'];
    item["status"] = 'deleted';
    return Promise.resolve($.ajax({
            "type":"POST"
          , "url":target
          , "data":JSON.stringify(item)
          , "contentType": "application/json"
          , "processData":false
    })).catch(function(err) {
        console.log("deleteItem:",err)
    });
}

function UIswitchPage(url, parameters) {
    var selector = '#container';
    // Switch to the search page
    var currentPage = $(selector);

    // But only if we are not already on it. Otherwise, just restore that
    // page from its template (or whatnot)

    var nextPage = Promise.resolve($.get(url), parameters).then(function(html) {
        // Unless I wrap this in another level, jQuery won't find #container?!
        var payload = $("<div>"+html+"</div>").find(selector);
        if( payload.length == 0 ) {
            console.log("Selector " + selector + " was not found in " + url);
        } else {
            morph(currentPage[0],payload[0].outerHTML,{childrenOnly: false});
        };
        // Push the URL onto the browser history
        // Call whatever initialization JS there is on the page
        // Or maybe there shouldn't be any!
    }).catch(function(err) {
        console.log("UIswitchPage:",err)
    });
    return nextPage
}

function UIsearchPage(element, options) {
    if( ! options ) {
        options = []
    };

    return UIswitchPage('./search.html').then(function() {
        // Fetch the current notes if we don't have any yet...
        // Initialize the search filter if we have an existing filter already
        UIpaintFilteredItems();
        $("#search").focus();
    });
}

function UIpaintFilteredItems() {
    var filtered = applyFilter(notes, currentFilter);
    repaintItems({"notes":filtered});
}

function UIdisplayPage(element) {
    currentFilter = {};
    return UIswitchPage('./index.html').then(function() {
        repaintItems({"notes":notes});
    });
}

function UIsettingsPage(element) {
    return loadServerVersion().then( function() {
        return UIswitchPage('./settings.html')
    }).then(function() {
        // Manually render our settings template here:
        var DOM = $('#items')[0];

        morph(DOM, tmplSettings({
            "server" : serverVersion,
            "client" : settings
        }), {childrenOnly:true});
    });
}

// This uses a regular expression because .toLower and .toUpper don't
// properly fold international characters for comparison
function foldCaseContained(haystack,needles) {
    var matched = 0;
    needles.forEach(function(v,i) {
        var needle = v;
        var quotemeta = needle.replace(/[-[\]{}()*+?.,\\^$|#]/g, "\\$&");
        var re = new RegExp(quotemeta,"i");
        if( re.test(haystack)) {
            matched++
        };
    });
    return matched == needles.length;
}

var criteriaMatch = {
    "status"     : function(i,v) { return i.status == v },
    "background" : function(i,v) { return i.background == v },
    "label"      : function(i,v) { return i.labels && i.labels.filter(function(i) { return foldCaseContained(i,v) }).length > 0 },
    "text"       : function(i,v) {
        var parts = v.split(/\s+/);
        return    v.length <= 2                // Only search with length >= 3
               || foldCaseContained(i.text + " " + i.title,parts)  // Text
               || criteriaMatch['label'](i,v)                      // Label
               ;
        },
};

// We should split the user text on whitespace as they likely want to search
// for multiple words not necessarily in that order
function applyFilter(notes,filter) {
    var items = notes;
    console.log(filter);
    if( ! filter ) {
        filter = { "status": "active" };
    };
    if( ! filter["status"] ) {
        filter["status"] = "active";
    };
    var key;
    for( key in filter ) {
        // Might use a real polyfill here, but what the hey ;)
        // https://developer.mozilla.org/de/docs/Web/JavaScript/Reference/Global_Objects/Object/keys
        if( ! filter.hasOwnProperty(key)) {
            next;
        };
        items = items.filter(function(i) {
            var value = filter[key];
            // console.log("Filtering on", el);
            if( ! criteriaMatch[key]) {
                console.log("Unknown match criteria", key);
            };
            var res = criteriaMatch[key](i,value);
            // console.log(i,key,res);
            return res;
        });
    };
    return items
}

function describeFilter(notes,filter) {
    var crit;
    var description = [];
    filter.forEach( function(i,el) {
        var desc = el.description || el.value;
        description.push( desc );
    });
    return description.join(", ")
}

function UIfilterLabel(element,event) {
    var label = $(element).text();
     if( event ) {
        event.stopPropagation();
    };

    // Reset the filter
    currentFilter = { "label" : label };
    UIpaintFilteredItems();
}

function UIfilterText(element,event) {
    var text = $(element).val();
     if( event ) {
        event.stopPropagation();
    };
    // Reallly push? Why not just have a set of filters that we edit?!
    currentFilter["text"] = text;
    UIpaintFilteredItems();
    // return UIsearchPage( element );
}