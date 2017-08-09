package App::mykeep::Client;
use strict;
use Moo;
use Filter::signatures;
use feature 'signatures';
no warnings 'experimental::signatures';

use Future::HTTP;
use YAML 'Load';
use Path::Class;
use File::HomeDir;
use JSON::XS qw(decode_json encode_json);
use Storable 'dclone';

use Proc::InvokeEditor;
use Text::FrontMatter::YAML;

use URI;

use App::mykeep::Client::Config;
use App::mykeep::Item;

=head1 NAME

App::mykeep::Client - local client for App::mykeep

=head1 SYNOPSIS

  my $client = App::mykeep::Client->new(
      config_file => $config_file
  );

=head1 ACCESSORS

=head2 config_file

The name of the config file.

The default is C<.mykeep/mykeep.yml> in the home directory as determined
by L<File::HomeDir>.

=cut

has config_file => (
    is => 'lazy',
    default => sub { file( File::HomeDir->my_data(), '.mykeep', 'mykeep.yml') },
);

=head2 config

Holds the client configuration as a L<App::mykeep::Client::Config> object.

The default is to read from the config file.

=cut

has config => (
    is => 'lazy',
    default => \&read_config,
);

=head2 transport

Holds the transport to talk to the server.

The default is to use L<Future::HTTP> as transport.

=cut

has transport => (
    is => 'lazy',
    default => sub { Future::HTTP->new() },
);

=head2 editor

The invoker for the interactive editor.

The default is to use L<Proc::InvokeEditor>, which will use
C<$ENV{VISUAL}>, C<$ENV{EDITOR}> or C<vi> or C<ed> in that preference
if they are found.

On Windows, the default will be C<notepad.exe>.

=cut

has editor => (
    is => 'lazy',
    default => sub( $self ) {
        my $e = Proc::InvokeEditor->new();
        $e->editors_env( ["MYKEEP_EDITOR"] );
        if( my $edit = $self->config->note_editor ) {
            $e->prepend( $edit );
        };
        return $e
    }
);

our @userfields = qw(
    text
    title
    bgcolor
    labels
    pinPosition
);

=head1 METHODS

=head2 C<< $c->read_config( $config_file )

Reads the configuration from a file

=cut

sub read_config( $self, $config_file = $self->config_file ) {
    App::mykeep::Client::Config->read_file( $config_file )
}

=head2 C<< $c->list_items( %options )

Lists the local notes

=cut

sub list_items( $self, %options ) {
    # Set up our filter, if any
    my @search;
    if( defined $options{ text }) {
        @search = split /\s+/, $options{ text };
    };

    if( ! $options{ search_fields }) {
        $options{ search_fields } = $self->config->search_fields;
    };

    if( ! $options{ status }) {
        $options{ status } = ['active'];
    };

    my %wanted_status = map { $_ => 1 }
                        map { $_ eq 'all' ? ('active','deleted','archived') : $_ }
                        @{ $options{ status } };
    my @items = $options{ items } ? @{$options{ items }} : $self->_all_items;
    return
    grep {
        my $keep = 1;
        if( @search ) {
            my $note = $_;
            my $text = join " ",
                grep { defined $_ }
                map { $note->$_ }
                @{ $options{ search_fields }};
            for my $term (@search) {
                if( $text !~ /\Q$term/i ) {
                    $keep = 0;
                    last;
                };
            };
        };
        $keep
    }
    # Filter on the quick stuff here before searching the text further up
    grep {
        # Also filter labels here, and whatnot
        # filter on the status here
        $wanted_status{ $_->status }
    }
    grep {
        # Also filter labels here, and whatnot
        # filter on the status here
        if(( $options{ sync_status } || '' ) eq 'modified' ) {
               ($_->lastSyncedAt || 0 ) < ($_->lastChangedAt || 0)
        } else {
            1
        }
    }
    @items
}

=head2 C<< $c->_all_items( %options )

Lists all local notes. This is mostly an internal method of the storage backend
and should not be called from the outside. It is intended to be used for
storage cleanup and for backends that do not have filtering built in,
like the file system.

=cut

