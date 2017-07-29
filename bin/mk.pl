#!perl -w
use strict;
use Getopt::Long;
use Pod::Usage;
use PerlX::Maybe 'maybe';
use YAML qw( Dump Load );

use App::mykeep::Client;

use Filter::signatures;
use feature 'signatures';
no warnings 'experimental::signatures';

GetOptions(
    'h|help'     => \my $help,
	'v|version'  => \my $version,
    'sync:s'     => \my $sync_account,
    'n|dry-run'  => \my $dry_run,

    'f|config:s' => \my $config_file,

    # Commands
    # Maybe these should become real commands, not switches

    # Edit note in $EDITOR
    'edit'       => \my $edit_note,
    # Append STDIN to note
    'append'     => \my $append_note,

    'l|list'     => \my $list_notes,

    # Should we have an "init" action that sets up a new note directory?

    't|label:s'  => \my $label,
)
or pod2usage(2);

sub display_notes( @notes ) {
    for my $note (@notes) {
        my $id = $note->id;
        my $title = $note->title;
        my $body = $note->text;
        $body =~ s!\s+! !g;
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
}

my $client = App::mykeep::Client->new(
    maybe config_file => $config_file
);

my @note_body;
if( @ARGV ) {
    @note_body = join " ", @ARGV;
};
if( $edit_note ) {

    my @notes;
    if( @note_body or $label ) {
        my $search = join " ", @note_body;
        # Search title and body
        @notes = $client->list_items( text => $search, label => $label );
    };

    if( @notes == 1 ) {
        # if we find (one) note, edit that one
        # copy note text+body as yaml to a tempfile
        # invoke $EDITOR
        # read tempfile back, hopefully the syntax was not broken
        my $note = $notes[0];
        $client->edit_item( $note );

    } elsif( @notes == 0 ) {
        # create a template note in a tempfile
        my $blank = App::mykeep::Item->new();
        $client->edit_item( $blank );

    } else {
        print "More than one note found\n";
        display_notes( @notes );
    };
};

# split out actions into separate packages, like all the cool kids do?
if( $list_notes ) {
    my $search = join " ", @note_body;
    my @notes = $client->list_items( text => $search, label => $label );
    display_notes( @notes );

};

__END__

=head1 USAGE
