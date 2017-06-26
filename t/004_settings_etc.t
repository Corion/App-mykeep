#!perl -w
use Test::More tests => 4;
use strict;
use warnings;
use Data::Dumper;
use File::Temp 'tempdir';

# the order is important
use App::mykeep;
use Dancer::Test;

Dancer::config()->{mykeep}->{notes_dir} = tempdir();

route_exists [POST => '/settings.json'], 'a route handler is defined for /settings.json';

my $r = dancer_response('GET' => '/settings.json', {});
is $r->status, 200, 'We can retrieve public settings'
    or diag Dumper read_logs;

    
route_exists [GET => '/version.json'], 'a route handler is defined for /version.json';

$r = dancer_response('GET' => '/version.json', {});
is $r->status, 200, 'We can retrieve public settings'
    or diag Dumper read_logs;
