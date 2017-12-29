#!perl -w
use Test::More tests => 2;
use strict;
use warnings;
use Data::Dumper;
use File::Temp 'tempdir';

use WWW::Mechanize::Chrome;
use Log::Log4perl qw(:easy);
Log::Log4perl->easy_init($ERROR);

use App::mykeep; # just to see that it compiles and launches

use lib './t';
use helper;

my $port = 5099;
my $server = helper::spawn_app( $port );

# Actually, maybe just use fork so we can configure this in the same file
# as we do later
Dancer::config()->{mykeep}->{notes_dir} = tempdir();

my $mech = helper::spawn_chrome(
);

my $url = "http://localhost:$port/";
my $res = $mech->get( $url );
ok $res->is_success, "We can retrieve $url";

$mech->sleep(5);

my @errors = $mech->js_errors;
@errors = grep { $_->{type} ne 'log' } @errors;
is 0+@errors, 0, "No JS errors"
    or diag Dumper \@errors;
undef $mech;
undef $server;
done_testing;