sub _all_items( $self ) {
    my $c = $self->config;
    return
    map { App::mykeep::Item->load( $_, $c ) }
    map { /([-a-f0-9]+)\.json/i and $1 }
    grep { /\.json$/i }
        dir( $self->config->note_directory )->children()
}

=head2 C<< $c->add_item( %data )

Creates a new item from the properties passed in and saves it. Returns the
newly created item.

=cut

sub add_item( $self, %data ) {
    my $item = App::mykeep::Item->new( %data );
    $item->save( $self->config );
    $item
}

=head2 C<< $c->edit_item( $item )

Interactively edits an item and saves it if it was changed.

=cut

sub edit_item( $self, $item ) {
    $item = App::mykeep::Item->load( $item )
        if not ref $item;
    # magic
    my $p = $item->payload;
    my $t = delete $p->{text} || '';
    my %edit; @edit{ @userfields } = @{$p}{ @userfields };
    delete $edit{ text };
    my $tfm = Text::FrontMatter::YAML->new(
        frontmatter_hashref => \%edit,
        data_text => $t,
    );
    my $yaml = $tfm->document_string;
    $yaml =~ s!\n!\r\n!g if $^O =~ /mswin/i;

    my $e = $self->editor;
    my $changed = $e->edit( $yaml, '.yml' );
    if( $changed ne $yaml ) {
        # update note
        $changed = Text::FrontMatter::YAML->new( document_string => $changed );
        my $h = $changed->frontmatter_hashref;
        $h->{text} = $changed->data_text;
        for my $field (@userfields) {
            $item->$field( $h->{ $field })
                if exists $h->{ $field };
        };
        $item->modifiedAt( time());
        $item->save( $self->config );
    };
}

# Local
sub delete_item( $self, $item_id ) {
    my $item = App::mykeep::Item->load( $item_id );
    $item->delete();
    $item->save( $self->config );
}

sub template_url( $self, $url, $params={} ) {
    $url =~ s!:(\w+)\b!$self->config->$1!ge;
    $url = URI->new( $url );
    $url->query_form( $params, ';' );
    $self->config->server_url . $url;
}

# Move into ::Transport?!
sub request($self, $method, $url, $params={}, $body=undef) {
    $params->{ password } ||= $self->config->password;
    my $remote = $self->template_url( $url, $params );
    $self->transport->http_request( $method, $remote, body => $body )->then(sub( $body, $headers ) {
        Future->done( decode_json( $body ))
    });
}

