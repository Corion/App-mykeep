#!perl -w
use strict;
use Twiggy::Server;
use Dancer::Test;
use File::Temp 'tempdir';
use WWW::Mechanize::Chrome;
use Log::Log4perl qw(:easy);
use Data::Dumper;
use Test::More tests => 15;

Log::Log4perl->easy_init($ERROR);  # Set priority of root logger to ERROR
#Log::Log4perl->easy_init($TRACE);  # Set priority of root logger to ERROR

my $port = 5099;
my $server = Twiggy::Server->new(
    host => '127.0.0.1',
    port => $port,
);
$ENV{DANCER_APPHANDLER} = 'Dancer::Handler::PSGI';
my $handler = Dancer::Handler->get_handler();
Dancer::_load_app('App::mykeep');
my $app = $handler->psgi_app();
$server->register_service($app);

# Fudge the config as appropriate for our test
Dancer::config()->{mykeep}->{notes_dir} = tempdir(
    CLEANUP => 1,
);

my @cleanup_directories;
my $tempdir = tempdir( CLEANUP => 1 );

my $mech;
$mech = WWW::Mechanize::Chrome->new(
    launch_exe => 'C:\\Users\\Corion\\Projekte\\WWW-Mechanize-Chrome\\chrome-versions\\chrome-65.0.3301.0\\chrome.exe',
    data_directory => $tempdir,
    #headless => 1,
);

$mech->clear_js_errors();

my $console = $mech->add_listener('Runtime.consoleAPICalled', sub {
    diag join ", ",
        map { $_->{value} // $_->{description} }
        @{ $_[0]->{params}->{args} };
});

$mech->get("http://127.0.0.1:$port");
$mech->sleep(5); # boot up service worker

# Check that the app has no errors:
my @console_log = $mech->js_errors();
is 0+@console_log, 0, "No errors in the browser console"
    or diag Dumper \@console_log;

# Fetch the existing items
diag "Fetching items";
my ($res,$type);
($res, $type) = $mech->eval_in_page("notes");
is ref $res, 'ARRAY', "We get a list";
is 0+@$res, 0, "... and that list is empty";

$mech->clear_js_errors();
( $res, $type ) = $mech->eval_in_page(<<'JS');
    var item = {
        title : "Test title"
      , text : "A test message"
      , status: "active"         
      , "id": Math.uuid()
      , "displayStyle" : "display"
    };
    addItem( item );
    // Update the UI, just in case we run interactively
    UIlistItems();
JS
is $type, 'undefined';
@console_log = $mech->js_errors();
is 0+@console_log, 0, "No errors in the browser console"
    or diag Dumper \@console_log;

($res, $type) = $mech->eval_in_page("notes");
is ref $res, 'ARRAY', "We get a list";
is 0+@$res, 1, "... and that list is one element"
    or diag Dumper $res;
is $res->[0]->{title}, 'Test title', "We find our inserted item";

#my $done = AnyEvent->condvar;
#my $timer = AnyEvent->timer(after => 4, cb => $done );
#$done->recv;

diag "Going offline";
# Now, go offline
$mech->emulateNetworkConditions(
    offline => JSON::PP::true,
    latency => 0, # ms ping
    downloadThroughput => 0, # bytes/s
    uploadThroughput => 0, # bytes/s
    #connectionType => 'offline', # cellular2g, cellular3g, cellular4g, bluetooth, ethernet, wifi, wimax, other.
);

( $res, $type ) = $mech->eval_in_page(<<'JS');
    var item = {
        title : "Test title 2"
      , text : "A test message"
      , status: "active"         
      , "id": Math.uuid()
      , "displayStyle" : "display"
    };
    addItem( item );
    // Update the UI, just in case we run interactively
JS
is $type, 'undefined';
@console_log = $mech->js_errors();
is 0+@console_log, 0, "No errors in the browser console"
    or diag Dumper \@console_log;

( $res, $type ) = $mech->eval_in_page(<<'JS');
    UIlistItems();
JS
is $type, 'undefined';
@console_log = $mech->js_errors();
is 0+@console_log, 0, "No errors in the browser console"
    or diag Dumper \@console_log;
    
($res, $type) = $mech->eval_in_page("notes");
is ref $res, 'ARRAY', "We get a list";
is 0+@$res, 2, "... and that list has two elements"
    or diag Dumper $res;
is $res->[0]->{title}, 'Test title 2', "We find our inserted item at the top";

# Now, look that we wrote stuff to the database

# This part hangs somewhere...
## now, reload the page and find both items still there from the local copy
#$mech->get("http://127.0.0.1:$port");
#$mech->sleep(10);
#
#($res, $type) = $mech->eval_in_page("notes");
#is ref $res, 'ARRAY', "We get a list";
#is 0+@$res, 2, "... and that list has two elements"
#    or diag Dumper $res;
#is $res->[0]->{title}, 'Test title 2', "We find our inserted item at the top";
#is $res->[1]->{title}, 'Test title', "We find the first item as well";

undef $mech;
sleep 1;