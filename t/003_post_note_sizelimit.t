#!perl -w
use Test::More tests => 3;
use strict;
use warnings;
use Data::Dumper;
use File::Temp 'tempdir';

# the order is important
use App::mykeep;
use Dancer::Test;

Dancer::config->{mykeep}->{notes_dir} = tempdir();

route_exists [POST => '/notes/public/mynote'], 'a route handler is defined for /notes/:account/:note';

my $r = dancer_response('POST' => '/notes/public/mynote', {
    body => " " x 2_000_000,
});
is $r->status, 414, 'We check and enforce the upload size for POST requests to notes'
    or diag Dumper read_logs;

$r = dancer_response('POST' => '/notes/public/mynote', {
    body => '{"id":1}',
});
is $r->status, 200, 'Small requests still pass'
    or diag Dumper read_logs;