# Very simple merge strategy
sub last_edit_wins( $self, $item, $body ) {

    my %result = (
        item => $item,
        save_local => undef,
        save_remote => undef,
    );

    # Really crude "last edit wins" approach
    # We should really check if both items were changed after the last sync
    # and then try a merge of all fields,
    # and the method should return which sides need to be notified
    my @changes; # for debugging
    if( $body->modifiedAt > ($item->modifiedAt)) {
        my $copy;
        for my $key (@userfields) {
            # Detect conflicts
            my $val = $body->$key();
            if( ref $item->$key eq 'ARRAY' ) {
                if( join "\0", sort @{$item->$key} ne join "\0", sort @$val ) {
                    $copy ||= $item->clone;
                    $copy->$key( dclone $val );
                    $copy->modifiedAt( $body->modifiedAt );
                    $result{ item } = $copy;
                    $result{ save_local } = 1;
                    push @changes, { field => $key, from => $item->$key(), to => $val };
                };
            } elsif( ($item->$key // '') ne ($val // '')) {
                $copy ||= $item->clone;
                $copy->$key( $val );
                $copy->modifiedAt( $body->modifiedAt );
                $result{ item } = $copy;
                $result{ save_local } = 1;
                push @changes, { field => $key, from => $item->$key(), to => $val };
            };
        };
    } else {
        # We might have changes that the server doesn't have
        my $copy;
        for my $key (@userfields) {
            # Detect conflicts
            my $val = $body->$key();
            if( ref $item->$key eq 'ARRAY') {
                if(join( "\0", sort @{$item->$key}) ne join( "\0", sort @$val )) {
                    $copy ||= $item->clone;
                    $result{ item } = $copy;
                    $result{ save_remote } = 1;
                    push @changes, { field => $key, from => $body->$key(), to => $val };
                }
            } elsif( ($item->$key // '') ne ($val // '')) {
                $copy ||= $item->clone;
                $result{ item } = $copy;
                $result{ save_remote } = 1;
                push @changes, { field => $key, from => $body->$key(), to => $val };
            } else {
                # No change, no action needed
            };
        };
    };

    return \%result;
};

=head2 C<< $client->sync_actions >>

    my %actions = $client->sync_actions(
        local => \@local_items,
        remote => \@remote_items,
    );

Returns a hash of arrays with the actions that should be performed to bring the
two datasets to the same state.

The returned arrayrefs are items that need to be saved or uploaded to the other
side.

=cut

sub sync_actions( $self, %options ) {
    my $local_items = $options{ local };
    my $remote_items = $options{ remote };

    # merge remote to local
    my %local = map { $_->id => $_ } @$local_items;
    my %remote = map { $_->id => $_ } @$remote_items;

    my @not_uploaded = grep {
    #    ! exists $remote{ $_->id } and print $_->id . " doesn't exist remotely\n";
        ! exists $remote{ $_->id }
    } @$local_items;
    my @save_local;

    for my $r (@$remote_items) {
        if( my $l = $local{ $r->id }) {
            my $res = $self->last_edit_wins( $l, $r );
            if( $res->{save_local}) {
                push @save_local , $res->{item};
            };
            if( $res->{save_remote}) {
                push @not_uploaded, $res->{item};
            };
        } else {
            push @save_local, $r;
        };
    };

    my %results = (
        save_local => \@save_local,
        upload_remote => \@not_uploaded
    );
}

sub remote_items( $self, %options ) {
    my $pass = $options{ password };
    $options{ since } ||= 0;
    grep {
        # Filter for stuff for timestamps also locally
        $_->lastChangedAt > $options{ since }
    }
    map { App::mykeep::Item->new( $_ ) }
    @{ $self->request('GET', '/notes/:account/list', { password => $pass, since => $options{since} } )->get->{items} }
}

sub send_remote( $self, $item, %options ) {
    my $pass = $options{ password };
    my $payload = encode_json( $item->payload );
    $self->request('POST', '/notes/:account/' . $item->id, { password => $pass }, $payload )->get;
};

# Remote, this should become a separate role from the CLI
# parts that invoke the editor
sub sync_items( $self, %options ) {
    # list remote
    my $remote_items = [ $self->remote_items( %options ) ];
    # list local
    my $local_items = [ $self->list_items( %options, sync_status => 'modified' ) ];

    my %actions = $self->sync_actions(
        local => $local_items,
        remote => $remote_items,
    );

    my $syncts = time;

    # write local changes
    if( $options{ update_local } and @{ $actions{ save_local }}) {
        for my $i (@{ $actions{ save_local }}) {
            $i->lastSyncedAt( $syncts );
            $i->save( $self->config );
        };
    }

    # send newer/local to server
    if( $options{ update_remote } and @{ $actions{ upload_remote }}) {
        for my $i (@{ $actions{ upload_remote }}) {
            #print sprintf "-> %s - %s\n", $i->id, $i->oneline_preview;
            ##$i->save($self->config);
            # Upload to server
            $self->send_remote( $i, %options );
            # potentially as background daemon instead of blocking the user
            # Update the lastsynced time
            $i->lastSyncedAt($syncts);
            $i->save($self->config);
        };
    }

    # Show the new/updated items
    @{$actions{ save_local }};
}

sub sort_items( $self, @items ) {
    sort {
           ($b->pinPosition || 0 ) <=> ($a->pinPosition || 0 )
        || ($b->modifiedAt  || 0 ) <=> ($a->modifiedAt  || 0 )
        || ($b->createdAt   || 0 ) <=> ($a->createdAt   || 0 )
        || ($a->title       || '') cmp ($b->title       || '')
        || ($a->text        || '') cmp ($b->text        || '')
    } @items
}

1;