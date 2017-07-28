package App::mykeep::Item;
use strict;
use Moo;
use Filter::signatures;
use feature 'signatures';
no warnings 'experimental::signatures';
use Path::Class;

use JSON::XS qw(decode_json encode_json);

use vars qw( @note_keys $schemaVersion );
@note_keys= qw(
    title
    text
    bgcolor
    labels
    pinPosition
    modifiedAt
    lastSyncedAt
    archivedAt
    deletedAt
    schemaVersion
    syncSetting
);
$schemaVersion = '001.000.000';

has [@note_keys, qw[
  status
]] => (
    is => 'rw',
);

has id => (
    is => 'lazy',
    default => sub {
        # well, actually, we should generate an UUID
        die "Need an id";
    },
);

sub load( $class, $id, $config ) {
    my $fn = join "/", $config->note_directory, lc "$id.json";
    if( -f $fn ) {
        my $content = file( $fn )->slurp();
        my $res = decode_json($content);
        return $class->new( $res )
    } else {
        # Return a fresh, empty item
        return $class->new( { id => $id
               , modifiedAt => undef
               , status => 'active'
               , pinPostion => 0
               })
    }
}

sub save( $self, $config ) {
    my $id = $self->id;
    my $payload = $self->get_payload();
    
    die "Have no id for item?!"
        unless $id;
    my $fn = join "/", $config->note_directory, lc "$id.json";
    open my $fh, '>:raw', $fn
        or die "'$fn': $!";
    print $fh encode_json( $payload )
}

# Bring a note to the most recent schema
# Not the most efficient approach as we always make a copy
sub payload( $self, $schemaVersion = $schemaVersion ) {
    my %upgraded = @{$self}{ @note_keys };
    $upgraded{status}        ||= 'active';
    $upgraded{schemaVersion} ||= $schemaVersion;
    $upgraded{pinPosition}   ||= 0;
    $upgraded{createdAt}     ||= 0;
    $upgraded{modifiedAt}    ||= 0;
    return \%upgraded
}

sub delete( $self ) {
    $self->{status} = 'deleted';
}

1;