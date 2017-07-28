#!perl -w
use strict;
use Getopt::Long;
use Pod::Usage;
use App::mykeep::Client;
use PerlX::Maybe 'maybe';

use Filter::signatures;
use feature 'signatures';
no warnings 'experimental::signatures';

GetOptions(
    'h|help'     => \my $help,
	'v|version'  => \my $version,
    'sync:s'     => \my $sync_account,
    'n|dry-run'  => \my $dry_run,

    # Commands
    # Maybe these should become real commands, not switches
    'edit:s'     => \my $edit_note,
    'l|list'     => \my $list_notes,

    't|label:s'  => \my $label,

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

sub find_notes( $notes, $searchtext, $labels ) {
    my @search = split /\s+/, $searchtext;
    grep {
        my $text = join " ", $_->title, $_->text;
        my $keep = 1;
        for my $term (@search) {
            if( $text !~ /\Q$term/i ) {
                $keep = 0;
                last;
            };
        };
        $keep
    } @$notes;
}

# split out actions into separate packages, like all the cool kids do?
if( $list_notes ) {
    my @notes = $client->list_items;

    if( @note_body or $label ) {
        # Search title and body
        my $search = join " ", @note_body;
        @notes = find_notes( \@notes, $search, $label );
    };

    for my $note (@notes) {
        my $id = $note->id;
        my $title = $note->title;
        my $body = $note->text;
        my $display = $title;
        if( -t ) {
            my $width = $ENV{COLUMNS} || 80;
            if( length $display < $width ) {
                my $sep = length $title ? " " : "";
                $display .= $sep . $body; # well, be smarter here
            };
        };
        print "$id - $display\n"
    };
};