use Test::More tests => 5;
use strict;
use warnings;
use Data::Dumper;
use JSON 'decode_json';

# the order is important
use App::mykeep;
use Dancer::Test;

my $route = '/notes/public/list';

route_exists [GET => $route], 'we have a public note list by default';
my $res = dancer_response GET => $route;
response_status_is $res, 200, "GET $route is found";
like $res->headers('Content-Type'), qr/\bjson\b/, "We get something JSONy back";

my $items = decode_json( $res->content );

ok exists $items->{items}, "We find a list of items";
cmp_ok 0+@{ $items->{items} },'>',0, "We have some public items"
    or diag Dumper $items;
