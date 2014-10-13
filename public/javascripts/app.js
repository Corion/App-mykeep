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

var myApp = angular.module('myApp', [
    'LocalForageModule'
   ,'wu.masonry'
   ,'angularUUID2'
   ])
.directive('contenteditable', function() {
      return {
        require: 'ngModel',
        link: function( $scope,el,attrs,ctrl ) {
          el.bind('blur',function(){
            // save to model
            $scope.$apply(function(){
              ctrl.$setViewValue(el.html());
              // Store in localForage
              // mark dirty
              // hope for sync with remote side
            });
          });
          ctrl.$render= function() {
            // load from model
            el.html(ctrl.$viewValue);
          };
          
          // initialize
          //ctrl.$setViewValue(el.html());
        },
      };
  })

// Serialize all item fetching over one connection, just to be nicer to low
// bandwidth connections instead of bulk-fetching over multiple connections
.factory('requestQueue', function($q,$http) {
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
})

// Configure the local storage
.config(['$localForageProvider', function($localForageProvider){
    $localForageProvider.config({
        name: 'myApp',
        storeName: 'items'
    });
}]);

// Hacky url template implementation
// Lacks for example %-escaping
function urlTemplate( tmpl, vars ) {
  return tmpl.replace(/{(\w+)}/, function(m,name){ return vars[name] || "{"+name+"}" }, 'y')
};

myApp.controller('TodoCtrl', ['$scope','$localForage','uuid2', '$http',
                     function ($scope,  $localForage,  uuid2,   $http) {
  // Load all items
  $scope.todos= [];
  $scope.pending= [];
  /*
  $localForage.getItem("config-order").then(function(order){
    $scope.order= order;
  });
  */
   
  var d= $localForage.driver();
  $localForage.getKeys(d).then(function(keys){
    for( var k=0; k < keys.length; k++ ) {
      $localForage.getItem( keys[k] ).then(function(item){
        if( undefined == item.archivedAt ) {
          $scope.todos.push(item);
        };
      });
    };
  }).then(function(){
    $scope.sortItems();
  });
  
  $scope.visibleItems= function() {
    var result= [];
    angular.forEach($scope.todos, function(todo) {
      if (undefined == todo.archivedAt) {
        result.push(todo);
      };
    });
    return result
  };
  
  $scope.storeItem= function(item) {
    $scope.pending.push($localForage.setItem(item.id, item).then(function(){
      //alert("Stored id (title)" + item.title;
    }));
  };
  $scope.saveItem= function(item) {
    // We should only set the timestamp if we actually changed somethig...
    item.modifiedAt= (new Date).getTime() / 1000;
    $scope.storeItem(item);
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
        // alert(response.status);
        //alert(response.data.items);
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
              $scope.syncItem(local);
            };
          } else {
            // A new item
            // Add a dummy, check if we need to resync
            $scope.todos.unshift(i);
            $scope.storeItem(i);
            $scope.syncItem(i);
          };
        });
      }).else(function(response) {
        alert("uhoh " + response.status )
      });
      $scope.pending.push(f);
  };

  $scope.syncItem= function(item) {
    var url= urlTemplate("/notes/{id}",item);
    if( !item.lastSyncedAt || item.lastSyncedAt < item.modifiedAt ) {
      alert(item.lastSyncedAt);
      alert(item.modifiedAt);
      // Send our new version to the server
      // Maybe this should be a PUT request. Later.
      $http({
        url: url,
        data: item,
        method: 'POST',
        headers: {}
      }).then(function(response) {
        alert("Saved new ("+response.status+")");
        // We should use the server time here...
        // item.lastSyncedAt= (new Date).getTime() / 1000;
        // alert(response.data);
        item= response.data;
        $scope.storeItem(item);
      }).else(function(response){
        alert("Uhoh: "+response.status);
      });
      //alert("Posted to " + url);
    } else {
      // Check if it is a newer version on the server
      alert("get from "+url);
      $http({
        url: url,
        method: 'GET',
        headers: { 'If-Modified-Since' : item.lastSyncedAt }
      }).then(function(response) {
        alert(response.status);
        item= response.data; // Ah, well...
      }).else(function(response){
        alert("uhoh " + response.status );
      });
    };
  };

  $scope.archiveItem= function(item) {
    item.archivedAt= (new Date).getTime() / 1000;
    $scope.storeItem( item );
    // Trigger display update
    $scope.todos= $scope.visibleItems();
  };
  
  $scope.sortItems= function() {
    $scope.todos.sort(function(a,b){
      if( a.modifiedAt < b.modifiedAt ) {
        return -1
      } else if(a.modifiedAt > b.modifiedAt) {
        return +1
      } else {
        return 0
      };
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

  $scope.remaining = function() {
    var count = 0;
    angular.forEach($scope.todos, function(todo) {
      count += todo.done ? 0 : 1;
    });
    return count;
  };

  $scope.archive = function() {
    var oldTodos = $scope.todos;
    $scope.todos = [];
    angular.forEach(oldTodos, function(todo) {
      if (!todo.done) $scope.todos.push(todo);
    });
  };
}]);
