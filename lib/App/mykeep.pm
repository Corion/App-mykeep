package App::mykeep;
use strict;
use 5.016; # for /r
use Dancer ':syntax';
use JSON::XS qw(decode_json encode_json);
use Data::Dumper;
use File::Basename 'basename';

use Carp qw(croak);
use Filter::signatures;
use feature 'signatures';
no warnings 'experimental::signatures';

use vars qw($git_release);

our $VERSION = '0.01';

use vars qw( @note_keys $schemaVersion );
@note_keys= qw(
    title
    text
    bgcolor
    labels
    pinPosition
    lastSyncedAt
    modifiedAt
    archivedAt
    deletedAt
    status
    schemaVersion
    pinPosition
    syncSetting
);
$schemaVersion = '001.000.000';

=head1 NAME

App::mykeep - notes kitchen

=head1 Data model

Currently we have the following fields

  id
  title
  text
  bgcolor
  labels
  modifiedAt
  archivedAt
  lastSyncedAt
  deletedAt
  status
  schemaVersion
  pinPosition
  syncSetting

Maybe this should be moved to its own module. Later.

Future keys might become

  hasReminder / reminderICal - for reminders and their ICal calendar entry

=head2 syncSetting

=over 4

=item *

deviceOnly - never share this note with the upstream

=item *

accountOnly - only share this note with the same account upstream

=item *

public - this note is visible to the general public

=back

Maybe a note should also get a list of allowed writers and resource
administrators to make changing of information restrictable.

=head1 SECURITY

We should limit the size of incoming HTTP requests as early as possible, that
is, ideally, in the Plack handler that reads the request

=head1 ACCOUNTS

A user account consists of three parts:

=over 4

=item #

The user account - this is a uuid, likely

=item #

The storage directory - this is that same uuid again, likely

=item #

The account secret - this is used for authentification of the user

=back

=cut

sub storage_dir {
    File::Spec->rel2abs( config->{mykeep}->{notes_dir}, config->{appdir} );
}

sub account_dir( $account ) {
    join "/", storage_dir, $account->{directory}
}

# Bring a note to the most recent schema
# Not the most efficient approach as we always make a copy
sub upgrade_schema( $item, $schemaVersion = $schemaVersion ) {
    my %upgraded = %$item;
    $upgraded{status}        ||= 'active';
    $upgraded{schemaVersion} ||= $schemaVersion;
    $upgraded{pinPosition}   ||= 0;
    $upgraded{createdAt}     ||= 0;
    $upgraded{modifiedAt}    ||= 0;
    return \%upgraded
}

sub git_release {
    if( ! $git_release ) {
        if( -d '.git' ) {
            $git_release ||= `git rev-parse HEAD`;
        } else {
            # This means we need to fudge our config on deploying?!
            $git_release = config->{ git_release }
        };
    };
    $git_release
}

sub user_credentials( $account_name ) {
    my $account = verify_session( $account_name, undef );
    return {
        user      => $account_name,
        directory => $account->{directory},
        secret    => '',
    }
}

get '/' => sub {
    redirect './index.html';
};

get '/index.html' => sub {
    #headers( "Connection" => "close" );

    if(     ! request->secure
        and config->{environment} eq 'production'   ) {

        my $r = join '/', 'https:/', request->uri_base, request->path_info;
        return redirect $r;
    }

    template 'app';
};

get '/version.json' => sub {
    content_type 'application/json; charset=utf-8';
    return to_json +{
        version => $VERSION,
        release => git_release(),
    };
};

get '/settings.html' => sub {
    template 'settings';
};

get '/settings.json' => sub {
    # Should we sign the credentials, JWT-style?!
    content_type 'application/json; charset=utf-8';
    my $user = session('user');
    if( my $account = verify_session( $user, request )) {
        return to_json +{
            lastSynced => time,
            url => '' . request->uri_base,
            # Per-device settings - we shouldn't store them here?!
            useFrontCamera => 0,
            credentials => user_credentials($user),
        };
    };
};

post '/settings.json' => sub {
    content_type 'application/json; charset=utf-8';
    my $user = session('user');
    if( my $account = verify_session( $user, request )) {
        return to_json +{
            lastSynced => time,
            version => $VERSION,
            url => request->uri_base,
            # Per-device settings - we shouldn't store them here?!
            useFrontCamera => 0,
        };
    };
};

get '/search.html' => sub {
    template 'search';
};

