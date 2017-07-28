package App::mykeep::Client;
use strict;
use Moo;
use Filter::signatures;
use feature 'signatures';
no warnings 'experimental::signatures';

use Future::HTTP;
use YAML 'Load';
use Path::Class;
use JSON::XS qw(decode_json encode_json);

use App::mykeep::Client::Config;
use App::mykeep::Item;

has config => (
    is => 'lazy',
    default => \&read_config,
);

has transport => (
    is => 'lazy',
    default => sub { Future::HTTP->new() },
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
    my $c = $self->config;
    map { App::mykeep::Item->load( $_, $c ) }
    map { /([-a-f0-9]+)\.json/i and $1 }
    grep { /\.json$/i }
        dir( $self->config->note_directory )->children()
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
    my $item = App::mykeep::Item->load( $item_id );
    $item->delete();
    $item->save();
}

sub template_url( $self, $url ) {
    $url =~ s!:(\w+)\b!$self->config->$1!ge;
    $self->config->server_url . $url;
}

# Move into ::Transport?!
sub request($self, $url) {
    my $remote = $self->template_url( $url );
    $self->ua->get( $url )->then(sub( $body, $headers ) {
        Future->done( decode_json( $body ))
    });
}

# Remote
sub sync_items( $self, %options ) {
    # list remote
    my $remote_items = $self->request('/notes/:account/list')->get;
    # list local
    my $local_items = [ $self->list_items ];

    # merge remote to local

    # write local changes
    if( $options{ update_local }) {
    }

    # send newer/local to server
    if( $options{ update_remote }) {
    }

}

1;