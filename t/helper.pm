package helper;
use strict;
use File::Path;
use File::Temp 'tempdir';
use WWW::Mechanize::Chrome;

sub spawn_app {
    my( $port ) = @_;
    
    my $h = helper::Child->new;
    $h->spawn_child( 'plackup', '-a', 'bin/app.pl', '-p', $port );
    $h
}

my @cleanup_directories;
END {
    File::Path::rmtree($_, 0) for @cleanup_directories;
}

sub spawn_chrome {
    my $tempdir = tempdir();
    push @cleanup_directories, $tempdir;
    my $mech = WWW::Mechanize::Chrome->new(
        launch_exe => 'C:\\Users\\Corion\\Projekte\\WWW-Mechanize-Chrome\\chrome-versions\\chrome-65.0.3301.0\\chrome.exe',
        data_directory => $tempdir,
        @_
    );
}

package helper::Child;
use strict;

sub new {
    my( $class, %options ) = @_;
    bless \%options => $class;
}

sub DESTROY {
    kill 'KILL', $_[0]->{pid};
    wait;
}

sub spawn_child_win32 { my ( $self, @cmd ) = @_;
    system(1, @cmd)
}

sub spawn_child_posix { my ( $self, @cmd ) = @_;
    require POSIX;
    POSIX->import("setsid");

    # daemonize
    defined(my $pid = fork())   || die "can't fork: $!";
    if( $pid ) {    # non-zero now means I am the parent
        $self->log('debug', "Spawned child as $pid");
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

sub spawn_child { my ( $self, @cmd ) = @_;
    my ($pid);
    if( $^O =~ /mswin/i ) {
        $pid = $self->spawn_child_win32(@cmd)
    } else {
        $pid = $self->spawn_child_posix(@cmd)
    };
    $self->{pid} = $pid;

    return $pid
}

1;