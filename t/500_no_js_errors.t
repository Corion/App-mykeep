#!perl -w
use Test::More tests => 2;
use strict;
use warnings;
use Data::Dumper;
use File::Temp 'tempdir';

use WWW::Mechanize::Chrome;
use Log::Log4perl qw(:easy);
Log::Log4perl->easy_init($ERROR);

# Spin up a test instance
sub spawn_child_win32 {
    my(  @cmd ) = @_;
    system(1, @cmd)
}

sub spawn_child_posix {
    my ( @cmd ) = @_;
    require POSIX;
    POSIX->import("setsid");

    # daemonize
    defined(my $pid = fork())   || die "can't fork: $!";
    if( $pid ) {    # non-zero now means I am the parent
        #$self->log('debug', "Spawned child as $pid");
        return $pid;
    };
    chdir("/")                  || die "can't chdir to /: $!";

    # We are the child, close about everything, then exec
    (setsid() != -1)            || die "Can't start a new session: $!";
    open(STDERR, ">&STDOUT")    || die "can't dup stdout: $!";
    open(STDIN,  "< /dev/null") || die "can't read /dev/null: $!";
    open(STDOUT, "> /dev/null") || die "can't write to /dev/null: $!";
    exec @cmd;
}

sub spawn_child {
    my ( @cmd ) = @_;
    my ($pid);
    if( $^O =~ /mswin/i ) {
        $pid = spawn_child_win32(@cmd)
    } else {
        $pid = spawn_child_posix(@cmd)
    };

    # We should wait for the server to spin up
    # $self->_wait_for_socket_connection( $localhost, $self->{port}, $self->{startup_timeout} || 20);
    return $pid
}

sub spawn_app {
    my( $port ) = @_;
    return spawn_child( 'plackup', '-a', 'bin/app.pl', '-p', $port )
}

use App::mykeep; # just to see that it compiles and launches

my $port = 5099;
my $pid = spawn_app( $port );

# Actually, maybe just use fork so we can configure this in the same file
# as we do later
Dancer::config()->{mykeep}->{notes_dir} = tempdir();

my $mech = WWW::Mechanize::Chrome->new(
    launch_exe => 'C:\\Users\\Corion\\Projekte\\WWW-Mechanize-Chrome\\chrome-versions\\chrome-win32-61.0.3141.0\\chrome.exe',
);

my $url = "http://localhost:$port/";
my $res = $mech->get( $url );
ok $res->is_success, "We can retrieve $url";

my @errors = $mech->js_errors;
@errors = grep { $_->{type} ne 'log' } @errors;
is 0+@errors, 0, "No JS errors"
    or diag Dumper \@errors;
done_testing;

END {
    kill 'KILL', $pid
}