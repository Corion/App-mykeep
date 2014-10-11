"use strict";
var myApp = angular.module('myApp', ['LocalForageModule','wu.masonry','angularUUID2'])
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

myApp.controller('TodoCtrl', ['$scope','$localForage','uuid2',
                     function ($scope,  $localForage,  uuid2) {
  // Load all items
  /*
  $scope.todos = [
    {text:'learn angular', bgcolor: "red", done:true, title: "(no title)"},
    {text:'build an angular app', bgcolor: "gray", done:false, title: "(no title)"}
  ];
  */
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
    item.modifiedAt= (new Date).getTime() / 1000;
    $scope.pending.push($localForage.setItem(item.id, item).then(function(){
      //alert("Stored id (title)" + item.title;
    }));
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
    // Fake an id
    var item= {
        text:$scope.todoText
      , title: ""
      , done:false
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