get '/notes/:account/list' => sub {
    #headers( "Connection" => "close" );
    if( my $account = verify_session( params->{account}, request )) {
        my $dir = join "/", account_dir( $account ), '*.json';
        my @files= map { basename $_ } glob $dir;
        # Consider paging here
        # Also, consider how to merge public and private notes here
        # Also, consider only changes since here...

        my @result=
            sort {
                ($b->{pinPosition} || 0) <=> ($a->{pinPosition} || 0)
             || ($b->{modifiedAt}  || 0) <=> ($a->{modifiedAt}  || 0)
             || ($b->{createdAt}   || 0) <=> ($a->{createdAt}   || 0)
            }
            map { my $i= load_item($_, account => $account );
                  $i
            } map { s/\.json$//ir }
            @files
            ;
        content_type 'application/json; charset=utf-8';
        return to_json { more => undef, items => \@result };
    } else {
        warning sprintf "No account '%s' found for listing stuff", params->{account};
    };
};

=head2 C<< clean_id >>

Makes sure that an ID is somewhat well-formed and somewhat looks like an UUID.
Only allowed character are "-", "A" to "F" (upper case) and "0"-"9".
The length of the string must be shorter or equal to 100 characters.

=cut

sub clean_id {
    my( $id )= @_;
    if( length($id) > 100 ) {
        substr($id,100) = ''
    };
    $id=~ tr/-A-Fa-f0-9//cd;
    uc $id
}

sub slurp( $fn ) {
    open my $fh, '<:raw', $fn
        or croak "Couldn't read '$fn': $!";
    local $/;
    <$fh>
}

sub verify_session( $account, $request ) {
    $account =~ m!\A([A-Za-z0-9-]+)\z!
        or return;
    if( ! session->{user}) {
        $account = 'public';
        session('user' => $account);
        warning "Forcing account to '$account'";
    };
    (session->{user} && (session->{user} eq $account))
        or return;

    (my $account_entry) = grep { $_->{name} eq $account } @{ config->{accounts} };
    return unless $account_entry;
    
    my $account_dir = account_dir( $account_entry );
    -d $account_dir or return;
    
    $account_entry
    #-f "$account_dir/.account" or return;
    # Well, maybe later move that to JSON, and sign it, and hand it to the
    # client, JWT-style, so they can be identified/trusted without hitting
    # the disk. Once we go web-scale.
    #my $content = slurp("$account_dir/.account");
    #$param->{secret} eq $content
    #    and return $account
}

sub load_item( $id, %options ) {
    my $dir = $options{ account }->{directory};
    my $fn= join "/", storage_dir(), $dir, "$id.json";
    if( -f $fn ) {
        my $content= slurp( $fn );
        my $res = decode_json($content);
        return upgrade_schema( $res )
    } else {
        # Return a fresh, empty item
        return { id => $id
               , modifiedAt => undef
               , status => 'active'
               , pinPostion => 0
               }
    }
}

sub save_item {
    my( $item, %options )= @_;
    my $id= $item->{id};

    $item = upgrade_schema( $item );

    die "Have no id for item?!"
        unless $item->{id};
    my $fn= join "/", account_dir( $options{ account } ), "$id.json";
    open my $fh, '>:raw', $fn
        or die "'$fn': $!";
    print $fh encode_json( $item )
}

get '/notes/:account/:note' => sub {
    if( my $account = verify_session( params->{account}, request )) {
        my $id= clean_id( params->{note} );
        headers( "Connection"             => "close",
                 "Content-Disposition"    => "attachment; filename=${id}.json",
                 "X-Content-Type-Options" => "nosniff",
               );

        my $item= load_item( $id, account => $account );
        # Check "if-modified-since" header
        # If we're newer, send response
        # otherwise, update the last-synced timestamp?!

        content_type 'application/json; charset=utf-8';
        return to_json($item);
    } else {
        status 400;
    }
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
# Also, in addition to getting+saving JSON, also allow for simple
# CGI parameters so we could even function without Javascript
post '/notes/:account/:note' => sub {
    headers( "Connection" => "close" );
    my $id= clean_id( request->params("route")->{note} );

    if( ! within_request_size_limits( config, request )) {
        status 414;
        return;
    };

    if( my $account = verify_session( params->{account}, request )) {
        my $ct = request->content_type;
        my $charset = 'utf-8';
        if( $ct =~ /;\s*charset=(["']?)(.*)\1/ ) {
            $charset = $2;
        };
        my $body= decode_json(request->body);

        my $item;
        if(not eval { $item = load_item( $id, account => $account ); 1 }) {
            $item = {};
        };

        $body = upgrade_schema( $body );

        if( ($item->{status} || '') ne 'deleted' ) {
            # Really crude "last edit wins" approach
            $item= last_edit_wins( $item, $body );
        };

        # Set "last-synced" timestamp
        $item->{lastSyncedAt}= time();
        save_item( $item, account => $account );

        # Do we really want to do an external redirect here
        # instead of serving an internal redirect to the client?
        # Also, do we want to (re)deliver the known content at all?!
        # Maybe it's just enough to tell the client the server status
        # that is, id and lastSyncedAt unless there are changes.
        # Maybe { result: patch, { id: 123, changed: [foo:"bar"] }]

        # "forward()" won't work, because we want to change
        # POST to GET
        content_type 'application/json; charset=utf-8';
        return to_json($item);
    }
};

# Maybe PUT instead of POST, later
# Also, in addition to getting+saving JSON, also allow for simple
# CGI parameters so we could even function without Javascript
post '/notes/:account/:note/delete' => sub {
    headers( "Connection" => "close" );
    my $id= clean_id( request->params("route")->{note} );
    
    if( my $account = verify_session( params->{account}, request )) {
        # Maybe archive the item
        # We shouldn't delete anyway, because deleting means
        # breaking synchronization
        #my $fn= storage_dir() . "/$id.json";

        my $item = load_item($id, account => $account );
        $item->{status} = 'deleted';
        save_item( $item, account => $account );

        # Cleanup should be done in a cron job, and later in a real DB
        #unlink $fn; # boom

        return "";
    } else {
        warning "Unknown account '$account'"
    }
};

sub within_request_size_limits {
    my( $config, $request ) = @_;
    if( $request->content_length < $config->{mykeep}->{maximum_note_size} ) {
        return 1;
    };
}

get '/login' => sub {
    my $user = session('user');
    template 'login', {
        user => $user,
    };
};

post '/login' => sub {
    my $user = params->{user};
    my $password = params->{password};
    
    my $ok;
    if( my $account = verify_session( $user, request )) {
        # We know that user
        # Verify their password
        if( $account->{password} eq $password ) {
            session('user', $user);
            $ok = 1;
        } else {
            warning "Known user [$user] but wrong password";
        };
    } else {
        warning "Unknown user [$user]";
    };
    if( ! $ok ) {
        return
            template 'login', {
                user => $user,
            };
    } else {
        return
            redirect
                './index.html';
    }
};

true;
