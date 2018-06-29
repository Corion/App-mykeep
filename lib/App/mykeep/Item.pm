package App::mykeep::Item;
use strict;
use Moo;
use Filter::signatures;
use feature 'signatures';
no warnings 'experimental::signatures';
use Path::Class;
use Storable 'dclone';
use List::Util 'max';

use JSON::XS qw(decode_json encode_json);
use UUID 'uuid';

our $schemaVersion = '001.000.000';
our @note_property_keys= qw(
    title
    text
    bgcolor
    labels
    pinPosition
    modifiedAt
    lastSyncedAt
    archivedAt
    deletedAt
    createdAt
    schemaVersion
    syncSetting
    status
);

our @note_keys = ('id', @note_property_keys );

has [@note_property_keys] => (
    is => 'rw',
);

has _entries => (
    is => 'ro',
    default => sub { [] },
);

has id => (
    is => 'lazy',
    default => sub {
        # well, actually, we should generate an UUID
        uc uuid()
    },
);

sub from_file( $class, $filename ) {
    my $content = file( $filename )->slurp(iomode => '<:raw');
    my $res = decode_json($content);
    return $class->new( $res )
}

sub load( $class, $id, $config ) {
    my $fn = join "/", $config->note_directory, lc "$id.json";
    if( -f $fn ) {
        return $class->from_file( $fn )
    } else {
        # Return a fresh, empty item
        return $class->new( { id => uc $id
               , modifiedAt => undef
               , status => 'active'
               , pinPostion => 0
               })
    }
}

sub to_file( $self, $filename ) {
    my $payload = $self->payload();
    file( $filename )->spew(iomode => '>:raw', encode_json( $payload ));
}

sub save( $self, $config ) {
    my $id = $self->id;
    die "Have no id for item?!"
        unless $id;
    my $fn = join "/", $config->note_directory, lc "$id.json";
    $self->to_file( $fn )
}

=head2 C<< $item->clone >>

Returns a deep copy

=cut

sub clone( $self ) {
    $self->new( dclone $self->payload );
}

=head2 C<< $item->payload >>

  my $payload = $item->payload;
  write_to_file( $payload );

Brings a note to the most recent schema and returns that as an unblessed hashref
fit for saving.

Not the most efficient approach as we always make a copy.

=cut

sub payload( $self, $schemaVersion = $schemaVersion ) {
    my %upgraded; @upgraded{ @note_keys } = @{$self}{ @note_keys };
    $upgraded{status}        ||= 'active';
    $upgraded{schemaVersion} ||= $schemaVersion;
    $upgraded{pinPosition}   ||= 0;
    $upgraded{createdAt}     ||= 0;
    $upgraded{modifiedAt}    ||= 0;
    $upgraded{lastSyncedAt}  ||= 0;
    $upgraded{id}            = uc($upgraded{id} || uuid());
    
    # XXX also append the items in a proper manner
    # How can/will we keep the subitem metadata when converting to/from
    # markdown?!
    
    return \%upgraded
}

=head2 C<< $item->normalize >>

  $item->normalize;

Brings a note up to date with the current schema. The note should be saved
afterwards.

=cut

sub normalize( $self, $schemaVersion = $schemaVersion ) {
    my $p = $self->payload($schemaVersion);
    for my $k (@note_keys) {
        if( $k eq 'id' ) {
            $self->{ id } = $p->{id};
        } else {
            $self->$k( $p->{$k} );
        };
    };
}

sub delete( $self, $ts = time() ) {
    if( $self->status ne 'deleted' ) {
        $self->deletedAt( $ts );
        $self->status( 'deleted' );
    }
}

sub oneline_preview( $self, $max_width = 80 ) {
    my $title = $self->title;
    $title = '' unless defined $title;
    my $body = $self->text;
    $body = '' unless defined $body;
    $body =~ s!\s+! !g;
    my $display = $title;

    if( length $display < $max_width ) {
        my $sep = length $title ? " " : "";
        $display .= $sep . $body; # well, be smarter here
    };

    if( length $display > $max_width ) {
        substr( $display, $max_width-3 ) = '...';
    };
    $display
}

=head2 C<< $i->lastChangedAt >>

Returns the timestamp of the last change to this note. The last change
might be a modification, a deletion or something like that.

=cut

sub lastChangedAt( $self ) {
    max grep { defined $_ } $self->modifiedAt, $self->deletedAt, $self->archivedAt
}

1;