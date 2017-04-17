"use strict";

/*

API:

  GET /notes/list
      [{ id, modifiedAt }, ...  ]

  POST /notes/{uuid}
  Store/merge note {uuid}, redirect to GET

  GET /notes/{uuid}
  Return current (server)state of {uuid}
  Should have+respect If-Newer-Than headers!

  That's all

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
    html = html.replace(/^\s+/,'');
    //console.log(html);
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

// https://gist.github.com/anantn/1852070
function UIcaptureImageDialog(element) {
    // Display the "capture" dialog:
    var tmplCaptureImage = templates['tmplCaptureImage'];
    var dialog = tmplCaptureImage();
    $(dialog).appendTo($(element)); // Well, that one better exist
    
    /*
    var front = false;
    document.getElementById('flip-button').onclick = function() { front = !front; };

    var constraints = { video: { facingMode: (front? "user" : "environment") } }
    */

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

// Serialize all item fetching over one connection, just to be nicer to low
// bandwidth connections instead of bulk-fetching over multiple connections
function requestQueue($q,$http) {
  var queue=[];
  var execNext = function() {
    var task = queue[0];
    $http(task.c).then(function(data) {
      queue.shift();
      task.d.resolve(data);
      if (queue.length>0) execNext();
    }, function(err) {
      queue.shift();
      task.d.reject(err);
      if (queue.length>0) execNext();
    })
    ;
  };
  return function(config) {
    var d = $q.defer();
    queue.push({c:config,d:d});
    if (queue.length===1) execNext();
    return d.promise;
  };
};

// Hacky url template implementation
// Lacks for example %-escaping
function urlTemplate( tmpl, vars ) {
  return tmpl.replace(/:(\w+)/, function(m,name){ return vars[name] || ":"+name }, 'y')
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

function UIlistItems() {
    console.log("Fetching './notes/list' via jQuery");
    Promise.resolve($.get('./notes/list', null)).then(function(json) {
        console.log(json);
        json['notes'] = json['items'];
        notes = defaultOrder( json['notes']);
        repaintItems({ "notes": notes });
    }, function(r1,r2) {
        console.log([r1,r2]);
    })
}

function UIaddItem() {
    var entry = $('#newNoteBody');
    var item= {
        text: entry.val()
      , title: ""
      , pinPosition: 0
      , done:false
      , modifiedAt: undefined
      , lastSyncedAt: undefined
      , archivedAt: undefined
      , status: "active"
      , "id": Math.uuid()
      , "displayStyle" : "display"
    };
    saveItem(item).then(function(item) {
        // ...
    });
    // New items go to top
    notes.unshift(item);
    entry.val('');
    repaintItems({"notes": notes});
};

function saveItem(item) {
    // We should only set the timestamp if we actually changed somethig...
    item.modifiedAt= Math.floor((new Date).getTime() / 1000);
    var target = urlTemplate( "./notes/:id", item );
    //console.log("page: POST to ",target, item);

    // We unconditionally overwrite here and hope that the server will resolve
    // any conflicts, later
    return Promise.resolve($.ajax({
            "type":"POST"
          , "url":target
          , "data":JSON.stringify(item)
          , "contentType": "application/json"
          , "processData":false
    }));
};

function deleteItem(item) {
    notes = notes.filter(function(el) {
        return el.id != item.id
    });

    var target = urlTemplate( "./notes/:id/delete", item );
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
    }));
}
