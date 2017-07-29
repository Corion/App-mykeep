package App::mykeep::Client::Config;
use strict;
use Moo;
use Filter::signatures;
use feature 'signatures';
no warnings 'experimental::signatures';
use YAML 'LoadFile';
use File::Basename 'dirname';

our $default = {
    note_directory  => '~/.mykeep/notes',
    server_settings => '~/.mykeep/corion.net.yml',
    server_url      => 'https://corion.net/notes.psgi/',
    base_directory  => '.',
};

has base_directory => (
    is => 'ro',
);

has note_directory => (
    is => 'ro',
);

has server_settings => (
    is => 'ro',
);

has server_url => (
    is => 'ro',
);

has account => (
    is => 'ro',
);

has note_editor => (
    is => 'ro',
);

around BUILDARGS => sub( $orig, $class, @args ) {
    my $v = ref $args[0] && @args == 1 ? $args[0] : { @args };
    $v = { %$default, %$v };
    
    # Adjust directories relative to base_directory:
    for( qw( note_directory server_settings )) {
        $v->{$_} =~ s!^\.!$v->{base_directory}!;
    };
    
    $class->$orig( $v );
};

sub read_file( $class, $file ) {
    my $d = dirname( $file );
    
    my $c = {};
    if( -f $file ) {
        $c = LoadFile( $file );
        $c->{ base_directory } = $d;
    };
    $class->new( $c ) 
}

1;