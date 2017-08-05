#!perl -w
use strict;
use Test::More tests => 2;

use App::mykeep::Item;
use App::mykeep::Client;

my $start = time;
my $item = App::mykeep::Item->new({
    text => 'test item 1',
	modifiedAt => $start,
	labels => ['l1', 'l2'],
});

my $item2 = App::mykeep::Item->new({
    text => 'test item 2',
	modifiedAt => $start,
	labels => ['l2', 'l1'],
});

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

done_testing;