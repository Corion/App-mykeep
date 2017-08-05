#!perl -w
use strict;
use Test::More tests => 4;
use Data::Dumper;

use App::mykeep::Item;
use App::mykeep::Client;

my $start = time;
my $item = App::mykeep::Item->new({
    text => 'test item 1',
	modifiedAt => $start,
	labels => ['l1', 'l2'],
});
$item->normalize;

my $item2 = App::mykeep::Item->new({
    text => 'test item 2',
	modifiedAt => $start,
	labels => ['l2', 'l1'],
});
$item2->normalize;

my $p = $item2->payload;
my $changed_item2 = App::mykeep::Item->new($p);
$changed_item2->text('test item 3');
$changed_item2->modifiedAt($start+2);
@{$changed_item2->labels} = ('l2', 'l3');

my $client = App::mykeep::Client->new();

my %actions = $client->sync_actions(
    local  => [$item,$item2],
    remote => [$item,$item2],
);

is_deeply \%actions, {
    upload_remote => [],
    save_local    => [],
}, "Same items force no updates";

%actions = $client->sync_actions(
    local  => [$item,$item2],
    remote => [$item2,$item],
);

is_deeply \%actions, {
    upload_remote => [],
    save_local    => [],
}, "Same items force no updates, even if the items are in different order";

%actions = $client->sync_actions(
    local  => [$item2],
    remote => [$changed_item2],
);

is_deeply \%actions, {
    upload_remote => [],
    save_local    => [$changed_item2],
}, "Newer item wins in the default strategy";

%actions = $client->sync_actions(
    local  => [$changed_item2],
    remote => [$item2],
);

is_deeply \%actions, {
    upload_remote => [$changed_item2],
    save_local    => [],
}, "Newer item wins in the default strategy";

done_testing;