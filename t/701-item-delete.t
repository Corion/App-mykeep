#!perl -w
use strict;
use Test::More tests => 3;
use Data::Dumper;

use App::mykeep::Item;
use App::mykeep::Client;

my $start = time;
my $item = App::mykeep::Item->new({
    text => 'test item 1',
	modifiedAt => $start,
	labels => ['l1', 'l2'],
    status => 'active',
});
$item->normalize;

$item->delete;

is $item->status, 'deleted', "Deleting sets an items status";
cmp_ok $item->deletedAt, '!=', 0, "Deleting sets its timestamp";

my $last_deleted = $item->deletedAt;

sleep 2;
$item->delete;

is $item->deletedAt, $item->deletedAt, "Deleting again doesn't update the deletion timestamp";

done_testing;