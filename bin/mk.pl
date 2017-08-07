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
    # Append the rest of the arguments to note, without further interaction
    # note selection is the first argument
    'append'     => \my $append_note,

    'l|list'     => \my $list_notes,

    # Should we have an "init" action that sets up
    # a new note directory and config file?

    't|label:s'  => \my @label,      # show only this label
    's|status:s' => \my @status,     # show only notes in this status
)
or pod2usage(2);

if( defined $config_file and ! -f $config_file) {
    die "Config file '$config_file' not found.\n";
};

my $client = App::mykeep::Client->new(
    maybe config_file => $config_file
);

sub display_notes( @notes ) {
    @notes = $client->sort_items( @notes );
    for my $note (@notes) {
        my $id = $note->id;
        my $width;
        if( -t ) {
            $width = $ENV{COLUMNS} || 80;
            $width -= 1+length( $id ) +3;
        };
        my $display = $note->oneline_preview( $width );
        print "$id - $display\n"
    };
}

my @note_body;
if( @ARGV ) {
    @note_body = @ARGV;
};

if( $edit_note or $append_note ) {

    my @notes;
    if( @note_body or @label ) {
        my $search;
        if( $edit_note ) {
            $search = join " ", @note_body;
        } elsif( $append_note ) {
            $search = shift @note_body;
        };
        # Search title and body
        @notes = $client->list_items( text => $search, label => @label );
    };

    if( @notes == 1 ) {
        my $note = $notes[0];

        if( $edit_note ) {
            $client->edit_item( $note );
        } elsif( $append_note ) {
            my $t = $note->text;
            $t =~ s!\s*$!!;
            $t .= "\n" . join "\n", @note_body;
            $t .= "\n";
            $note->text( $t );
            $note->save( $client->config );
        };

    } elsif( @notes == 0 ) {
        # create a template note in a tempfile
        my $blank = App::mykeep::Item->new();
        $blank->text( @note_body );
        if( $edit_note ) {
            $client->edit_item( $blank );
        } elsif( $append_note ) {
        warn "Creating new item";
            # Should appending to a non-existent note work?!
            $blank->save( $client->config );
        };

    } else {
        print "More than one note found\n";
        display_notes( @notes );
    };
};

# split out actions into separate packages, like all the cool kids do?
if( $list_notes ) {
    my $search = join " ", @note_body;
    my @notes = $client->list_items( text => $search, label => \@label );
    #@notes = $client->sync_items( update_local => 1, update_remote => 1 );

    display_notes( @notes );

};

__END__

=head1 USAGE

  mk.pl -e "Just a note"

=cut