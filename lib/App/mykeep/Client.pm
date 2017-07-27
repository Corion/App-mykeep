package App::mykeep::Client;
use strict;
use Moo;
use Filter::signatures;
use feature 'signatures';
no warnings 'experimental::signatures';

use Future::HTTP;

has config => (
    is => 'lazy',
    default => \&read_config,
);

has config_file => (
    is => 'ro',
    default => '~/.mykeeprc',
);

# Local
sub list_items( $self ) {
}

# Local
sub add_item( $self ) {
}

# Local
sub edit_item( $self, $item_id ) {
}

# Local
sub delete_item( $self, $item_id ) {
}

# Remote
sub sync_items( $self ) {
}

1;