#!perl -w
use strict;
use Getopt::Long;
use Pod::Usage;
use App::mykeep::Client;
use PerlX::Maybe 'maybe';

GetOptions(
    'h|help'     => \my $help,
	'v|version'  => \my $version,
    'sync:s'     => \my $sync_account,
    'n|dry-run'  => \my $dry_run,
    'edit:s'     => \my $edit_note,
    'l|list'     => \my $list_notes,

    't|tag:s'    => \my $tag,

    'f|config:s' => \my $config_file,
    
)
or pod2usage(2);

my $client = App::mykeep::Client->new(
    maybe config_file => $config_file
);

my @note_body;
if( $edit_note ) {
    # create a template note in a tempfile
    # invoke $EDITOR
    # read tempfile back
} elsif( @ARGV ) {
    # Note from the command line
    @note_body = join " ", @ARGV
};

# Should we have an "init" action that sets up a new note directory?

# split out actions into separate packages, like all the cool kids do?
if( $list_notes ) {
    my @notes = $client->list_items;
    if( defined $tag ) {
        # @notes = grep {} @notes;
    };
    for my $note (@notes) {
        my $id = $note->id;
        my $title = $note->title;
        my $body = $note->text;
        my $display = $title;
        if( -t ) {
            my $width = $ENV{COLUMNS} || 80;
            if( length $display < $width ) {
                $display .= $body; # well, be smarter here
            };
        };
        print "$id - $display\n"
    };
};