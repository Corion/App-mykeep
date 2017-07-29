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
    is => 'ro',
    default => '~/.mykeep/mykeep.yml',
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
    my $changed = $e->edit( $yaml );
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
    $self->ua->get( $url )->then(sub( $body, $headers ) {
        Future->done( decode_json( $body ))
    });
}

# Remote, this should become a separate role from the CLI parts
# invoking the editor maybe
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