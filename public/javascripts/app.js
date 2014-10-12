"use strict";

/*

API:

  GET /notes/list
      [{ id, lastModifiedAt }, ...  ]

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
  
  $scope.saveItem= function(item) {
    // We should only set the timestamp if we actually changed somethig...
    item.modifiedAt= (new Date).getTime() / 1000;
    $scope.pending.push($localForage.setItem(item.id, item).then(function(){
      //alert("Stored id (title)" + item.title;
    }));
  };

  $scope.syncItem= function(item) {
    var url= urlTemplate("/notes/{id}",item);
    if( !item.lastSyncedAt || item.lastSyncedAt < item.lastModifiedAt ) {
      // Send our new version to the server
      // Maybe this should be a PUT request. Later.
      $http.post(
        url,
        item,
        {}
      ).then(function(response) {
        alert("Saved new ("+response.status+")");
      }).else(function(response){
        alert("Uhoh: "+response.status);
      });
      alert("Posed to " + url);
    } else {
      // Check if it is a newer version on the server
      alert("get from "+url);
      $http.get(
        url,
        { headers: { 'If-Modified-Since' : item.lastSyncedAt } }
      ).then(function(response) {
        alert(response.status);
        item= response.body; // Ah, well...
      });
    };
  };

  $scope.archiveItem= function(item) {
    item.archivedAt= (new Date).getTime() / 1000;
    $scope.saveItem( item );
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
