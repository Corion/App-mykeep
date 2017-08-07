package App::mykeep::Client::Config;
use strict;
use Moo;
use Filter::signatures;
use feature 'signatures';
no warnings 'experimental::signatures';
use YAML 'LoadFile';
use File::Basename 'dirname';
use Path::Class;

=head1 NAME

App::mykeep::Client::Config - client configuration holder

=head1 SYNOPSIS

  my $config = App::mykeep::Client::Config->read_file(
      'path/to/config.yml',
  );

=cut

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

has password => (
    is => 'ro',
);

has note_editor => (
    is => 'ro',
);

has search_fields => (
    is => 'lazy',
    default => sub { [qw[title text id]] },
);

around BUILDARGS => sub( $orig, $class, @args ) {
    my $v = ref $args[0] && @args == 1 ? $args[0] : { @args };
    $v = { %$default, %$v };
    
    # Adjust directories relative to base_directory:
    for( qw( note_directory server_settings )) {
        $v->{$_} =~ s!^\.([^\.]?)!$v->{base_directory}$1!;
    };
    
    $class->$orig( $v );
};

sub read_file( $class, $file ) {
    
    my $c = {};
    if( -f $file ) {
        my $d = dirname( $file );
        $c = LoadFile( $file );
        $c->{ base_directory } ||= '.';
        my $base = dir( $c->{ base_directory } );
        if( $base->is_relative ) {
            $base = dir( $d, $base );
            $c->{ base_directory } = "$base";
        };
    };
    $class->new( $c ) 
}

1;