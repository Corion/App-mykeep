use Test::More tests => 2;
use strict;
use warnings;

# the order is important
use App::mykeep;
use Dancer::Test;

route_exists [GET => '/'], 'a route handler is defined for /';
response_status_is ['GET' => '/'], 302, 'response status is 302 for /';
