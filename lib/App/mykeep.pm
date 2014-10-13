package App::mykeep;
use strict;
use 5.016; # for /r
use Dancer ':syntax';
use JSON::XS qw(decode_json encode_json);
use Data::Dumper;
use File::Basename 'basename';

our $VERSION = '0.01';

use vars qw( @note_keys );
@note_keys= qw(title text bgcolor modifiedAt lastSyncedAt archivedAt );

get '/' => sub {
    template 'app';
};

get '/notes/list' => sub {
    my @files= map { basename $_ } glob 'notes/*.json';
    # Consider paging here
    # Also, conssider only changes since here...
    
    my @result=
        map { warn $_; my $i= load_item($_);
              { id => $i->{id},
                modifiedAt => $i->{modifiedAt},
                archivedAt => $i->{archivedAt},
              }
        } map { s/\.json$//ir }
        @files
        ;
    content_type 'application/json';
    return encode_json({ more => undef, items => \@result })
};

sub clean_id {
    my( $id )= @_;
    $id=~ tr/-A-Fa-f0-9//cdr;
}

sub load_item {
    my( $id, %options )= @_;
    my $fn= "notes/$id.json";
    if( -f $fn ) {
        my $content= do { local( @ARGV, $/) = $fn; <> };
        return decode_json($content);
    } else {
        # Return a fresh, empty item
        return { id => $id
               , modifiedAt => undef
               }
    }
}

sub save_item {
    my( $item, %options )= @_;
    my $id= $item->{id};
    die "Have no id for item?!"
        unless $item->{id};
    my $fn= "notes/$id.json";
    open my $fh, '>', $fn
        or die "'$fn': $!";
    print { $fh } encode_json( $item )
}

get '/notes/:note' => sub {
    my $id= clean_id( params->{note} );
    
    my $item= load_item( $id );
    # Check "if-modified-since" header
    # If we're newer, send response
    # otherwise, update the last-synced timestamp?!

    content_type 'application/json';
    return encode_json($item);
};

sub last_edit_wins {
    my( $_item, $body )= @_;
    my $item= { %$_item };

    # Really crude "last edit wins" approach    
    if( ($body->{modifiedAt} || 0) > ($item->{modifiedAt} || 0)) {
        for my $key (@note_keys) {
            # Detect conflicts
            # Merge
            $item->{$key}= $body->{ $key };
        };
    };
    
    $item
};

# Maybe PUT instead of POST, later
post '/notes/:note' => sub {
    my $id= clean_id( request->params("route")->{note} );
    
    my $body= decode_json(request->body);
    warning $body;
    
    my $item= eval { load_item( $id ); };
    #warning "loaded ($@) " . Dumper $item;

    # Really crude "last edit wins" approach    
    $item= last_edit_wins( $item, $body );

    # Set "last-synced" timestamp
    $item->{lastSyncedAt}= time();
    save_item( $item );
    
    # Do we really want to do an external redirect here
    # instead of serving an internal redirect to the client?
    # Also, do we want to (re)deliver the known content at all?!
    # Maybe it's just enough to tell the client the server status
    # that is, id and lastSyncedAt unless there are changes.
    # Maybe { result: patch, { id: 123, changed: [foo:"bar"] }]
    warning "Redirecting";
    
    # "forward()" won't work, because we want to change
    # POST to GET
    content_type 'application/json';
    return encode_json($item);
};

true;
