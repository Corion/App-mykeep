#!perl -w
use strict;
use Test::More tests => 4;

use App::mykeep::Item;
use File::Temp 'tempfile';

my $text = "";
my $title = "Mot\N{LATIN SMALL LETTER O WITH DIAERESIS}rhead";

my $item = App::mykeep::Item->new(
    text => $text,
	title => $title,
);

is $item->text, $text, "Item text is as expected";
is $item->title, $title, "Item title is as expected";

my ($fh, $t) = tempfile();
close $fh;
$item->to_file( $t );

my $new_item = App::mykeep::Item->from_file($t);

is $new_item->text, $text, "Loaded item text is as expected";
is $new_item->title, $title, "Loaded item title is as expected";

unlink $t;