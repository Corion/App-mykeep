package App::mykeep::Item;
use strict;
use Moo;
use Filter::signatures;
use feature 'signatures';
no warnings 'experimental::signatures';
use Path::Class;
use Storable 'dclone';

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
);

our @note_keys = ('id', @note_property_keys );

has [@note_property_keys, qw[
  status
]] => (
    is => 'rw',
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

# Bring a note to the most recent schema
# Not the most efficient approach as we always make a copy
sub payload( $self, $schemaVersion = $schemaVersion ) {
    my %upgraded; @upgraded{ @note_keys } = @{$self}{ @note_keys };
    $upgraded{status}        ||= 'active';
    $upgraded{schemaVersion} ||= $schemaVersion;
    $upgraded{pinPosition}   ||= 0;
    $upgraded{createdAt}     ||= 0;
    $upgraded{modifiedAt}    ||= 0;
    $upgraded{id}            = uc($upgraded{id} || uuid());
    return \%upgraded
}

sub delete( $self, $ts = gmtime() ) {
    $self->deletedAt( $ts );
    $self->{status} = 'deleted';
}

sub oneline_preview( $self, $max_width = 80 ) {
    my $title = $self->title;
    my $body = $self->text;
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

1;