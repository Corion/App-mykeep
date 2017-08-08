#!perl -w
use strict;
use Test::More tests => 3;
use Data::Dumper;

use App::mykeep::Item;
use App::mykeep::Client;

my $start = time;
my $item = App::mykeep::Item->new({
    text => 'test item 1 (active)',
	modifiedAt => $start,
	labels => ['l1', 'l2'],
    status => 'active',
});
$item->normalize;

my $item2 = App::mykeep::Item->new({
    text => 'test item 2 (deleted)',
	modifiedAt => $start,
	labels => ['l2', 'l1'],
    status => 'deleted',
});
$item2->normalize;

my $client = App::mykeep::Client->new();

my @items = $client->list_items( items => [$item,$item2]);
is_deeply \@items, [$item], "Deleted items do not show up by default";

@items = $client->list_items( items => [$item,$item2], status => ['all']);
is_deeply \@items, [$item,$item2], "Listing all items lists all items";

@items = $client->list_items( items => [$item,$item2], status => ['deleted']);
is_deeply \@items, [$item2], "Listing all deleted items lists all deleted items";


done_testing;