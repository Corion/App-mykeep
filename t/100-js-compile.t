#!perl -w
use strict;
use Twiggy::Server;
use Dancer::Test;
use File::Temp 'tempdir';
use WWW::Mechanize::Chrome;
use Log::Log4perl qw(:easy);
use Data::Dumper;
use Test::More tests => 1;

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
    headless => 1,
);

$mech->clear_js_errors();

$mech->get("http://127.0.0.1:$port");
$mech->sleep(1); # boot up service worker

# Check that the app has no errors:
my @console_log = $mech->js_errors();
is 0+@console_log, 0, "No errors in the browser console"
    or diag Dumper \@console_log;

undef $mech;
sleep 1;