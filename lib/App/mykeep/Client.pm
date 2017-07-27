package App::mykeep::Client;
use strict;
use Moo;
use Filter::signatures;
use feature 'signatures';
no warnings 'experimental::signatures';

use Future::HTTP;
use YAML 'Load';
use Path::Class;

has config => (
    is => 'lazy',
    default => \&read_config,
);

has config_file => (
    is => 'ro',
    default => '~/.mykeep/mykeep.yml',
);

sub read_config( $self, $config_file = $self->config_file ) {
    App::mykeep::Client::Config->read_file( $config_file )
}

# Local
sub list_items( $self, %options ) {
    map { App::mykeep::Item->load( $_ ) }
    grep /\.json$/i
        dir( $self->config->item_directory )->children()
}

# Local
sub add_item( $self, %data ) {
    my $item = App::mykeep::Item->new( %data );
    $item->save;
    $item
}

# Local
sub edit_item( $self, $item_id ) {
    my $item = App::mykeep::Item->load( $item_id );
    # magic
    
}

# Local
sub delete_item( $self, $item_id ) {
    my $item = App::mykeep::Item->load( $item_id )->delete();
}

# Remote
sub sync_items( $self ) {
    # list remote
    # list local
    # merge remote to local
    # send newer/local to server
}

1;