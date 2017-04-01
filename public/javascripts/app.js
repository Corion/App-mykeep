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
} else {
    console.log("Whoops, ServiceWorkers are not supported");
};

// Should we keep notes[] or have it all in localforage instead?!
// XXX: Also resolve repaintItems({"notes":notes}) vs. notes=[]
var notes = [];

function htmlToModel(element) {
    // fetch all items from the HTML and return as object
    var container = $(element).parent();
    var new_item = {
        "id" : $('*[name="id"]', container).val(),
        "title" : $('h2', container).text(),
        "text" : $('div.note-text', container).html()
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
        };
    } else {
        addItem(newItem);
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
  return tmpl.replace(/{(\w+)}/, function(m,name){ return vars[name] || "{"+name+"}" }, 'y')
};

/*
  var d= localForage.driver();
  localForage.getKeys(d).then(function(keys){
    for( var k=0; k < keys.length; k++ ) {
      localForage.getItem( keys[k] ).then(function(item){
        if( undefined == item.archivedAt ) {
          scope.todos.push(item);
        };
      });
    };
  }).then(function(){
    scope.sortItems();
  });
  
  scope.visibleItems= function() {
    var result= [];
    angular.forEach($scope.todos, function(todo) {
      if (undefined == todo.archivedAt) {
        result.push(todo);
      };
    });
    return result
  };
  
  $scope.storeItem= function(item) {
    //$scope.pending.push($localForage.setItem(item.id, item).then(function(){
    $localForage.setItem(item.id, item).then(function(){
      //alert("Stored id (title)" + item.title;
    });
  };
  
  $scope.saveItem= function(item) {
    // We should only set the timestamp if we actually changed somethig...
    item.modifiedAt= Math.floor((new Date).getTime() / 1000);
    $scope.storeItem(item);
    //$scope.$apply();
  };

  $scope.needsSync= function(item) {
      if( item.syncIncomplete ) return 'syncIncomplete';
      if( !item.lastSyncedAt ) return 'new item';
      if( item.modifiedAt > item.lastSyncedAt ) return 'Modified';
      if( item.dirty ) return 'dirty';
      return undefined;
  };
  
  $scope.pendingSync= function() {
      var res= [];
      angular.forEach($scope.todos, function(item) {
          if($scope.needsSync(item)) {
              res.push( item )
          };
      });
      return res
  };
  
  $scope.syncItems= function() {
      var url= "/notes/list";
      // Check if it is a newer version on the server
      // Also, paging?!
      // Maybe we want a list of added/archived/changed
      // instead of sending the full current list?!
      var f= $http({
        url: url,
        method: 'GET',
        // { headers: {} }
      }).then(function(response) {
        var knownItems= {};
        angular.forEach($scope.todos, function(i) {
          knownItems[i.id]= i;
        });
        angular.forEach( response.data.items, function(i) {
          // Check if we know that item
          if( knownItems[i.id]) {
            // We know that item.
            var local= knownItems[i.id];
            // Update and check if we want to resync
            if(    local.modifiedAt != i.modifiedAt
                || local.archivedAt != i.archivedAt ) {
              local.dirty= 1;
            };
          } else {
            // A new item
            // Add a dummy, check if we need to resync
            //alert("New item " + i.id);
            i.syncIncomplete= 1; // Maybe i.origin= 'remote' instead?
            $scope.todos.unshift(i);
            $scope.storeItem(i);
          };
        });
        
        // Now queue (more) requests for all the items that need it
        angular.forEach( $scope.pendingSync(), function(i) {
            //alert("Queuing '" + i.title + "' for sync");
            try {
                $scope.syncItem(i);
            } catch (e) {
                alert( e.message );
            };
        });
      }, function(response) {
        alert("uhoh " + response.status )
      });
  };

  $scope.syncItem= function(item) {
    var url= urlTemplate("/notes/{id}",item);
    var res;
    if( !item.syncIncomplete
        && (!item.lastSyncedAt || item.lastSyncedAt < item.modifiedAt )) {
      //alert(item.lastSyncedAt);
      //alert(item.modifiedAt);
      // Send our new version to the server
      // Maybe this should be a PUT request. Later.
      res= requestQueue({
        url: url,
        data: item,
        method: 'POST',
        headers: {}
      }).then(function(response) {
        //alert("Saved new ("+response.status+")");
        // We should use the server time here...
        item= response.data;
        $scope.storeItem(item);
        $scope.sortItems();
      }, function(response){
        alert("Uhoh: "+response.status);
      });
      //alert("Posted to " + url);
    } else {
      // Check if it is a newer version on the server
      // Items that originate from the server never have .lastSyncedAt
      // set and thus will always download
      res= requestQueue({
        url: url,
        method: 'GET',
        headers: { 'If-Modified-Since' : item.lastSyncedAt }
      }).then(function(response) {
        //alert(response.status);
        angular.forEach(["title","text","bgcolor","modifiedAt","archivedAt"], function(key) {
            // Maybe we should filter title+text+bgcolor for Javascript...
            item[key]= response.data[key];
        });
        item.syncIncomplete= 0;
        item.dirty= 0;
        $scope.storeItem(item);
        $scope.sortItems();
      }, function(response){
        alert("uhoh " + response.status );
      });
    };
    return res
  };
  
  $scope.archiveItem= function(item) {
    item.archivedAt= Math.floor((new Date).getTime() / 1000);
    $scope.storeItem( item );
    // Trigger display update
    $scope.todos= $scope.visibleItems();
  };
  
  $scope.sortItems= function() {
    $scope.todos.sort(function(a,b){
        return    b.modifiedAt - a.modifiedAt
               || (  b.id < a.id ? -1
                   : b.id > a.id ?  1
                   : 0)
    });
  };

  $scope.addTodo = function() {
    var item= {
        text:$scope.todoText
      , title: ""
      , done:false
      , modifiedAt: undefined
      , lastSyncedAt: undefined
      , archivedAt: undefined
      , "id": uuid2.newuuid(),
    };
    $scope.saveItem(item);
    // New items go to top
    $scope.todos.unshift(item);
    $scope.todoText = '';
  };
*/

// XXX This should move to the DOM differ, later
function repaintItems(items) {
    // console.log(items);
    $('#items').html(tmplItems(items));
};

function listItems() {
    console.log("Fetching via jQuery");
    Promise.resolve($.get('/notes/list', null)).then(function(json) {
        console.log(json);
        json['notes'] = json['items'];
        notes = json['notes'];
        repaintItems({ "notes": notes });
    }, function(r1,r2) {
        console.log([r1,r2]);
    })
}

function addItem() {
    var entry = $('#toolbar input[type="text"]');
    var item= {
        text: entry.val()
      , title: ""
      , done:false
      , modifiedAt: undefined
      , lastSyncedAt: undefined
      , archivedAt: undefined
      , "id": Math.uuid(),
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
    var target = urlTemplate( "/notes/{id}", item );
    console.log(target, item);
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
