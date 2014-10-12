package App::mykeep;
use strict;
use 5.016; # for /r
use Dancer ':syntax';
use JSON::XS qw(decode_json encode_json);
use Data::Dumper;

our $VERSION = '0.01';

use vars qw( @note_keys );
@note_keys= qw(title text bgcolor lastModifiedAt lastSyncedAt archivedAt );

get '/' => sub {
    template 'app';
};

get '/notes/list' => sub {
    my @files= glob 'notes/*.json';
    
    content_type 'application/json';
    my @result=
        map { my $i= load_item($_); { id => $i->{id}, lastModifiedAt => $i->{lastModifiedAt }}  }
        @files
        ;
    return \@result;
};

sub clean_id {
    my( $id )= @_;
    $id=~ tr/-A-Fa-f0-9//cdr;
}

sub load_item {
    my( $id, %options )= @_;
    my $fn= "notes/$id.json";
    if( -f $fn ) {
        warning "File exists";
        my $content= do { local( @ARGV, $/) = $fn; <> };
        warn $content;
        return decode_json($content);
    } else {
        warning "File doesn't exist, returning new note";
        # Return a fresh, empty item
        return { id => $id
               , lastModifiedAt => undef
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
    content_type 'application/json';
    my $id= clean_id( params->{note} );
    
    my $item= load_item( $id );
    # Check "if-modified-since" header
    # If we're newer, send response
    # otherwise, update the last-synced timestamp?!

    $item
};

# Maybe PUT instead of POST, later
post '/notes/:note' => sub {
    content_type 'application/json';
    my $id= clean_id( request->params("route")->{note} );
    
    my $body= decode_json(request->body);
    warning $body;
    
    my $item= eval { load_item( $id ); };
    warning "loaded ($@) " . Dumper $item;
    for my $key (@note_keys) {
        my $payload= $body->{ $key };
        # Detect conflicts
        # Merge
        $item->{ $key }= $payload;
    };

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
    return redirect sprintf '/notes/%s', $item->{id}
};

true;
