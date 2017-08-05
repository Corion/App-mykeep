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

use Proc::InvokeEditor;
use Text::FrontMatter::YAML;

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
    is => 'lazy',
    default => sub { file( File::HomeDir->my_data(), '.mykeep', 'mykeep.yml') },
);

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

sub read_config( $self, $config_file = $self->config_file ) {
    App::mykeep::Client::Config->read_file( $config_file )
}

# Local
sub list_items( $self, %options ) {
    my $c = $self->config;

    # Set up our filter, if any
    my @search;
    if( defined $options{ text }) {
        @search = split /\s+/, $options{ text };
    };

    if( ! $options{ search_fields }) {
        $options{ search_fields } = $self->config->search_fields;
    };

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
            # Also filter labels here, and whatnot
        };
        $keep
    }
    map { App::mykeep::Item->load( $_, $c ) }
    map { /([-a-f0-9]+)\.json/i and $1 }
    grep { /\.json$/i }
        dir( $self->config->note_directory )->children()
    ;
}

# Local
sub add_item( $self, %data ) {
    my $item = App::mykeep::Item->new( %data );
    $item->save;
    $item
}

# Local, interactive
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
        $item->save( $self->config );
    };
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
    $self->transport->http_get( $remote )->then(sub( $body, $headers ) {
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
    if( $body->modifiedAt > ($item->modifiedAt)) {
        for my $key (@userfields) {
            # Detect conflicts
            my $val = $body->$key();
            if( $item->$key ne $val ) {
                $item->$key( $val );
                $result{ save_local } = 1;
            };
        };
    } else {
        # We might have changes that the server doesn't have
        for my $key (@userfields) {
            # Detect conflicts
            my $val = $body->$key();
            if( $item->$key ne $val ) {
                $result{ save_remote } = 1;
            };
        };
    };

    return \%result;
};

# Remote, this should become a separate role from the CLI
# parts that invoke the editor
sub sync_items( $self, %options ) {
    # list remote
    my $remote_items = [
        map { App::mykeep::Item->new( $_ ) }
        @{ $self->request('/notes/:account/list')->get->{items} }
    ];
    # list local
    my $local_items = [ $self->list_items ];

    # merge remote to local
    my %local = map { $_->id => $_ } @$local_items;
    my %remote = map { $_->id => $_ } @$remote_items;
    
    my @not_uploaded = grep { ! exists $remote{ $_->id } } @$local_items;
    my @save_local;
    
    for my $r (@$remote_items) {
        if( my $l = $local{ $r }) {
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

    # write local changes
    if( $options{ update_local }) {
        for my $i (@save_local) {
            $i->save();
        };
    }

    # send newer/local to server
    if( $options{ update_remote }) {
        for my $i (@not_uploaded) {
            # Upload to server
            # potentially as background daemon instead of blocking the user
        };
    }

    @$remote_items;
}

sub sort_items( $self, @items ) {
    sort {
           $b->pinPosition <=> $a->pinPosition
        || $b->modifiedAt  <=> $a->modifiedAt
        || $b->createdAt   <=> $a->createdAt
        || $a->title       cmp $b->title
        || $a->text        cmp $b->text
    } @items
}

1;