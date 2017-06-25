#!perl -w
use Test::More tests => 2;
use strict;
use warnings;
use Data::Dumper;
use File::Temp 'tempdir';

# the order is important
use App::mykeep;
use Dancer::Test;

Dancer::config()->{mykeep}->{notes_dir} = tempdir();

route_exists [POST => '/notes/settings.json'], 'a route handler is defined for /notes/settings.json';

my $r = dancer_response('GET' => '/notes/public/settings.json', {});
is $r->status, 200, 'We can retrieve public settings'
    or diag Dumper read_logs;
