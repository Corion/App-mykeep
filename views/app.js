// "use strict";
var myApp = angular.module('myApp', ['wu.masonry'])
.directive('contenteditable', function() {
      return {
        require: 'ngModel',
        link: function( $scope,el,attrs, ctrl ) {
          el.bind('blur',function(){
            // save to model
            $scope.$apply(function(){
              ctrl.$setViewValue(el.html())
              // mark dirty
              // hope for sync
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
  });

myApp.controller('TodoCtrl', function ($scope) {
  $scope.todos = [
    {text:'learn angular', bgcolor: "red", done:true, title: "(no title)"},
    {text:'build an angular app', bgcolor: "gray", done:false, title: "(no title)"}
  ];

  $scope.addTodo = function() {
    $scope.todos.push({text:$scope.todoText, done:false});
    $scope.todoText = '';
  };

  $scope.saveItem = function() {
    alert("Saving " + $scope.text);
    $scope.todos.push({text: $scope.text, done:false});
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
});
